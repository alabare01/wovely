import { useState } from "react";
import { T } from "../theme.jsx";
import { tierLabel, normalizeTier } from "../utils/tierUtils.js";
import { requiredTier } from "../utils/featureGates.js";

// Per-feature nudge copy. Lives here so a single place defines the voice
// for every gate prompt. Copy rules: warm, confident, Bev-flavored. No
// "AI", no em dashes, no exclamations, no "unlock/leverage/seamless".
// Benefit-oriented descriptions, not technical.
const NUDGE_COPY = {
  patternCap: {
    headline: "Your pattern box is full",
    body: "Craft gives you a much larger library. Add far more patterns than Free.",
  },
  bevCheck: {
    headline: "Bev checked this pattern",
    body: "The full report is part of Craft. Catch off-counts and broken rounds before you start crocheting.",
  },
  chunkedImport: {
    headline: "This pattern is a big one",
    body: "Craft members get full support for complex patterns with lots of components.",
  },
  collections: {
    headline: "Organize pattern books and MKALs",
    body: "Collections group related patterns together. Available for Craft members.",
  },
};

const SESSION_KEY = (feature) => `wovely_nudge_dismissed_${feature}`;

export default function UpgradeNudge({ feature, currentTier, onUpgrade, dismissible = true }) {
  const safe = normalizeTier(currentTier);
  const [dismissed, setDismissed] = useState(() => {
    if (!dismissible) return false;
    try { return sessionStorage.getItem(SESSION_KEY(feature)) === "1"; } catch { return false; }
  });
  if (dismissed) return null;
  const copy = NUDGE_COPY[feature];
  if (!copy) return null;
  const target = requiredTier(feature);
  const ctaLabel = `Upgrade to ${tierLabel(target)}`;
  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(SESSION_KEY(feature), "1"); } catch {}
  };
  return (
    <div style={{
      background: "rgba(255,255,255,0.82)",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      border: "1px solid rgba(255,255,255,0.45)",
      borderLeft: `4px solid ${T.terra}`,
      borderRadius: 16,
      boxShadow: "0 4px 24px rgba(90,66,160,0.08)",
      padding: "16px 18px",
      fontFamily: T.sans,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:T.serif,fontSize:16,fontWeight:700,color:T.ink,lineHeight:1.25,marginBottom:4}}>{copy.headline}</div>
          <div style={{fontSize:13,color:T.ink2,lineHeight:1.6}}>{copy.body}</div>
        </div>
        {dismissible && (
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            style={{background:"none",border:"none",cursor:"pointer",color:T.ink3,fontSize:18,lineHeight:1,padding:0,flexShrink:0,opacity:0.6}}
          >×</button>
        )}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
        <button
          onClick={onUpgrade}
          style={{
            background: T.terra,
            color: "#fff",
            border: "none",
            borderRadius: 99,
            padding: "9px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(123,106,212,0.3)",
          }}
        >{ctaLabel}</button>
        <span style={{fontSize:11,color:T.ink3}}>Current plan: {tierLabel(safe)}</span>
      </div>
    </div>
  );
}
