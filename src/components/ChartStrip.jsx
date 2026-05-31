// Shared chart-image UI used by both the pattern detail and collection detail
// pages: the horizontal thumbnail strip, the fullscreen lightbox (with pinch
// zoom + prev/next + swipe), and an optional "Pin" toggle wired to App-level
// pin state. Extracted from PatternDetail so both surfaces stay identical.

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { T } from "../theme.jsx";
import { imageTypeLabel } from "../utils/patternImages.js";

// Image-type pill used on each thumbnail and inside the lightbox header.
export const ChartTypePill = ({ type }) => (
  <span style={{
    display: "inline-block",
    background: T.terra,
    color: "#fff",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.06em",
    padding: "4px 10px",
    borderRadius: 20,
    fontFamily: T.sans,
    lineHeight: 1.2,
  }}>{imageTypeLabel(type)}</span>
);

// Bev-in-spinning-ring loading affordance per CLAUDE.md ("static Bev inside
// spinning ring"). Stays small so it fits inside a thumbnail.
export const BevInlineSpinner = ({ size = 24 }) => (
  <div style={{ width: size, height: size, position: "relative", flexShrink: 0 }}>
    <div style={{
      position: "absolute", inset: -3, borderRadius: "50%",
      border: "2px solid transparent",
      borderTopColor: "#9B7EC8",
      animation: "wovelyChartsRing 1s linear infinite",
    }}/>
    <img
      src="/bev_neutral.png" alt="Bev"
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", display: "block" }}
    />
  </div>
);

// Fullscreen image viewer with prev/next + swipe navigation. Pinch-zoom is
// handled natively by the browser via touch-action: pinch-zoom on the image.
// Tap outside the image or hit the close button to dismiss. When canPin is set
// a Pin/Unpin toggle appears next to the close button.
export const ChartLightbox = ({ images, startIndex, onClose, canPin = false, pinnedImageId = null, onTogglePin }) => {
  const [idx, setIdx] = useState(startIndex || 0);
  const touchStartX = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") setIdx(i => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIdx(i => Math.min(images.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, onClose]);

  if (!images?.length) return null;
  const img = images[idx];
  if (!img) return null;

  const goPrev = () => setIdx(i => Math.max(0, i - 1));
  const goNext = () => setIdx(i => Math.min(images.length - 1, i + 1));
  const isPinned = pinnedImageId != null && img.id === pinnedImageId;

  const onTouchStart = (e) => { touchStartX.current = e.touches?.[0]?.clientX ?? null; };
  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return;
    const endX = e.changedTouches?.[0]?.clientX ?? touchStartX.current;
    const dx = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0) goNext(); else goPrev();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,0.9)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {canPin && onTogglePin && (
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePin(img); }}
          aria-label={isPinned ? "Unpin" : "Pin"}
          style={{
            position: "absolute", top: 16, left: 16,
            background: isPinned ? "#9B7EC8" : "rgba(255,255,255,0.15)", color: "#fff", border: "none",
            borderRadius: 99, height: 40, padding: "0 16px", cursor: "pointer",
            fontSize: 13, fontWeight: 600, fontFamily: "Inter, sans-serif",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >📌 {isPinned ? "Unpin" : "Pin"}</button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close"
        style={{
          position: "absolute", top: 16, right: 16,
          background: "rgba(255,255,255,0.15)", color: "#fff", border: "none",
          borderRadius: 99, width: 40, height: 40, cursor: "pointer",
          fontSize: 22, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >×</button>
      <div onClick={(e) => e.stopPropagation()} style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
        <ChartTypePill type={img.image_type} />
        {images.length > 1 && (
          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter, sans-serif" }}>
            {idx + 1} / {images.length}
          </span>
        )}
      </div>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative", maxWidth: "90vw", maxHeight: "75vh", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        {images.length > 1 && idx > 0 && (
          <button
            onClick={goPrev}
            aria-label="Previous"
            style={{
              position: "absolute", left: -12, top: "50%", transform: "translateY(-50%)",
              background: "rgba(255,255,255,0.18)", color: "#fff", border: "none",
              borderRadius: 99, width: 40, height: 40, cursor: "pointer",
              fontSize: 22, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 1,
            }}
          >‹</button>
        )}
        {img.cloudinary_url ? (
          <img
            src={img.cloudinary_url}
            alt={img.caption || imageTypeLabel(img.image_type)}
            style={{
              maxWidth: "90vw", maxHeight: "75vh",
              objectFit: "contain", display: "block",
              touchAction: "pinch-zoom",
              borderRadius: 8,
            }}
          />
        ) : (
          <div style={{
            color: "rgba(255,255,255,0.7)", fontFamily: "Inter, sans-serif",
            fontSize: 14, padding: "60px 40px", textAlign: "center",
          }}>Bev is preparing this image…</div>
        )}
        {images.length > 1 && idx < images.length - 1 && (
          <button
            onClick={goNext}
            aria-label="Next"
            style={{
              position: "absolute", right: -12, top: "50%", transform: "translateY(-50%)",
              background: "rgba(255,255,255,0.18)", color: "#fff", border: "none",
              borderRadius: 99, width: 40, height: 40, cursor: "pointer",
              fontSize: 22, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 1,
            }}
          >›</button>
        )}
      </div>
      {(img.caption || img.component_name) && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            marginTop: 14, maxWidth: "90vw", textAlign: "center",
            color: "#fff", fontFamily: "Inter, sans-serif",
            fontSize: 13, lineHeight: 1.5,
          }}
        >
          {img.component_name && (
            <div style={{ fontWeight: 600, marginBottom: 4, fontFamily: "'Playfair Display', Georgia, serif", fontSize: 15 }}>
              {img.component_name}
            </div>
          )}
          {img.caption && <div style={{ opacity: 0.85 }}>{img.caption}</div>}
        </div>
      )}
    </div>
  );
};

// Horizontal thumbnail strip. `images` may include rows with a null
// cloudinary_url (mid-render) which show a spinner placeholder. Pass
// `labelFor(img)` to show a small caption under each thumb (used by the
// collection strip to tag the source clue). Pin props are forwarded to the
// lightbox. Renders the lightbox via portal so it escapes any transformed
// (sticky-header) ancestor.
export const ChartStripView = ({ images, labelFor, canPin = false, pinnedImageId = null, onTogglePin, pendingLabel, locked = false, lockedCount = 0, onShowUpgrade, showEmptyState = false, thumbHeight = 120 }) => {
  const [lightboxIdx, setLightboxIdx] = useState(null);

  const bandStyle = {
    background: "rgba(255,255,255,0.82)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    borderBottom: "1px solid #EDE4F7",
    padding: "12px 16px",
    position: "relative",
  };
  const scrollRowStyle = {
    display: "flex", gap: 10, overflowX: "auto",
    scrollbarWidth: "none", msOverflowStyle: "none",
    WebkitOverflowScrolling: "touch",
  };
  const keyframeStyle = (
    <style>{`
      @keyframes wovelyChartsRing{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}
      .wovely-cstrip::-webkit-scrollbar{display:none}
    `}</style>
  );

  // Locked (Pro/Free): frosted placeholder thumbs behind a compact upgrade
  // nudge. Same band so the layout matches the unlocked strip.
  if (locked) {
    const placeholderCount = Math.min(Math.max(lockedCount || 0, 3), 5);
    return (
      <div style={bandStyle}>
        <div style={{ display: "flex", gap: 10, overflowX: "hidden", filter: "blur(1.5px)", opacity: 0.7 }}>
          {Array.from({ length: placeholderCount }).map((_, i) => (
            <div key={i} style={{
              flexShrink: 0, height: 120, width: 92, borderRadius: 12,
              border: "1px solid #EDE4F7", background: "linear-gradient(135deg, #EDE4F7, #F8F6FF)",
            }}/>
          ))}
        </div>
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 4,
          background: "rgba(248,246,255,0.55)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
        }}>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "#2D2D4E", fontWeight: 600 }}>
            Bev found charts in this pattern
          </div>
          {onShowUpgrade && (
            <button onClick={onShowUpgrade} style={{
              background: "transparent", border: "none", padding: 0, cursor: "pointer",
              fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: "#9B7EC8",
            }}>See plans</button>
          )}
        </div>
      </div>
    );
  }

  // Drop "photo" — Gemini tags decorative pages, social collages, and designer
  // promo content as photo; they're not useful reference material.
  const shown = (Array.isArray(images) ? images : []).filter(i => i.image_type !== "photo");
  const ready = shown.filter(i => i.cloudinary_url);

  // Nothing to show yet. Pattern detail (no showEmptyState) renders nothing;
  // the collection strip (showEmptyState) keeps the container with a Bev
  // spinner so the user knows charts are on the way.
  if (shown.length === 0) {
    if (!showEmptyState) return null;
    return (
      <>
        {keyframeStyle}
        <div style={{ ...bandStyle, display: "flex", alignItems: "center", gap: 12, minHeight: 120 }}>
          <BevInlineSpinner size={28} />
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "#6B6B8A" }}>
            {pendingLabel || "Bev is preparing your charts..."}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        @keyframes wovelyChartsRing{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}
        .wovely-cstrip::-webkit-scrollbar{display:none}
      `}</style>
      <div style={bandStyle}>
        <div className="wovely-cstrip" style={scrollRowStyle}>
          {shown.map((img) => {
            const tappable = !!img.cloudinary_url;
            const label = labelFor ? labelFor(img) : null;
            return (
              <button
                key={img.id}
                onClick={() => { if (tappable) { const idx = ready.findIndex(r => r.id === img.id); if (idx >= 0) setLightboxIdx(idx); } }}
                disabled={!tappable}
                aria-label={img.caption || imageTypeLabel(img.image_type)}
                style={{
                  flexShrink: 0, padding: 0, border: "none", background: "transparent",
                  cursor: tappable ? "pointer" : "default",
                  display: "flex", flexDirection: "column", alignItems: "flex-start",
                }}
              >
                <div style={{
                  position: "relative", height: thumbHeight, borderRadius: 12, overflow: "hidden",
                  border: "1px solid #EDE4F7", background: tappable ? "#EDE4F7" : "#F8F6FF",
                  ...(tappable ? {} : { width: 92, display: "flex", alignItems: "center", justifyContent: "center" }),
                }}>
                  {tappable ? (
                    <img
                      src={img.cloudinary_url}
                      alt={img.caption || imageTypeLabel(img.image_type)}
                      style={{ height: thumbHeight, width: "auto", maxWidth: 240, objectFit: "cover", display: "block" }}
                      loading="lazy"
                    />
                  ) : (
                    <BevInlineSpinner size={24} />
                  )}
                  <div style={{ position: "absolute", top: 6, left: 6 }}>
                    <ChartTypePill type={img.image_type} />
                  </div>
                </div>
                {label && (
                  <div style={{
                    marginTop: 4, maxWidth: 240, fontSize: 10, fontFamily: "Inter, sans-serif",
                    color: "#6B6B8A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{label}</div>
                )}
              </button>
            );
          })}
        </div>
        <div style={{
          position: "absolute", top: 0, right: 0, bottom: 0, width: 36,
          background: "linear-gradient(to right, rgba(255,255,255,0), rgba(248,246,255,0.92))",
          pointerEvents: "none",
        }}/>
        <div style={{ marginTop: 6, fontSize: 11, color: "#6B6B8A", fontFamily: "Inter, sans-serif" }}>
          {ready.length === 0 && pendingLabel ? pendingLabel : "Tap to enlarge"}
        </div>
      </div>
      {lightboxIdx != null && createPortal(
        <ChartLightbox
          images={ready}
          startIndex={Math.min(lightboxIdx, ready.length - 1)}
          onClose={() => setLightboxIdx(null)}
          canPin={canPin}
          pinnedImageId={pinnedImageId}
          onTogglePin={onTogglePin}
        />,
        document.body
      )}
    </>
  );
};

// Floating pinned-thumbnail dock (fixed bottom-left). Tapping re-opens the
// image in the lightbox; the small X unpins. Rendered at App level so it
// persists across navigation within a collection.
export const PinnedThumbnail = ({ image, onOpen, onUnpin }) => {
  if (!image?.cloudinary_url) return null;
  return (
    <div style={{
      position: "fixed", bottom: 20, left: 20, zIndex: 45,
      width: 80, height: 80, borderRadius: 8, overflow: "visible",
      boxShadow: "0 4px 16px rgba(45,58,124,0.15)",
    }}>
      <button
        onClick={onOpen}
        aria-label="Open pinned image"
        style={{
          width: 80, height: 80, borderRadius: 8, overflow: "hidden", padding: 0,
          border: "1px solid #EDE4F7", background: "#EDE4F7", cursor: "pointer", display: "block",
        }}
      >
        <img src={image.cloudinary_url} alt={image.caption || imageTypeLabel(image.image_type)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </button>
      <button
        onClick={onUnpin}
        aria-label="Unpin"
        style={{
          position: "absolute", top: -8, right: -8,
          width: 22, height: 22, borderRadius: 99, cursor: "pointer",
          background: "#2D3A7C", color: "#fff", border: "2px solid #fff",
          fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 8px rgba(45,58,124,0.25)",
        }}
      >×</button>
    </div>
  );
};
