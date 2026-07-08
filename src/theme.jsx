import React, { useState, useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Design System 2b — "playful Wovely lavender" (supersedes style guide v1.0)
// Source of truth: design/Wovely App 2b.dc.html  ·  Canon: 10 Canon/Design System 2b.md
// Tokens: Accent #7B6AD4 · Deep #6E5AC8 · Canvas #FBF9FF · Ink #2E2748 · Gold #FFC24B
//         Mint #5EC9AE · Line #ECE6F8 · Coral #FF8A73 · Sun #FFC24B · Sky #6FB7F0 · Pink #C98BE0
// Type: Fredoka (display) + Nunito (body). Gold is SCARCE — Craft/premium only, never decorative.
//
// Backward-compat: legacy key names (terra, serif, sans, sage, navy, …) are kept and
// remapped onto 2b values so the 17 files importing `T` re-skin instantly. New code
// should prefer the 2b names (accent, disp, body, coral, sun, mint, sky, pink).
// ─────────────────────────────────────────────────────────────────────────────
export const T = {
  // — 2b canonical —
  bg:"#FBF9FF", panel:"#FFFFFF", card:"#FFFFFF", modal:"#FFFFFF",
  ink:"#2E2748", muted:"#726A92", ink2:"#726A92", ink3:"#9089AE",
  accent:"#7B6AD4", accentD:"#6E5AC8", line:"#ECE6F8", border:"#ECE6F8",
  soft:"#F2EEFB", terraLt:"#F2EEFB", surface:"#F2EEFB", linen:"#F5F2FF",
  coral:"#FF8A73", sun:"#FFC24B", mint:"#5EC9AE", sky:"#6FB7F0", pink:"#C98BE0",

  // — legacy aliases (mapped to 2b) —
  terra:"#7B6AD4", sage:"#5EC9AE", sageLt:"#E7F6F0", gold:"#FFC24B",
  ochre:"#6E5AC8", earth:"#726A92", navy:"#2E2748",

  // — semantic (accessible text tones from the 2b gauge system) —
  success:"#1E8A63", warning:"#B07B1E", error:"#C2564A", disabled:"#B8B2CC",

  // — type —
  disp:'"Fredoka", "Segoe UI", sans-serif', body:'"Nunito", -apple-system, sans-serif',
  serif:'"Fredoka", "Segoe UI", sans-serif', sans:'"Nunito", -apple-system, sans-serif',

  // — elevation (purple-tinted per 2b) —
  shadow:"0 1px 3px rgba(46,39,72,0.08)",
  shadowLg:"0 16px 34px -22px rgba(90,66,160,0.4)",
  shadowXl:"0 26px 46px -22px rgba(90,66,160,0.5)",

  // — woven 45° crosshatch texture (canvas treatment) —
  crosshatch:"repeating-linear-gradient(45deg,rgba(123,106,212,.03) 0 2px,transparent 2px 12px),repeating-linear-gradient(-45deg,rgba(123,106,212,.03) 0 2px,transparent 2px 12px)",
};

export const useBreakpoint = () => {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return { isMobile: w < 768, isTablet: w >= 768 && w < 1100, isDesktop: w >= 1100, width: w };
};

export const Field = ({label,value,onChange,type="text",placeholder,rows:r}) => (
  <div style={{marginBottom:14}}>
    {label&&<div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".05em",marginBottom:6,fontFamily:T.body}}>{label}</div>}
    {r?<textarea value={value} onChange={onChange} placeholder={placeholder} rows={r} style={{width:"100%",padding:"13px 16px",background:"#fff",border:`1.5px solid ${T.line}`,borderRadius:14,color:T.ink,fontSize:14,resize:"vertical",lineHeight:1.6,outline:"none",fontFamily:T.body,fontWeight:600,transition:"border-color .2s"}} onFocus={e=>e.target.style.borderColor=T.accent} onBlur={e=>e.target.style.borderColor=T.line}/>
      :<input value={value} onChange={onChange} type={type} placeholder={placeholder} style={{width:"100%",padding:"13px 16px",background:"#fff",border:`1.5px solid ${T.line}`,borderRadius:14,color:T.ink,fontSize:15,outline:"none",fontFamily:T.body,fontWeight:600,transition:"border-color .2s"}} onFocus={e=>e.target.style.borderColor=T.accent} onBlur={e=>e.target.style.borderColor=T.line}/>}
  </div>
);
