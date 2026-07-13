import React, { useState, useEffect, useCallback } from "react";
import { T } from "./theme.jsx";
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseAuth, getSession } from "./supabase.js";

/* ─────────────────────────────────────────────────────────────────────────────
   Yarn Circle — the community feed (Tier B #2).
   Built to design/Wovely Yarn Circle.dc.html + 20 Product/(C) Yarn Circle Feed
   — Design Spec. Inline-styled with the shared `T` 2b tokens. Canon: gold is
   scarce (none here); the Lovely is CORAL.

   Backend (wired 2026-07-13): reuses the existing tables —
     finished_objects  → posts (photo_url, caption, pattern_*, yarn/hook labels,
                          is_pick, maker_name/avatar_color denormalized at share)
     fo_likes          → Lovelies (post_id=fo_id, user_id; toggle)
     fo_comments       → comments (fo_id, user_id, author_name, avatar_color, body)
   RLS: public read, authed insert/delete own. Guests can browse; love/comment
   route to sign-in. Counts are read client-side (low volume, pre-launch).
   `demo` injects the reference makes for visual verification; with no rows the
   feed shows the Bev-led empty state (the real launch reality).
   NOTE: "Share a Lovely" (composing a finished make w/ photo + pattern) opens
   the existing add flow for now — the dedicated share composer is a follow-up.
   ──────────────────────────────────────────────────────────────────────────── */

const AV = { accent: T.accent, coral: T.coral, mint: T.mint, sky: T.sky, pink: T.pink };
const TINTS = [["#7FB9AC", "#5EC9AE"], ["#C25B4A", "#E7907C"], ["#C98BE0", "#E3B7F0"], ["#6F9BE0", "#A9C9F5"], ["#E0A94A", "#F2D08A"]];
const tintFor = (id) => { let h = 0; const s = String(id || ""); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return TINTS[h % TINTS.length]; };
const initialOf = (name) => (String(name || "?").trim()[0] || "?").toUpperCase();
function relTime(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  const d = Math.floor(s / 86400);
  if (d === 1) return "Yesterday";
  if (d < 7) return d + " days ago";
  return new Date(iso).toLocaleDateString();
}
const apiHeaders = () => {
  const s = getSession();
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${s?.access_token || SUPABASE_ANON_KEY}`, "Content-Type": "application/json" };
};

const WEEKLY_THEME = { title: "Tiny & Round", blurb: "Share a palm-sized make by Sunday. Bev picks a favorite Monday morning.", count: 12 };
const NOTICE = [
  { icon: "sparkle", t: "The Yarn Circle is open", s: "New from Wovely: share finished makes, send Lovelies" },
  { icon: "heart", t: "Marisol shared Mellow the Manatee", s: "2h ago · Bev's pick · 48 Lovelies" },
  { icon: "clock", t: "Weekly theme ends Sunday", s: "Tiny & Round · 12 makes in · pick is Monday AM" },
];

const DEMO_POSTS = [
  { id: "p1", maker_name: "Marisol", avatar_color: "coral", meta: "2h ago · Frankfort, MI", is_pick: true, is_own: false, tint: TINTS[0],
    pattern_id: "demo-manatee", pattern_title: "Mellow the Manatee",
    caption: "finally finished! The color changes fought me but Bev's row counter kept me honest. So squishy.",
    yarn_label: "Worsted · seafoam", hook_label: "4.0mm hook", love_count: 48, loved_by_me: false, comment_count: 6,
    comments: [
      { author_name: "Bev", avatar_color: "accent", isBev: true, body: "The seafoam gradient is chef's kiss. Adding you to Monday's shortlist." },
      { author_name: "Jen", avatar_color: "sky", body: "Okay this is the third manatee I've seen today and now I need one." },
    ] },
  { id: "p2", maker_name: "Adam", avatar_color: "accent", meta: "Yesterday · your make", is_pick: false, is_own: true, tint: TINTS[1],
    pattern_id: "demo-mushroom", pattern_title: "Button the Mushroom",
    caption: "first amigurumi off the hook. The magic ring took four tries. Worth it.",
    yarn_label: "Worsted · brick red", hook_label: "3.5mm hook", love_count: 9, loved_by_me: false, comment_count: 2,
    comments: [
      { author_name: "Priya", avatar_color: "mint", body: "The little face! Instant serotonin." },
      { author_name: "Bev", avatar_color: "accent", isBev: true, body: "First one off the hook and it is this clean? Show-off (proud of you)." },
    ] },
  { id: "p3", maker_name: "Priya", avatar_color: "mint", meta: "2 days ago", is_pick: false, is_own: false, tint: TINTS[2],
    pattern_id: "demo-honeybee", pattern_title: "Buzz the Honeybee",
    caption: "made for my niece. She named him before the wings were done.",
    yarn_label: "DK · marigold", hook_label: "3.0mm hook", love_count: 21, loved_by_me: false, comment_count: 1,
    comments: [{ author_name: "Marisol", avatar_color: "coral", body: "Naming it before it's done is the whole hobby honestly." }] },
];

/* ── icons ── */
const svg = (p, sw = 1.9) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{p}</svg>);
const IC = {
  heart: (fill) => (<svg width="17" height="17" viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20.3l-1.4-1.3C5.4 14.3 2.5 11.6 2.5 8.4 2.5 6 4.4 4.2 6.7 4.2c1.3 0 2.6.6 3.3 1.6.7-1 2-1.6 3.3-1.6 2.3 0 4.2 1.8 4.2 4.2 0 3.2-2.9 5.9-8.1 10.6z" /></svg>),
  comment: svg(<path d="M20 11.5a7.5 7.5 0 01-10.9 6.7L4.5 19l1-4.1A7.5 7.5 0 1120 11.5z" />),
  send: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>,
  plus: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>,
  sparkle: svg(<path d="M12 4.2l1.5 4.3 4.3 1.5-4.3 1.5L12 15.8l-1.5-4.3L6.2 10l4.3-1.5z" />),
  clock: svg(<><circle cx="12" cy="12" r="8.3" /><path d="M12 7.5V12l3 2" /></>),
  patternic: svg(<><path d="M5 4.5A1.5 1.5 0 016.5 3H18v18H6.5A1.5 1.5 0 015 19.5z" /><path d="M9 3v18" /></>),
};

function Avatar({ initial, color = "accent", size = 42, ring = true }) {
  const c = AV[color] || T.accent;
  return (<div style={{ width: size, height: size, borderRadius: "50%", flex: "none", background: c, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.disp, fontWeight: 600, fontSize: size * 0.42, border: ring ? "2.5px solid #fff" : "none", boxShadow: ring ? "0 6px 14px -6px rgba(90,66,160,.5)" : "none" }}>{initial}</div>);
}
function BevAvatar({ size = 42, ring = true }) {
  return <img src="/bev.png" alt="Bev" style={{ width: size, height: size, borderRadius: "50%", flex: "none", objectFit: "cover", background: "#EFE9FB", border: ring ? "2.5px solid #fff" : "none", boxShadow: ring ? "0 6px 14px -6px rgba(90,66,160,.5)" : "none" }} />;
}

const card = { background: "#fff", border: `1px solid ${T.line}`, borderRadius: 22, boxShadow: T.shadowLg };
const pill = { display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, fontFamily: T.body, fontWeight: 800, cursor: "pointer" };

function PatternChip({ title, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "inline-flex", alignItems: "center", gap: 10, background: T.soft, border: `1px solid ${hov ? T.accent : "#E2D8F7"}`, borderRadius: 14, padding: "8px 13px 8px 8px", cursor: "pointer", transition: ".15s", boxShadow: hov ? `0 8px 18px -12px ${T.accent}` : "none", maxWidth: "100%" }}>
      <span style={{ width: 30, height: 30, borderRadius: 9, background: "#fff", color: T.accentD, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", border: `1px solid ${T.line}` }}>{IC.patternic}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 9.5, fontWeight: 800, letterSpacing: ".09em", textTransform: "uppercase", color: T.muted }}>Made from</span>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: T.accentD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
      </span>
    </div>
  );
}
function Chip({ children }) {
  return <span style={{ ...pill, cursor: "default", background: "#fff", border: `1px solid ${T.line}`, color: T.muted, fontSize: 12, padding: "7px 13px" }}>{children}</span>;
}

function PostCard({ post, onOpenPattern, canInteract, onSignIn, onLove, onComment, onLoadComments }) {
  const [loved, setLoved] = useState(!!post.loved_by_me);
  const [loveCount, setLoveCount] = useState(post.love_count || 0);
  const [open, setOpen] = useState(!!post.comments_open);
  const [comments, setComments] = useState(post.comments || null);
  const [loadingC, setLoadingC] = useState(false);
  const [draft, setDraft] = useState("");
  const [expandAll, setExpandAll] = useState(false);

  const gate = (fn) => (canInteract ? fn() : onSignIn && onSignIn());
  const toggleLove = () => gate(() => {
    const next = !loved;
    setLoved(next); setLoveCount(c => c + (next ? 1 : -1));
    onLove && onLove(post, next);
  });
  const openComments = async () => {
    const willOpen = !open; setOpen(willOpen);
    if (willOpen && comments === null && onLoadComments) {
      setLoadingC(true);
      const c = await onLoadComments(post.id).catch(() => []);
      setComments(c || []); setLoadingC(false);
    }
  };
  const addComment = () => gate(async () => {
    const b = draft.trim(); if (!b) return;
    setComments(c => [...(c || []), { author_name: "You", avatar_color: "sky", body: b }]);
    setDraft("");
    onComment && onComment(post, b);
  });

  const list = comments || [];
  const shown = expandAll ? list : list.slice(0, 2);
  const hiddenCount = list.length - shown.length;
  const commentBtnCount = comments === null ? (post.comment_count || 0) : list.length;

  return (
    <div style={{ ...card, marginTop: 18, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "15px 18px" }}>
        <Avatar initial={post.avatar_initial || initialOf(post.maker_name)} color={post.avatar_color} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: T.body, fontWeight: 800, fontSize: 14.5, color: T.ink }}>{post.maker_name}</div>
          <div style={{ fontSize: 12, color: T.muted, fontWeight: 700 }}>{post.meta}</div>
        </div>
        {post.is_pick && (
          <span style={{ ...pill, cursor: "default", background: "#FFF1EE", border: "1px solid #FFD3C9", color: "#C2564A", fontSize: 11.5, padding: "5px 11px" }}>
            <span style={{ color: T.coral, display: "inline-flex" }}>{IC.sparkle}</span>Bev's pick
          </span>
        )}
      </div>
      {post.photo_url
        ? <div style={{ height: 330, background: "#EDE7F7" }}><img src={post.photo_url} alt={post.pattern_title || "make"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></div>
        : <div style={{ height: 330, background: `linear-gradient(135deg, ${(post.tint || tintFor(post.id))[0]}, ${(post.tint || tintFor(post.id))[1]})`, position: "relative" }}><div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(45deg,rgba(255,255,255,.06) 0 2px,transparent 2px 11px)" }} /></div>}
      <div style={{ padding: "15px 18px 17px" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: T.ink, lineHeight: 1.5, fontFamily: T.body }}>
          {post.pattern_title && <b style={{ fontWeight: 800 }}>{post.pattern_title}</b>}{post.pattern_title ? " — " : ""}{post.caption}
        </div>
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {post.pattern_id && <PatternChip title={post.pattern_title || "a pattern"} onClick={() => onOpenPattern && onOpenPattern(post.pattern_id)} />}
          {post.yarn_label && <Chip>{post.yarn_label}</Chip>}
          {post.hook_label && <Chip>{post.hook_label}</Chip>}
        </div>
        <div style={{ marginTop: 14, paddingTop: 13, borderTop: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button onClick={toggleLove} style={{ ...pill, border: `1.5px solid ${loved ? "#FFD3C9" : T.line}`, background: loved ? "#FFF1EE" : "#fff", color: loved ? "#C2564A" : T.muted, fontSize: 12.5, padding: "9px 15px" }}>
            <span style={{ color: T.coral, display: "inline-flex" }}>{IC.heart(loved)}</span>{loveCount} {loveCount === 1 ? "Lovely" : "Lovelies"}
          </button>
          <button onClick={openComments} style={{ ...pill, border: `1.5px solid ${T.line}`, background: "#fff", color: T.muted, fontSize: 12.5, padding: "9px 15px" }}>
            <span style={{ display: "inline-flex" }}>{IC.comment}</span>{commentBtnCount}
          </button>
          {!post.is_own && (
            <button onClick={() => gate(() => onOpenPattern && onOpenPattern(post.pattern_id))} style={{ ...pill, marginLeft: "auto", border: "none", background: T.soft, color: T.accentD, fontSize: 12.5, padding: "9px 15px" }}>
              <span style={{ display: "inline-flex" }}>{IC.plus}</span>Hook this too
            </button>
          )}
        </div>
        {open && (
          <div style={{ marginTop: 13, paddingTop: 13, borderTop: `1px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 11 }}>
            {loadingC && <div style={{ fontSize: 12.5, color: T.muted, fontWeight: 700 }}>Loading kind words…</div>}
            {shown.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                {c.isBev ? <BevAvatar size={30} ring={false} /> : <Avatar initial={initialOf(c.author_name)} color={c.avatar_color} size={30} ring={false} />}
                <div style={{ background: "#F5F2FC", borderRadius: 13, padding: "8px 13px", flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 800, fontSize: 12.5, color: c.isBev ? T.accentD : T.ink, fontFamily: T.body }}>{c.author_name}</span>
                  <div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.45, marginTop: 1, fontFamily: T.body }}>{c.body}</div>
                </div>
              </div>
            ))}
            {hiddenCount > 0 && (<button onClick={() => setExpandAll(true)} style={{ alignSelf: "flex-start", background: "none", border: "none", color: T.accentD, fontWeight: 800, fontSize: 12.5, cursor: "pointer", padding: "0 0 0 39px", fontFamily: T.body }}>View all {list.length} comments</button>)}
            <div style={{ display: "flex", gap: 9, alignItems: "center", marginTop: 2 }}>
              <Avatar initial="Y" color="sky" size={30} ring={false} />
              <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addComment(); }} onFocus={() => { if (!canInteract && onSignIn) onSignIn(); }} placeholder="Add a kind word…"
                style={{ flex: 1, minWidth: 0, border: `1.5px solid ${T.line}`, borderRadius: 999, padding: "9px 15px", fontFamily: T.body, fontSize: 13.5, color: T.ink, outline: "none", background: "#fff" }} />
              <button onClick={addComment} aria-label="Send" style={{ width: 34, height: 34, borderRadius: "50%", flex: "none", border: "none", background: T.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>{IC.send}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ComposeBar({ empty, onShare }) {
  return (
    <div style={{ ...card, display: "flex", alignItems: "center", gap: 13, padding: "13px 16px", marginTop: 4, background: "linear-gradient(100deg,#F5F1FD,#fff)" }}>
      <BevAvatar size={42} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.disp, fontWeight: 600, fontSize: 16, color: T.ink }}>{empty ? "Be the first to share" : "Finished something?"}</div>
        <div style={{ fontSize: 12.5, color: T.muted, fontWeight: 700 }}>{empty ? "Perfect time to set the tone." : "Show the circle. Bev loves a finished make."}</div>
      </div>
      <button onClick={onShare} style={{ ...pill, border: "none", background: T.accent, color: "#fff", fontSize: 13.5, padding: "11px 18px", boxShadow: `0 12px 24px -12px ${T.accent}`, flex: "none" }}>
        <span style={{ display: "inline-flex" }}>{IC.plus}</span>Share a Lovely
      </button>
    </div>
  );
}
function ThemeBanner({ theme, onShare }) {
  return (
    <div style={{ ...card, display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", marginTop: 14, background: "linear-gradient(100deg,#F1EBFF,#FBEEF0)" }}>
      <BevAvatar size={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.disp, fontWeight: 600, fontSize: 16, color: T.ink }}>Bev's weekly theme: {theme.title}</div>
        <div style={{ fontSize: 12.5, color: T.muted, fontWeight: 700, lineHeight: 1.45, marginTop: 1 }}>{theme.blurb} · {theme.count} in so far.</div>
      </div>
      <button onClick={onShare} style={{ ...pill, border: "none", background: T.accentD, color: "#fff", fontSize: 13, padding: "10px 17px", flex: "none" }}>Join in</button>
    </div>
  );
}
function Noticeboard() {
  return (
    <div style={{ ...card, padding: "16px 17px" }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: T.muted, marginBottom: 12 }}>The Noticeboard</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        {NOTICE.map((n, i) => (
          <div key={i} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, flex: "none", background: T.soft, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>{typeof IC[n.icon] === "function" ? IC[n.icon]() : IC[n.icon]}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: T.ink, lineHeight: 1.3, fontFamily: T.body }}>{n.t}</div>
              <div style={{ fontSize: 12, color: T.muted, fontWeight: 700, marginTop: 1 }}>{n.s}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function StatCard({ posts }) {
  const loves = posts.reduce((s, p) => s + (p.love_count || 0), 0);
  const makers = new Set(posts.map(p => p.maker_name)).size;
  const stats = [[posts.length, "makes shared"], [loves, "Lovelies sent"], [makers || 36, "makers"]];
  return (
    <div style={{ ...card, padding: "16px 17px", marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: T.muted, marginBottom: 12 }}>This week in the Circle</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        {stats.map(([n, l], i) => (
          <div key={i} style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontFamily: T.disp, fontWeight: 600, fontSize: 24, color: T.accent, lineHeight: 1 }}>{n}</div>
            <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
function EmptyState({ onShare }) {
  return (
    <div style={{ ...card, marginTop: 14, padding: "40px 28px 32px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <BevAvatar size={72} />
      <div style={{ fontFamily: T.disp, fontWeight: 600, fontSize: 24, color: T.ink, marginTop: 16 }}>The Circle is warming up</div>
      <div style={{ fontSize: 14, color: T.muted, fontWeight: 700, lineHeight: 1.55, maxWidth: 380, margin: "8px auto 20px" }}>No finished makes yet, and that is the fun part. Share your first and Bev sends the very first Lovely, every time. Someone has to start the pile.</div>
      <button onClick={onShare} style={{ ...pill, border: "none", background: T.accent, color: "#fff", fontSize: 14, padding: "13px 22px", boxShadow: `0 14px 26px -12px ${T.accent}` }}>
        <span style={{ display: "inline-flex" }}>{IC.plus}</span>Share your first make
      </button>
      <div style={{ display: "flex", gap: 12, marginTop: 26, width: "100%", maxWidth: 380 }}>
        {[0, 1, 2].map(i => <div key={i} style={{ flex: 1, height: 74, borderRadius: 14, background: T.soft, border: `1px dashed ${T.line}` }} />)}
      </div>
    </div>
  );
}

export default function YarnCircle({ isDesktop, isTablet, authed, isAnonymous, demo, onShare, onOpenPattern, onSignIn }) {
  const canInteract = !!authed && !isAnonymous;
  const [posts, setPosts] = useState(demo ? DEMO_POSTS : []);
  const [loading, setLoading] = useState(!demo);
  const twoCol = !!isDesktop;

  // Fetch the real feed: finished_objects + fo_likes (counts + my-likes) + comment counts.
  useEffect(() => {
    if (demo) return;
    let alive = true;
    (async () => {
      try {
        const uid = supabaseAuth.getUser()?.id || null;
        const [poRes, liRes, coRes] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/finished_objects?select=id,user_id,maker_name,avatar_color,photo_url,caption,pattern_id,pattern_title,yarn_label,hook_label,is_pick,created_at&order=created_at.desc&limit=40`, { headers: apiHeaders() }),
          fetch(`${SUPABASE_URL}/rest/v1/fo_likes?select=fo_id,user_id`, { headers: apiHeaders() }),
          fetch(`${SUPABASE_URL}/rest/v1/fo_comments?select=fo_id`, { headers: apiHeaders() }),
        ]);
        const rows = poRes.ok ? await poRes.json() : [];
        const likes = liRes.ok ? await liRes.json() : [];
        const coms = coRes.ok ? await coRes.json() : [];
        const loveCount = {}, mine = new Set(), comCount = {};
        for (const l of likes) { loveCount[l.fo_id] = (loveCount[l.fo_id] || 0) + 1; if (uid && l.user_id === uid) mine.add(l.fo_id); }
        for (const c of coms) comCount[c.fo_id] = (comCount[c.fo_id] || 0) + 1;
        const mapped = (rows || []).map(r => ({
          id: r.id, maker_name: r.maker_name || "A maker", avatar_initial: initialOf(r.maker_name), avatar_color: r.avatar_color || "accent",
          meta: relTime(r.created_at) + (uid && r.user_id === uid ? " · your make" : ""), is_pick: !!r.is_pick, is_own: !!(uid && r.user_id === uid),
          photo_url: r.photo_url || null, tint: tintFor(r.id), pattern_id: r.pattern_id || null, pattern_title: r.pattern_title || null,
          caption: r.caption || "", yarn_label: r.yarn_label || null, hook_label: r.hook_label || null,
          love_count: loveCount[r.id] || 0, loved_by_me: mine.has(r.id), comment_count: comCount[r.id] || 0, comments: null,
        }));
        if (alive) { setPosts(mapped); setLoading(false); }
      } catch { if (alive) { setPosts([]); setLoading(false); } }
    })();
    return () => { alive = false; };
  }, [demo]);

  const handleLove = useCallback((post, next) => {
    if (demo || !canInteract) return;
    const uid = supabaseAuth.getUser()?.id; if (!uid) return;
    if (next) fetch(`${SUPABASE_URL}/rest/v1/fo_likes`, { method: "POST", headers: { ...apiHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ fo_id: post.id, user_id: uid }) }).catch(() => {});
    else fetch(`${SUPABASE_URL}/rest/v1/fo_likes?fo_id=eq.${post.id}&user_id=eq.${uid}`, { method: "DELETE", headers: apiHeaders() }).catch(() => {});
  }, [demo, canInteract]);

  const handleComment = useCallback((post, body) => {
    if (demo || !canInteract) return;
    const user = supabaseAuth.getUser(); if (!user) return;
    fetch(`${SUPABASE_URL}/rest/v1/fo_comments`, { method: "POST", headers: { ...apiHeaders(), Prefer: "return=minimal" }, body: JSON.stringify({ fo_id: post.id, user_id: user.id, author_name: user.display_name || user.email?.split("@")[0] || "A maker", avatar_color: "sky", body }) }).catch(() => {});
  }, [demo, canInteract]);

  const loadComments = useCallback(async (foId) => {
    if (demo) return [];
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/fo_comments?fo_id=eq.${foId}&select=author_name,avatar_color,body,created_at&order=created_at.asc`, { headers: apiHeaders() });
      return res.ok ? await res.json() : [];
    } catch { return []; }
  }, [demo]);

  const empty = !loading && posts.length === 0;
  const rail = (<div style={{ position: twoCol ? "sticky" : "static", top: 84 }}><Noticeboard /><StatCard posts={posts} /></div>);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 0 48px" }}>
      <div style={{ marginBottom: 6 }}>
        <h1 style={{ fontFamily: T.disp, fontWeight: 600, fontSize: isDesktop ? 38 : 30, letterSpacing: "-.01em", color: T.ink, lineHeight: 1.05, margin: 0 }}>The Yarn Circle</h1>
        <div style={{ fontSize: 14.5, color: T.muted, fontWeight: 700, marginTop: 6 }}>Finished makes from the circle. Cheer them on, a Lovely goes a long way.</div>
      </div>
      <div style={{ display: twoCol ? "grid" : "block", gridTemplateColumns: twoCol ? "minmax(0,680px) 320px" : undefined, gap: 28, alignItems: "start", marginTop: 18 }}>
        <div style={{ maxWidth: twoCol ? "none" : 680, margin: twoCol ? 0 : "0 auto" }}>
          {!twoCol && <div style={{ marginBottom: 14 }}>{rail}</div>}
          <ComposeBar empty={empty} onShare={onShare} />
          <ThemeBanner theme={WEEKLY_THEME} onShare={onShare} />
          {loading
            ? <div style={{ ...card, marginTop: 14, padding: "48px 24px", textAlign: "center", color: T.muted, fontWeight: 700, fontSize: 14 }}>Gathering the circle…</div>
            : empty
              ? <EmptyState onShare={onShare} />
              : posts.map(p => <PostCard key={p.id} post={p} onOpenPattern={onOpenPattern} canInteract={canInteract} onSignIn={onSignIn} onLove={handleLove} onComment={handleComment} onLoadComments={loadComments} />)}
        </div>
        {twoCol && <aside>{rail}</aside>}
      </div>
    </div>
  );
}
