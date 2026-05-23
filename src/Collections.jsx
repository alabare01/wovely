import { useEffect, useMemo, useState } from "react";
import { T, useBreakpoint } from "./theme.jsx";
import UpgradeNudge from "./components/UpgradeNudge.jsx";
import {
  listCollections,
  listPatternsInCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  unlinkPatternFromCollection,
  setPatternOrder,
  getMonthlyCollectionUsage,
  mergeMaterials,
  aggregatePct,
} from "./utils/collections.js";
import { TIER_CRAFT } from "./utils/tierUtils.js";

// Standard glass card spec used throughout — matches the rest of the
// app. Kept inline rather than imported so this file is self-contained.
const GLASS = {
  background: "rgba(255,255,255,0.82)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.45)",
  borderRadius: 16,
  boxShadow: "0 4px 24px rgba(45,58,124,0.08)",
};

const PAGE = { maxWidth: 960, margin: "0 auto", padding: "24px 24px" };

// Tiny percent helper — matches the one in App.jsx so progress numbers
// stay in sync across views without an import cycle.
const pctOf = (rows) => {
  const checkable = (rows || []).filter(r => !r.isHeader && !r.isNoteOnly);
  return checkable.length ? Math.round(checkable.filter(r => r.done).length / checkable.length * 100) : 0;
};

const fmtDate = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch { return ""; }
};

// ─── List view ───────────────────────────────────────────────────────────

export const CollectionsListView = ({ tier, onOpenDetail, onStartCreate, onOpenUpgrade }) => {
  const { isDesktop } = useBreakpoint();
  const isCraft = tier === TIER_CRAFT;
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    if (!isCraft) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const [{ data: cols }, { data: u }] = await Promise.all([
        listCollections(),
        getMonthlyCollectionUsage(),
      ]);
      if (cancelled) return;
      setCollections(cols || []);
      setUsage(u || null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isCraft]);

  if (!isCraft) {
    return (
      <div style={PAGE}>
        <div style={{ fontFamily: T.serif, fontSize: 28, fontWeight: 700, color: T.ink, marginBottom: 8 }}>Collections</div>
        <div style={{ fontSize: 14, color: T.ink2, lineHeight: 1.6, marginBottom: 20 }}>
          Group related patterns into MKALs, designer bundles, or pattern sets. Bev keeps the progress and materials in one place.
        </div>
        <UpgradeNudge feature="collections" currentTier={tier} onUpgrade={onOpenUpgrade} dismissible={false} />
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ ...PAGE, textAlign: "center", paddingTop: 80 }}>
        <div className="spinner" style={{ width: 28, height: 28, border: `3px solid ${T.border}`, borderTopColor: T.terra, borderRadius: "50%", margin: "0 auto" }} />
      </div>
    );
  }

  const atCap = usage && usage.available <= 0;
  const handleNew = () => {
    if (atCap) return;
    onStartCreate?.();
  };

  return (
    <div style={PAGE}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: T.serif, fontSize: 28, fontWeight: 700, color: T.ink, lineHeight: 1.1 }}>Collections</div>
          <div style={{ fontSize: 13, color: T.ink3, marginTop: 6 }}>
            {collections.length === 0
              ? "Group related patterns together."
              : `${collections.length} ${collections.length === 1 ? "collection" : "collections"} · ${usage?.available ?? 3} of ${usage?.cap ?? 3} new available this month`}
          </div>
        </div>
        <button
          onClick={handleNew}
          disabled={atCap}
          style={{
            background: atCap ? T.linen : T.terra,
            color: atCap ? T.ink3 : "#fff",
            border: "none",
            borderRadius: 9999,
            padding: "11px 20px",
            fontSize: 14,
            fontWeight: 600,
            cursor: atCap ? "not-allowed" : "pointer",
            boxShadow: atCap ? "none" : "0 4px 16px rgba(155,126,200,0.3)",
          }}
        >+ New Collection</button>
      </div>

      {atCap && usage?.nextSlotAt && (
        <div style={{ ...GLASS, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: T.ink2, lineHeight: 1.5 }}>
          You've used all {usage.cap} collections this month. Next slot available {fmtDate(usage.nextSlotAt)}.
        </div>
      )}

      {collections.length === 0 ? (
        <div style={{ ...GLASS, padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontFamily: T.serif, fontSize: 20, fontWeight: 700, color: T.ink, marginBottom: 8 }}>
            Start your first collection
          </div>
          <div style={{ fontSize: 14, color: T.ink2, lineHeight: 1.6, marginBottom: 20, maxWidth: 440, margin: "0 auto 20px" }}>
            Perfect for MKALs, designer bundles, and matching sets. Import multiple patterns and Bev keeps them in one place with unified materials and progress.
          </div>
          <button
            onClick={handleNew}
            style={{ background: T.terra, color: "#fff", border: "none", borderRadius: 12, padding: "13px 26px", fontSize: 14, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(155,126,200,0.3)" }}
          >Create a Collection</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1fr 1fr 1fr" : "1fr", gap: 16 }}>
          {collections.map(c => (
            <CollectionCard key={c.id} c={c} onOpen={() => onOpenDetail?.(c)} />
          ))}
        </div>
      )}
    </div>
  );
};

// Card on the list view. Loads its own patterns to compute pattern
// count and aggregate progress — keeps the list query simple but means
// each card does a small follow-up fetch.
const CollectionCard = ({ c, onOpen }) => {
  const [patterns, setPatterns] = useState([]);
  useEffect(() => {
    let cancelled = false;
    listPatternsInCollection(c.id).then(({ data }) => {
      if (!cancelled) setPatterns(data || []);
    });
    return () => { cancelled = true; };
  }, [c.id]);

  const progress = aggregatePct(patterns);
  const cover = c.cover_image_url || patterns.find(p => p.cover_image_url)?.cover_image_url || null;
  const isMkal = c.collection_type === "mkal";
  const countLabel = isMkal
    ? `${patterns.length} ${patterns.length === 1 ? "clue" : "clues"}`
    : `${patterns.length} ${patterns.length === 1 ? "pattern" : "patterns"}`;

  return (
    <div
      onClick={onOpen}
      className="card"
      style={{ ...GLASS, padding: 16, cursor: "pointer", display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", aspectRatio: "16/10", background: T.linen }}>
        {cover ? (
          <img src={cover} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, opacity: 0.4 }}>📚</div>
        )}
        <div style={{ position: "absolute", top: 8, left: 8, background: isMkal ? T.terra : "rgba(45,58,124,0.85)", color: "#fff", borderRadius: 99, padding: "3px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {isMkal ? "MKAL" : "Collection"}
        </div>
      </div>
      <div>
        <div style={{ fontFamily: T.serif, fontSize: 17, fontWeight: 700, color: T.ink, lineHeight: 1.2, marginBottom: 4 }}>{c.name}</div>
        <div style={{ fontSize: 12, color: T.ink3, display: "flex", gap: 8, alignItems: "center" }}>
          <span>{countLabel}</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>{fmtDate(c.created_at)}</span>
        </div>
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.ink3, marginBottom: 4 }}>
          <span>Progress</span>
          <span style={{ fontWeight: 600, color: progress === 100 ? T.sage : T.terra }}>{progress}%</span>
        </div>
        <div style={{ background: T.border, borderRadius: 99, height: 4, overflow: "hidden" }}>
          <div style={{ width: `${progress}%`, height: 4, background: progress === 100 ? T.sage : T.terra, borderRadius: 99, transition: "width .3s ease" }} />
        </div>
      </div>
    </div>
  );
};

// ─── Detail view ─────────────────────────────────────────────────────────

export const CollectionDetailView = ({ collection: initial, onBack, onOpenPattern, onAddPattern, onImportClue, onCollectionChanged, onCollectionDeleted }) => {
  const { isDesktop } = useBreakpoint();
  const [collection, setCollection] = useState(initial);
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingHeader, setEditingHeader] = useState(false);
  const [draft, setDraft] = useState({ name: initial.name, description: initial.description || "", collection_type: initial.collection_type || "general" });
  const [showMaterials, setShowMaterials] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = async () => {
    const { data } = await listPatternsInCollection(collection.id);
    setPatterns(data || []);
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [collection.id]);

  const isMkal = collection.collection_type === "mkal";
  const progress = aggregatePct(patterns);
  const materials = useMemo(() => mergeMaterials(patterns), [patterns]);

  const saveHeader = async () => {
    const patch = {
      name: draft.name.trim() || "Untitled Collection",
      description: draft.description.trim() || null,
      collection_type: draft.collection_type,
    };
    const { data, error } = await updateCollection(collection.id, patch);
    if (error) { console.warn("[Wovely] updateCollection failed:", error); return; }
    if (data) {
      setCollection(data);
      onCollectionChanged?.(data);
    }
    setEditingHeader(false);
  };

  const handleDelete = async () => {
    const { error } = await deleteCollection(collection.id);
    if (error) { console.warn("[Wovely] deleteCollection failed:", error); return; }
    setConfirmDelete(false);
    onCollectionDeleted?.(collection.id);
  };

  const move = async (idx, dir) => {
    const next = [...patterns];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    // Re-number 1-based so the labels stay clean even after multiple moves.
    setPatterns(next);
    for (let i = 0; i < next.length; i++) {
      const desiredOrder = i + 1;
      if (next[i].collection_order !== desiredOrder) {
        // eslint-disable-next-line no-await-in-loop
        await setPatternOrder(next[i].id, desiredOrder);
      }
    }
  };

  const handleRemove = async (patternId) => {
    await unlinkPatternFromCollection(patternId);
    setPatterns(prev => prev.filter(p => p.id !== patternId));
  };

  if (loading) {
    return (
      <div style={{ ...PAGE, textAlign: "center", paddingTop: 80 }}>
        <div className="spinner" style={{ width: 28, height: 28, border: `3px solid ${T.border}`, borderTopColor: T.terra, borderRadius: "50%", margin: "0 auto" }} />
      </div>
    );
  }

  return (
    <div style={PAGE}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: T.terra, cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 18, display: "flex", alignItems: "center", gap: 6 }}>← My Wovely</button>

      <div style={{ ...GLASS, padding: 22, marginBottom: 16 }}>
        {!editingHeader ? (
          <div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div style={{ background: isMkal ? T.terra : "rgba(45,58,124,0.85)", color: "#fff", borderRadius: 99, padding: "3px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {isMkal ? "MKAL" : "Collection"}
                  </div>
                  <div style={{ fontSize: 12, color: T.ink3 }}>
                    {isMkal
                      ? `${patterns.length} ${patterns.length === 1 ? "clue" : "clues"}`
                      : `${patterns.length} ${patterns.length === 1 ? "pattern" : "patterns"}`}
                  </div>
                </div>
                <div style={{ fontFamily: T.serif, fontSize: 26, fontWeight: 700, color: T.ink, lineHeight: 1.15, marginBottom: 6 }}>{collection.name}</div>
                {collection.description && (
                  <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.6, marginBottom: 8 }}>{collection.description}</div>
                )}
              </div>
              <button
                onClick={() => setEditingHeader(true)}
                style={{ background: T.linen, border: `1px solid ${T.border}`, borderRadius: 99, padding: "6px 12px", fontSize: 12, color: T.ink2, cursor: "pointer", fontWeight: 600, flexShrink: 0 }}
              >Edit</button>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.ink3, marginBottom: 6 }}>
                <span>Overall progress</span>
                <span style={{ fontWeight: 700, color: progress === 100 ? T.sage : T.terra }}>{progress}%</span>
              </div>
              <div style={{ background: T.border, borderRadius: 99, height: 6, overflow: "hidden" }}>
                <div style={{ width: `${progress}%`, height: 6, background: progress === 100 ? T.sage : T.terra, borderRadius: 99, transition: "width .3s ease" }} />
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              autoFocus
              value={draft.name}
              onChange={e => setDraft({ ...draft, name: e.target.value })}
              placeholder="Collection name"
              style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${T.terra}`, borderRadius: 10, fontSize: 16, fontWeight: 600, color: T.ink, background: T.linen, outline: "none", fontFamily: T.serif }}
            />
            <textarea
              value={draft.description}
              onChange={e => setDraft({ ...draft, description: e.target.value })}
              placeholder="Optional description"
              rows={2}
              style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${T.border}`, borderRadius: 10, fontSize: 13, color: T.ink, background: T.linen, outline: "none", resize: "vertical", fontFamily: T.sans }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              {[{ k: "mkal", label: "MKAL (ordered)" }, { k: "general", label: "General" }].map(o => (
                <button
                  key={o.k}
                  onClick={() => setDraft({ ...draft, collection_type: o.k })}
                  style={{
                    flex: 1, padding: "10px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    background: draft.collection_type === o.k ? T.terra : "transparent",
                    color: draft.collection_type === o.k ? "#fff" : T.ink2,
                    border: `1.5px solid ${draft.collection_type === o.k ? T.terra : T.border}`,
                  }}
                >{o.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => { setEditingHeader(false); setDraft({ name: collection.name, description: collection.description || "", collection_type: collection.collection_type || "general" }); }} style={{ background: T.linen, border: `1px solid ${T.border}`, borderRadius: 99, padding: "8px 16px", fontSize: 12, color: T.ink2, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
              <button onClick={saveHeader} style={{ background: T.terra, color: "#fff", border: "none", borderRadius: 99, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Save</button>
            </div>
          </div>
        )}
      </div>

      {materials.length > 0 && (
        <div style={{ ...GLASS, marginBottom: 16 }}>
          <button
            onClick={() => setShowMaterials(s => !s)}
            style={{ width: "100%", background: "transparent", border: "none", padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: T.sans }}
          >
            <span style={{ fontFamily: T.serif, fontSize: 15, fontWeight: 700, color: T.ink }}>Unified materials</span>
            <span style={{ fontSize: 12, color: T.ink3 }}>{materials.length} {materials.length === 1 ? "item" : "items"} · {showMaterials ? "▼" : "▶"}</span>
          </button>
          {showMaterials && (
            <div style={{ padding: "0 18px 16px" }}>
              {materials.map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderTop: i === 0 ? "none" : `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 13, color: T.ink2 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: T.ink3, fontWeight: 600 }}>{m.amount || (m.yardage > 0 ? `~${m.yardage} yds` : "")}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {patterns.length === 0 ? (
        <div style={{ ...GLASS, padding: "32px 24px", textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: T.serif, fontSize: 17, fontWeight: 700, color: T.ink, marginBottom: 8 }}>No patterns yet</div>
          <div style={{ fontSize: 13, color: T.ink2, marginBottom: 16 }}>{isMkal ? "Import Clue 1 to get started." : "Add the first pattern to this collection."}</div>
          <button onClick={() => onAddPattern?.(collection)} style={{ background: T.terra, color: "#fff", border: "none", borderRadius: 12, padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(155,126,200,0.3)" }}>{isMkal ? "Import Clue 1" : "Add a Pattern"}</button>
        </div>
      ) : isMkal ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {patterns.map((p, idx) => (
            <PatternRow
              key={p.id}
              p={p}
              idx={idx}
              total={patterns.length}
              onOpen={() => onOpenPattern?.(p)}
              onMoveUp={() => move(idx, -1)}
              onMoveDown={() => move(idx, 1)}
              onRemove={() => handleRemove(p.id)}
            />
          ))}
          {/* Greyed-out next-clue placeholder. Single slot — we don't
              persist a total clue count for the MKAL today, so we only
              expose the one immediately-next position. Tapping it
              triggers the import flow with the target order pre-set. */}
          <UnimportedClueSlot
            clueNumber={patterns.length + 1}
            onImport={() => (onImportClue ? onImportClue(collection, patterns.length + 1) : onAddPattern?.(collection))}
          />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1fr 1fr 1fr" : "1fr 1fr", gap: 12, marginBottom: 16 }}>
          {patterns.map(p => (
            <PatternTile key={p.id} p={p} onOpen={() => onOpenPattern?.(p)} onRemove={() => handleRemove(p.id)} />
          ))}
        </div>
      )}

      <button
        onClick={() => onAddPattern?.(collection)}
        style={{ width: "100%", background: T.terra, color: "#fff", border: "none", borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(155,126,200,0.3)", marginBottom: 24 }}
      >{isMkal ? "Import Next Clue" : "Add a Pattern"}</button>

      <div style={{ textAlign: "center", paddingTop: 8 }}>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} style={{ background: "none", border: "none", color: T.ink3, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>Delete this collection</button>
        ) : (
          <div style={{ ...GLASS, padding: 16 }}>
            <div style={{ fontSize: 13, color: T.ink2, marginBottom: 12, lineHeight: 1.5 }}>Patterns will stay in your library. Only the collection grouping is removed.</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button onClick={() => setConfirmDelete(false)} style={{ background: T.linen, border: `1px solid ${T.border}`, borderRadius: 99, padding: "8px 16px", fontSize: 12, color: T.ink2, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
              <button onClick={handleDelete} style={{ background: "#C0544A", color: "#fff", border: "none", borderRadius: 99, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Delete Collection</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Placeholder slot for the next un-imported clue in an MKAL collection.
// Visually a dashed greyed-out card so the user reads it as "empty slot",
// not as a duplicate of imported rows. Includes Bev so the empty state
// stays on-brand instead of feeling like an error state.
const UnimportedClueSlot = ({ clueNumber, onImport }) => (
  <div
    onClick={onImport}
    role="button"
    tabIndex={0}
    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onImport?.(); } }}
    style={{
      background: "rgba(253,251,255,0.7)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      border: "2px dashed #D4C5ED",
      borderRadius: 16,
      padding: 14,
      display: "flex",
      alignItems: "center",
      gap: 14,
      cursor: "pointer",
      transition: "border-color .15s, background .15s",
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = T.terra; e.currentTarget.style.background = "rgba(243,239,248,0.85)"; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = "#D4C5ED"; e.currentTarget.style.background = "rgba(253,251,255,0.7)"; }}
  >
    <div style={{ width: 56, height: 56, borderRadius: 10, background: "linear-gradient(135deg,#EDE4F7,#F5F0FA)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <img src="/bev_neutral.png" alt="" style={{ width: 48, height: 48, objectFit: "contain", opacity: 0.85 }} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: T.terra, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>Clue {clueNumber}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: T.ink2, lineHeight: 1.25, marginBottom: 2 }}>Not yet imported</div>
      <div style={{ fontSize: 12, color: T.ink3 }}>Tap to import Clue {clueNumber}</div>
    </div>
    <div style={{ fontSize: 18, color: T.terra, fontWeight: 600, flexShrink: 0, paddingRight: 6 }}>+</div>
  </div>
);

// Pattern row used by MKAL detail (ordered, with up/down).
const PatternRow = ({ p, idx, total, onOpen, onMoveUp, onMoveDown, onRemove }) => {
  const prog = pctOf(p.rows);
  const cover = p.cover_image_url || p.photo;
  return (
    <div style={{ ...GLASS, padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 56, height: 56, borderRadius: 10, overflow: "hidden", background: T.linen, flexShrink: 0 }}>
        {cover ? <img src={cover} alt={p.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, opacity: 0.4 }}>🧶</div>}
      </div>
      <div onClick={onOpen} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
        <div style={{ fontSize: 10, color: T.terra, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>Clue {idx + 1}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, lineHeight: 1.25, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title || "Untitled"}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, background: T.border, borderRadius: 99, height: 3, overflow: "hidden" }}>
            <div style={{ width: `${prog}%`, height: 3, background: prog === 100 ? T.sage : T.terra, borderRadius: 99 }} />
          </div>
          <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, minWidth: 30, textAlign: "right" }}>{prog}%</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
        <button disabled={idx === 0} onClick={onMoveUp} style={{ background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer", color: idx === 0 ? T.ink3 : T.ink2, fontSize: 14, padding: "2px 6px", opacity: idx === 0 ? 0.3 : 1 }} aria-label="Move up">▲</button>
        <button disabled={idx === total - 1} onClick={onMoveDown} style={{ background: "none", border: "none", cursor: idx === total - 1 ? "default" : "pointer", color: idx === total - 1 ? T.ink3 : T.ink2, fontSize: 14, padding: "2px 6px", opacity: idx === total - 1 ? 0.3 : 1 }} aria-label="Move down">▼</button>
      </div>
      <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: T.ink3, fontSize: 16, padding: "4px 6px", flexShrink: 0 }} aria-label="Remove from collection">×</button>
    </div>
  );
};

const PatternTile = ({ p, onOpen, onRemove }) => {
  const prog = pctOf(p.rows);
  const cover = p.cover_image_url || p.photo;
  return (
    <div className="card" style={{ ...GLASS, padding: 10, cursor: "pointer", position: "relative" }}>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        style={{ position: "absolute", top: 8, right: 8, background: "rgba(255,255,255,0.9)", border: "none", borderRadius: "50%", width: 24, height: 24, cursor: "pointer", color: T.ink3, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}
        aria-label="Remove from collection"
      >×</button>
      <div onClick={onOpen}>
        <div style={{ aspectRatio: "1", borderRadius: 10, overflow: "hidden", background: T.linen, marginBottom: 8 }}>
          {cover ? <img src={cover} alt={p.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, opacity: 0.4 }}>🧶</div>}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, lineHeight: 1.25, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title || "Untitled"}</div>
        <div style={{ background: T.border, borderRadius: 99, height: 3, overflow: "hidden" }}>
          <div style={{ width: `${prog}%`, height: 3, background: prog === 100 ? T.sage : T.terra, borderRadius: 99 }} />
        </div>
      </div>
    </div>
  );
};

// ─── Create modal ────────────────────────────────────────────────────────

// Lightweight create modal used by the "+ New Collection" button when
// the user hasn't picked the multi-file import path. Lets them name a
// collection and pick the type without committing to a multi-file
// import session — they can add patterns one at a time from inside the
// detail view instead.
export const NewCollectionModal = ({ onClose, onCreated }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("mkal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setError(null);
    setSaving(true);
    const { data, error: err } = await createCollection({
      name: name.trim() || "Untitled Collection",
      description: description.trim() || null,
      collection_type: type,
    });
    setSaving(false);
    if (err) { setError(err); return; }
    onCreated?.(data);
  };

  // Centered overlay on every viewport (matches AuthWallModal style),
  // capped at 480px wide with breathing room around the edges. Earlier
  // iteration was a bottom sheet on mobile which read as full-screen.
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(28,23,20,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(28,23,20,0.28)", fontFamily: T.sans, boxSizing: "border-box" }}>
        <div style={{ fontFamily: T.serif, fontSize: 22, fontWeight: 700, color: T.ink, marginBottom: 6 }}>New collection</div>
        <div style={{ fontSize: 13, color: T.ink2, marginBottom: 18, lineHeight: 1.5 }}>Name it, pick a type, then add patterns from the collection page.</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Lemon Drop MKAL 2026" style={{ width: "100%", padding: "11px 14px", border: `1.5px solid ${T.border}`, borderRadius: 10, fontSize: 14, color: T.ink, background: T.linen, outline: "none", marginBottom: 10 }} onFocus={e => e.target.style.borderColor = T.terra} onBlur={e => e.target.style.borderColor = T.border} />
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" rows={2} style={{ width: "100%", padding: "11px 14px", border: `1.5px solid ${T.border}`, borderRadius: 10, fontSize: 13, color: T.ink, background: T.linen, outline: "none", marginBottom: 12, resize: "vertical", fontFamily: T.sans }} />
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[{ k: "mkal", label: "MKAL (ordered)" }, { k: "general", label: "General" }].map(o => (
            <button key={o.k} onClick={() => setType(o.k)} style={{ flex: 1, padding: "10px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer", background: type === o.k ? T.terra : "transparent", color: type === o.k ? "#fff" : T.ink2, border: `1.5px solid ${type === o.k ? T.terra : T.border}` }}>{o.label}</button>
          ))}
        </div>
        {error && <div style={{ fontSize: 12, color: "#C0544A", marginBottom: 10 }}>{String(error).slice(0, 200)}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: T.linen, border: `1px solid ${T.border}`, borderRadius: 99, padding: "10px 18px", fontSize: 13, color: T.ink2, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
          <button onClick={submit} disabled={saving} style={{ background: T.terra, color: "#fff", border: "none", borderRadius: 99, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "Creating…" : "Create Collection"}</button>
        </div>
      </div>
    </div>
  );
};

export default CollectionsListView;
