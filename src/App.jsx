import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { initErrorReporter, setErrorReporterUser } from './utils/errorReporter.js';
import { useNavigate, useLocation, useParams, Routes, Route, Navigate } from "react-router-dom";
import posthog from "posthog-js";
import { T, useBreakpoint, Field } from "./theme.jsx";
import { SUPABASE_URL, SUPABASE_ANON_KEY, APP_ORIGIN, saveSession, getSession, supabaseAuth, isAnonymousSession } from "./supabase.js";
import { PHOTOS, PILL, APP_VERSION } from "./constants.js";
import Calculators from "./Calculators.jsx";
import StitchCheck from "./StitchCheck.jsx";
import StitchResultPage from "./StitchResultPage.jsx";
import Auth from "./Auth.jsx";
import AuthWallModal from "./AuthWallModal.jsx";
import PatternHeader from "./PatternHeader.jsx";
import RowManager, { ensureRepeatBrackets } from "./RowManager.jsx";
import AddPatternModal, { uploadPatternFile, buildRowsFromComponents, extractTextFromPDF } from "./AddPatternModal.jsx";
import CollectionView, { PatternCard } from "./Dashboard.jsx";
import FirstRunFork from "./FirstRunFork.jsx";
import { CollectionDetailView } from "./Collections.jsx";
import { linkPatternToCollection, listPatternsInCollection, createCollection } from "./utils/collections.js";
import Detail, { CoverImagePicker, DeleteConfirmModal, ReadyToBuildPrompt, PatternCreatedOverlay } from "./PatternDetail.jsx";
import { ChartLightbox, PinnedThumbnail } from "./components/ChartStrip.jsx";
import ImageImportModal from "./ImageImportModal.jsx";
import ImportPill, { setActiveImportJob } from "./components/ImportPill.jsx";
import PrivacyPolicy from "./PrivacyPolicy.jsx";
import TermsOfService from "./TermsOfService.jsx";
import FeedbackWidget from "./FeedbackWidget.jsx";
import BevChat from "./BevChat.jsx";
import YarnCircle from "./YarnCircle.jsx";
import VaultReveal from "./VaultReveal.jsx";
import WhatsNewModal, { triggerWhatsNew, useWovelySuperTap } from "./WhatsNewModal.jsx";
import UpgradeNudge from "./components/UpgradeNudge.jsx";
import {
  TIER_FREE, TIER_PRO, TIER_CRAFT,
  isPaidTier, isCraftTier, tierLabel, normalizeTier,
  tierFromLegacyIsPro, readCachedTier, writeCachedTier, clearCachedTier,
  readCachedIsAnonymous, writeCachedIsAnonymous, clearCachedIsAnonymous,
} from "./utils/tierUtils.js";
import { canAccess, requiredTier, ANON_PATTERN_CAP } from "./utils/featureGates.js";
import { DOC_TYPES, importRouteMismatch, resolveChildSourceUrl } from "./utils/docType.js";
import { markImagesPending } from "./utils/patternImages.js";

// Parse Supabase auth tokens from the email-confirmation URL hash and write
// the session to localStorage BEFORE React mounts. Users arriving from a
// Resend confirmation link land at wovely.app/#access_token=...&type=signup —
// without this, the hash is ignored and they hit the landing page logged out.
// Running at module eval means getSession() already returns the session when
// Wovely() evaluates _hasLocalSession on its first render.
(() => {
  if (typeof window === "undefined") return;
  const hash = window.location.hash;
  if (!hash || !hash.includes("access_token=")) return;
  try {
    const params = new URLSearchParams(hash.slice(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return;
    const type = params.get("type");
    if (type === "recovery") {
      // TODO(password reset): route recovery tokens to /reset-password flow.
      // Out of scope for this fix — leave hash intact so a future handler can claim it.
      return;
    }
    const token_type = params.get("token_type") || "bearer";
    const expires_at_raw = params.get("expires_at");
    const expires_in_raw = params.get("expires_in");
    const payload = JSON.parse(atob(access_token.split(".")[1]));
    const nowSec = Math.floor(Date.now() / 1000);
    const expires_at = expires_at_raw ? Number(expires_at_raw) : (payload.exp ?? nowSec + 3600);
    const expires_in = expires_in_raw ? Number(expires_in_raw) : Math.max(0, expires_at - nowSec);
    saveSession({
      access_token,
      refresh_token,
      token_type,
      expires_at,
      expires_in,
      user: { id: payload.sub, email: payload.email },
    });
    window.history.replaceState({}, "", window.location.pathname + window.location.search);
    if (type === "signup") {
      // posthog.init() runs in main.jsx AFTER App.jsx imports, so defer one tick.
      setTimeout(() => { try { posthog.capture("email_confirmed"); } catch {} }, 0);
    }
  } catch { /* fail silently — never break the landing page for users without hash params */ }
})();

// ─── ROUTE ↔ VIEW MAPPING ───────────────────────────────────────────────────
// Collections is no longer a standalone destination. The list lives inside
// My Wovely (Dashboard) and the only Collections-specific route is the
// deep-link detail at /collections/:id. /collections falls back to / so
// older bookmarks land on My Wovely instead of a dead route.
const VIEW_TO_PATH = {collection:"/",detail:"/",wip:"/builds",browse:"/browse",stash:"/stash",calculator:"/tools","stitch-check":"/stitch-check",shopping:"/shopping",profile:"/profile",community:"/circle"};
const PATH_TO_VIEW = {"/":"collection","/hive":"collection","/builds":"wip","/browse":"browse","/stash":"stash","/tools":"calculator","/stitch-check":"stitch-check","/shopping":"shopping","/profile":"profile","/circle":"community","/hive-vision":"hive-vision","/privacy":"privacy","/terms":"terms"};
const viewFromPath = (pathname) => {
  if(pathname.startsWith("/pattern/")) return "detail";
  if(pathname.startsWith("/hive/")) return "detail";
  if(pathname.startsWith("/collections/")) return "collection-detail";
  // /collections (bare) routes back to My Wovely — Collections lives inside it now.
  if(pathname === "/collections") return "collection";
  return PATH_TO_VIEW[pathname] || "collection";
};
const patternIdFromPath = (pathname) => {
  const m = pathname.match(/^\/(pattern|hive)\/(.+)$/);
  return m ? decodeURIComponent(m[2]) : null;
};
const collectionIdFromPath = (pathname) => {
  const m = pathname.match(/^\/collections\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
};

// sessionStorage key for the tier picked from TieredUpgradeModal before
// signup. Survives remounts (OAuth round-trip, page reload during the
// auth flow) so the post-signup auto-checkout finds the right tier.
const PENDING_UPGRADE_KEY = "wovely_pending_upgrade_tier";
// Mirrors the picked billing cadence alongside PENDING_UPGRADE_KEY so an
// anonymous user who picks Annual is charged annually after signup, not the
// monthly default. Survives OAuth round-trips / remounts the same way.
const PENDING_UPGRADE_CADENCE_KEY = "wovely_pending_upgrade_cadence";

// PHOTOS, PILL imported from ./constants.js

// Supabase auth imported from ./supabase.js

// APP_VERSION imported from ./constants.js
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

// Two-tier pricing. patternCap is the only cap that varies between tiers
// today; per-feature gating lives in src/utils/featureGates.js. Craft has a
// large fair-use ceiling (100) rather than truly unlimited, and adds
// Collections (and future Craft-only features) on top of Free.
const TIER_CONFIG = {
  free:  { patternCap: 5,   priceLabel: "Free" },
  craft: { patternCap: 100, priceMonthly: 6.99, priceAnnual: 54.99, priceLabelMonthly: "$6.99/mo", priceLabelAnnual: "$54.99/yr" },
};

// useTier returns gating info for the active session. Pass the user's tier
// string ('free' | 'pro' | 'craft'); isPro is derived for back-compat with
// call sites that still want a boolean.
const useTier = (tier, userCount, starterCount=0) => {
  const realCount = userCount - starterCount;
  const paid = isPaidTier(tier);
  // Every tier now has a finite patternCap (Free 5, Craft 100 fair-use
  // ceiling), so the cap is authoritative for all tiers — paid no longer
  // bypasses it. The at-cap UX is branched by tier downstream: Free hits the
  // upgrade paywall, Craft hits a fair-use message with no upgrade CTA.
  const cap = TIER_CONFIG[tier]?.patternCap ?? TIER_CONFIG.free.patternCap;
  const atCap  = realCount >= cap;
  const canAdd = realCount  < cap;
  const hasFeature = () => canAdd;
  return { tier, isPro: paid, isCraft: isCraftTier(tier), atCap, canAdd, hasFeature, userCount: realCount };
};

// T (theme) and useBreakpoint imported from ./theme.js

const CSS = () => (
  <style>{`
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #EAE0D5; border-radius: 99px; }
    body { font-family: "Nunito", -apple-system, sans-serif; }
    input, textarea, button, select { font-family: "Nunito", -apple-system, sans-serif; }
    @keyframes fadeUp    { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
    @keyframes slideUp   { from{opacity:0;transform:translateY(40px)} to{opacity:1;transform:translateY(0)} }
    @keyframes slideInLeft  { from{transform:translateX(-100%);opacity:0} to{transform:translateX(0);opacity:1} }
    @keyframes slideOutLeft { from{transform:translateX(0);opacity:1} to{transform:translateX(-100%);opacity:0} }
    @keyframes dimIn  { from{opacity:0} to{opacity:1} }
    @keyframes dimOut { from{opacity:1} to{opacity:0} }
    @keyframes fabPulse { 0%,100%{box-shadow:0 6px 24px rgba(123,106,212,.45)} 50%{box-shadow:0 6px 32px rgba(123,106,212,.7)} }
    @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
    @keyframes progressShimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
    @keyframes pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.15);opacity:.7} }
    @keyframes confidencePop { 0%{transform:scale(0.8);opacity:0} 60%{transform:scale(1.05)} 100%{transform:scale(1);opacity:1} }
    @keyframes bcblink { 50%{opacity:0} }
    .fu { animation:fadeUp .4s ease both; }
    .su { animation:slideUp .35s cubic-bezier(.22,.68,0,1.05) both; }
    .nav-open  { animation:slideInLeft  .3s cubic-bezier(.22,.68,0,1.05) both; }
    .nav-close { animation:slideOutLeft .24s ease both; }
    .dim-in  { animation:dimIn  .25s ease both; }
    .dim-out { animation:dimOut .2s  ease both; }
    .spinner { animation:spin .8s linear infinite; }
    .conf-pop { animation:confidencePop .5s cubic-bezier(.22,.68,0,1.05) both; }
    .card { transition:transform .18s,box-shadow .18s; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
    .card:hover { transform:translateY(-1px) !important; box-shadow:0 4px 16px rgba(123,106,212,0.12) !important; }
    .tap { transition:opacity .15s; cursor:pointer; }
    .tap:hover { opacity:.85; }
    .method-card { transition:all .15s; }
    .method-card:hover { background:#ECE6F8 !important; border-color:#7B6AD4 !important; transform:translateY(-1px); }
    .progress-bar-fill { background:linear-gradient(90deg,#7B6AD4 0%,#B9A3DC 50%,#7B6AD4 100%); background-size:200% 100%; animation:progressShimmer 1.5s ease infinite; }
    .wireframe-container canvas { touch-action: none; }
    .h-scroll { display:flex; gap:12px; overflow-x:auto; -webkit-overflow-scrolling:touch; scroll-snap-type:x mandatory; padding-bottom:8px; scrollbar-width:none; }
    .h-scroll::-webkit-scrollbar { display:none; }
    .h-scroll > * { scroll-snap-align:start; flex-shrink:0; }
    .pattern-grid { display:grid; gap:16px; grid-template-columns:1fr 1fr; }
    @media(min-width:900px)  { .pattern-grid { grid-template-columns:1fr 1fr 1fr; } }
    @media(min-width:1300px) { .pattern-grid { grid-template-columns:1fr 1fr 1fr 1fr; } }
    @media(min-width:768px) {
      .mobile-swipe-hint { display:none !important; }
      .h-scroll { display:grid !important; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)) !important; overflow-x:visible !important; scroll-snap-type:none !important; }
      .h-scroll > * { flex-shrink:unset !important; }
    }
    input:focus, textarea:focus, select:focus { outline:none; }
    input[type="password"]::placeholder { opacity:.4; }
    @media(hover:hover) { .nav-item:hover { background:rgba(255,255,255,0.1) !important; } .site-row:hover { background:#F5F2FF !important; } }
  `}</style>
);

const pct = p => { const checkable=(p.rows||[]).filter(r=>!r.isHeader&&!r.isNoteOnly); return checkable.length ? Math.round(checkable.filter(r=>r.done).length/checkable.length*100) : 0; };

const DEFAULT_STARTERS = [];
const makeStarterPatterns = () => DEFAULT_STARTERS.map(p=>({...p,rows:p.rows.map(r=>({...r}))}));

// S83: the one first-run starter — a real PDF in Supabase Storage. Picking it
// runs the REAL import pipeline (fetch the public file → same client pdf.js
// extraction as an upload → POST /api/import-job → queue → ImportPill → review
// modal → save), so "pick a starter" is identical to "user uploaded this PDF".
// No table reads, no admin surface. One starter only.
const STARTER = {
  title: "Button the Mushroom",
  blurb: "A friendly little toadstool to learn the round on. A Wovely original — on the house.",
  coverUrl: "https://res.cloudinary.com/dmaupzhcx/image/upload/v1781136378/covers/zqo1rink0r0rbt7jvi1x.jpg",
  storagePath: "starters/button-the-mushroom-v1.pdf",
};
// sessionStorage key holding the job_id of an in-flight starter import, so the
// starter flag survives the pill → review modal → save round trip (including a
// mid-import reload — the pill itself resumes from its own sessionStorage key).
const STARTER_JOB_KEY = "wovely_starter_job_id";
// Text-empty guard: a starter export with no real text layer must never enter
// the queue — the worker would "complete" with zero components and the user
// would save an empty pattern (the Button_(1).pdf incident, S83 audit).
const STARTER_MIN_TEXT_CHARS = 500;

const estYards = p => {
  if (p.yardage > 0) return p.yardage;
  return (p.materials||[]).reduce((s,m) => {
    if (m.yardage > 0) return s + m.yardage;
    const t = ((m.name||"")+" "+(m.amount||"")).toLowerCase();
    // Direct yardage on the material — e.g. "13 yds", "120 yards". Checked
    // before ball/skein so a "13 yds" amount isn't missed for materials whose
    // name happens to contain "ball" or "skein".
    const yd = t.match(/(\d+)\s*(yds?|yards?)\b/);
    if (yd) return s + parseInt(yd[1]);
    const b = t.match(/(\d+)\s*ball/); const sk = t.match(/(\d+)\s*skein/);
    if (b) return s + parseInt(b[1])*200; if (sk) return s + parseInt(sk[1])*200;
    return s;
  }, 0);
};
const estSkeins = p => { const y=estYards(p); return y>0?Math.ceil(y/200):0; };

const Bar = ({val,color=T.terra,h=3,bg=T.border,animated=false}) => (
  <div style={{background:bg,borderRadius:99,height:h,overflow:"hidden"}}>
    <div className={animated?"progress-bar-fill":""} style={{width:`${val}%`,height:h,background:animated?"":color,borderRadius:99,transition:"width .4s ease"}}/>
  </div>
);
const Stars = ({val=0,onChange,ro}) => (
  <div style={{display:"flex",gap:2}}>
    {[1,2,3,4,5].map(i=><span key={i} onClick={()=>!ro&&onChange?.(i)} style={{fontSize:12,cursor:ro?"default":"pointer",color:i<=val?T.gold:T.border}}>★</span>)}
  </div>
);
const Photo = ({src,alt,style:sx}) => {
  const [err,setErr]=useState(false);
  if(err) return <div style={{...sx,background:"linear-gradient(145deg,#C4855A,#6B3A22)",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:32,opacity:.4}}>🧶</span></div>;
  // Default objectFit/display BEFORE the spread so callers can override them.
  // (Pre-S67.5 these were after the spread and silently won — library cards
  // with portrait covers couldn't ask for objectFit:"contain".)
  return <img src={src} alt={alt} onError={()=>setErr(true)} style={{objectFit:"cover",display:"block",...sx}}/>;
};

// ─── CATEGORY FALLBACK IMAGES (Imagen 4.0 generated) ──────────────────────
const CAT_IMG = {
  "Amigurumi":"https://res.cloudinary.com/dmaupzhcx/image/upload/v1774405272/duiwkpuwzctq42zjox9x.png",
  "Blankets":"https://res.cloudinary.com/dmaupzhcx/image/upload/v1774405430/u1evbmu4nccpiyg8fc7a.png",
  "Wearables":"https://res.cloudinary.com/dmaupzhcx/image/upload/v1774405433/yrcitmgukrik0owg1typ.png",
  "Accessories":"https://res.cloudinary.com/dmaupzhcx/image/upload/v1774405436/uq692cchkcsjowpgu2le.png",
  "Home Décor":"https://res.cloudinary.com/dmaupzhcx/image/upload/v1774405438/moqrjnlupspgoxt9v4wb.png",
  "Uncategorized":"https://res.cloudinary.com/dmaupzhcx/image/upload/v1774405441/ggzvsrbeeetyiabs55sn.png",
};
const catImgFor = (cat) => CAT_IMG[cat] || CAT_IMG["Uncategorized"];
const ALL_CAT_ENTRIES = Object.entries(CAT_IMG);


// Category-aware fallback for cards with no cover
const catFallbackPhoto = (cat) => catImgFor(cat);
const Btn = ({children,onClick,variant="primary",full=true,small=false,disabled=false,style:sx={}}) => {
  const styles = {
    primary:{background:T.terra,color:"#fff",border:"none"},
    secondary:{background:T.linen,color:T.ink,border:`1px solid ${T.border}`},
    ghost:{background:"none",color:T.ink3,border:"none"},
    sage:{background:T.sage,color:"#fff",border:"none"},
    danger:{background:"#C2564A",color:"#fff",border:"none"},
    gold:{background:"linear-gradient(135deg,#C9A84C,#8B6914)",color:"#fff",border:"none"},
  };
  return <button onClick={onClick} disabled={disabled} className="tap" style={{...styles[variant],borderRadius:12,padding:small?"8px 16px":"14px 20px",fontSize:small?13:15,fontWeight:600,cursor:disabled?"not-allowed":"pointer",width:full?"100%":"auto",opacity:disabled?.6:1,boxShadow:variant==="primary"?"0 4px 16px rgba(123,106,212,.3)":variant==="sage"?"0 4px 16px rgba(92,122,94,.3)":variant==="gold"?"0 4px 16px rgba(184,144,44,.35)":"none",...sx}}>{children}</button>;
};
// Field imported from ./theme.js


const CATS = ["All","Blankets","Wearables","Accessories","Amigurumi","Home Décor"];

const normalizeRole = (role,primitive) => {
  if(!role) return "unknown";
  const r=role.toLowerCase().trim();
  const KNOWN=["body","head","arm","leg","ear","tail","nose","eye","base"];
  if(KNOWN.includes(r)) return r;
  if(["hat","cap","hood","brim","top"].includes(r)) return "hat";
  if(["beard","moustache","mustache","mouth","snout","beak","tuft","pom"].includes(r)) return "beard";
  if(["wing","fin","flipper"].includes(r)) return "wing";
  if(["torso","chest","trunk","midsection"].includes(r)) return "body";
  if(["hand","paw","foot","hoof","claw"].includes(r)) return "arm";
  if(["antenna","horn","spike"].includes(r)) return "horn";
  if(["flower","bow","ribbon","accessory","button","pompom"].includes(r)) return "accessory";
  if(r==="detail"||r==="unknown") {
    if(primitive==="cone"||primitive==="tapered_cylinder") return "hat";
    if(primitive==="oval") return "beard";
    if(primitive==="flat_disc"||primitive==="flat_circle") return "base";
    if(primitive==="sphere") return "beard";
    return "detail";
  }
  return "detail";
};

// Positions are relative to body center (y=0). Positive y = up, negative y = down.
// zOff = forward offset so face parts protrude naturally from the front.
// mirror:true = component is duplicated and placed symmetrically on both sides (x and -x).
const SLOT_POSITIONS = {
  base:     {y:-1.9, x:0,    zOff:0,    mirror:false},  // flat disc at very bottom
  body:     {y: 0.0, x:0,    zOff:0,    mirror:false},  // dominant center mass
  leg:      {y:-1.2, x:0.55, zOff:0,    mirror:true },  // below body, spread out
  arm:      {y: 0.1, x:1.15, zOff:0.1,  mirror:true },  // sides of body, slight forward lean
  tail:     {y:-0.5, x:0,    zOff:-0.9, mirror:false},  // behind body
  head:     {y: 1.55,x:0,    zOff:0,    mirror:false},  // directly above body
  ear:      {y: 1.9, x:0.65, zOff:0,    mirror:true },  // sides of head
  hat:      {y: 2.85,x:0,    zOff:0,    mirror:false},  // on top of head
  horn:     {y: 2.55,x:0.28, zOff:0.1,  mirror:true },  // front-top of head
  eye:      {y: 1.65,x:0.32, zOff:0.65, mirror:true },  // front face, symmetric
  nose:     {y: 1.45,x:0,    zOff:0.8,  mirror:false},  // front center face, lower than eyes
  beard:    {y: 1.1, x:0,    zOff:0.55, mirror:false},  // below nose, protrudes forward
  wing:     {y: 0.5, x:1.4,  zOff:-0.2, mirror:true },  // back-sides of body
  accessory:{y: 2.0, x:0,    zOff:0.3,  mirror:false},  // front of head/body area
  detail:   {y: 0.6, x:0,    zOff:0.4,  mirror:false},  // generic fallback, front-center
};

const ROLE_COLORS = {
  body:0xB85A3C,head:0xC97A5E,hat:0xA04828,beard:0xE8D4B8,nose:0xC07050,eye:0x3A2A20,
  ear:0xE8B49A,arm:0xD4956E,leg:0xD4956E,tail:0xD4B89A,base:0x9A7060,horn:0xD4956E,
  wing:0xC8A878,accessory:0xB8902C,detail:0xD4A870,unknown:0xB89A80,
};

const WireframeViewer = ({components,labeled=false,height=220,fillContainer=false}) => {
  const mountRef=useRef(null),cameraRef=useRef(null),groupRef=useRef(null);
  const isDragging=useRef(false),lastMouse=useRef({x:0,y:0}),rotRef=useRef({x:0.25,y:0.4});
  const zoomRef=useRef(11.0),pinchRef=useRef(null);
  const [threeLoaded,setThreeLoaded]=useState(false),[loadError,setLoadError]=useState(false);
  useEffect(()=>{
    if(window.THREE){setThreeLoaded(true);return;}
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    s.onload=()=>setThreeLoaded(true); s.onerror=()=>setLoadError(true);
    document.head.appendChild(s);
  },[]);
  const buildGeo=useCallback((THREE,primitive,s)=>{
    const r=Math.max(0.15,s);
    switch(primitive){
      case "sphere": return new THREE.SphereGeometry(r,16,12);
      case "oval": { const g=new THREE.SphereGeometry(r,16,12); g.scale(1,1.5,1); return g; }
      case "flat_disc": return new THREE.CylinderGeometry(r,r,r*0.18,16);
      case "cylinder": return new THREE.CylinderGeometry(r*0.42,r*0.42,r*1.5,14);
      case "tapered_cylinder": return new THREE.CylinderGeometry(r*0.18,r*0.52,r*1.6,14);
      case "cone": return new THREE.ConeGeometry(r*0.58,r*1.8,16);
      case "flat_square": return new THREE.BoxGeometry(r*1.3,r*0.14,r*1.3);
      case "flat_circle": return new THREE.CylinderGeometry(r,r,r*0.1,20);
      default: return new THREE.SphereGeometry(r*0.5,10,8);
    }
  },[]);
  useEffect(()=>{
    if(!threeLoaded||!mountRef.current||!components?.length) return;
    const THREE=window.THREE, el=mountRef.current;
    let initialized=false,animFrame,renderer;
    const init=(W,H)=>{
      if(initialized||W<10||H<10) return; initialized=true;
      const scene=new THREE.Scene(); scene.background=new THREE.Color(0xFAF7F3);
      const camera=new THREE.PerspectiveCamera(40,W/H,0.1,100);
      camera.position.set(0,0,zoomRef.current); cameraRef.current=camera;
      renderer=new THREE.WebGLRenderer({antialias:true});
      renderer.setSize(W,H); renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
      el.innerHTML=""; el.appendChild(renderer.domElement);
      scene.add(new THREE.AmbientLight(0xfff5ee,0.75));
      const d=new THREE.DirectionalLight(0xffffff,0.85); d.position.set(3,5,5); scene.add(d);
      const f=new THREE.DirectionalLight(0xffe8d8,0.35); f.position.set(-3,-2,-3); scene.add(f);
      const group=new THREE.Group(); groupRef.current=group;
      const slotCount={};
      components.forEach(comp=>{
        const rawRole=comp.role||"unknown", primitive=comp.primitive_type||"sphere";
        const ratio=Math.max(0.15,comp.size_ratio_to_dominant||0.5), count=Math.min(comp.count||1,4);
        const slot=normalizeRole(rawRole,primitive), pos=SLOT_POSITIONS[slot]||SLOT_POSITIONS.detail;
        const color=ROLE_COLORS[slot]||ROLE_COLORS.unknown;
        const stackIdx=slotCount[slot]||0; slotCount[slot]=stackIdx+1;
        const geo=buildGeo(THREE,primitive,ratio*0.75), stitchGeo=buildGeo(THREE,primitive,ratio*0.75);
        const wireMat=new THREE.MeshPhongMaterial({color,wireframe:true,transparent:true,opacity:0.7});
        const solidMat=new THREE.MeshPhongMaterial({color,transparent:true,opacity:0.08,side:THREE.FrontSide});
        const edgesGeo=new THREE.EdgesGeometry(stitchGeo,15);
        const stitchMat=new THREE.LineBasicMaterial({color:0xC07040,transparent:true,opacity:0.35});
        const stitchMesh=new THREE.LineSegments(edgesGeo,stitchMat);
        for(let i=0;i<count;i++){
          const wm=new THREE.Mesh(geo,wireMat), sm=new THREE.Mesh(geo,solidMat), st=stitchMesh.clone();
          let xPos=pos.x||0;
          const yPos=(pos.y||0)+stackIdx*0.45, zPos=pos.zOff||0;
          if(pos.mirror&&count>1) xPos=i===0?Math.abs(pos.x):-Math.abs(pos.x);
          else if(!pos.mirror&&count>1) xPos=(i-(count-1)/2)*0.5;
          [wm,sm,st].forEach(m=>{
            m.position.set(xPos,yPos,zPos);
            if(slot==="tail") m.rotation.x=0.5;
            if(slot==="nose") m.rotation.x=Math.PI/2;
            if((slot==="arm"||slot==="leg")&&count>1) m.rotation.z=i===0?-0.4:0.4;
          });
          group.add(sm); group.add(wm); group.add(st);
          if(labeled){
            const cv=document.createElement("canvas"); cv.width=320; cv.height=58;
            const ctx=cv.getContext("2d"); ctx.clearRect(0,0,320,58);
            ctx.fillStyle="#7B6AD4"; ctx.font="bold 22px Nunito, sans-serif"; ctx.textAlign="center";
            const rawLabel=comp.label||rawRole;
            const displayLabel=(rawLabel!=="unknown"&&rawLabel!=="detail")?rawLabel.toUpperCase():slot!=="detail"?slot.toUpperCase():primitive.toUpperCase();
            ctx.fillText(displayLabel,160,40);
            const tex=new THREE.CanvasTexture(cv);
            const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true}));
            sprite.scale.set(1.6,0.38,1); sprite.position.set(xPos,yPos+ratio*0.85+0.5,zPos+0.15);
            group.add(sprite);
          }
        }
      });
      const bodyComp=components.find(c=>normalizeRole(c.role||"",c.primitive_type||"")==="body");
      const bodyRatio=bodyComp?Math.max(0.15,bodyComp.size_ratio_to_dominant||1.0):0.75;
      const sceneScale=0.9/(bodyRatio*0.75);
      group.scale.setScalar(Math.min(sceneScale,1.4));
      group.position.set(0,-SLOT_POSITIONS.body.y*group.scale.y*0.5,0);
      group.rotation.x=rotRef.current.x; group.rotation.y=rotRef.current.y;
      scene.add(group);
      const grid=new THREE.GridHelper(10,14,0xEAE0D5,0xEAE0D5);
      grid.position.y=-2.5; grid.material.transparent=true; grid.material.opacity=0.3;
      scene.add(grid);
      const animate=()=>{ animFrame=requestAnimationFrame(animate); if(!isDragging.current&&group) group.rotation.y+=0.003; renderer.render(scene,camera); };
      animate();
    };
    const W0=el.clientWidth||0, H0=el.clientHeight||el.clientWidth||0;
    if(W0>10&&H0>10){ init(W0,H0); } else {
      const ro=new ResizeObserver(entries=>{
        for(const entry of entries){
          const{width,height}=entry.contentRect;
          if(width>10&&height>10){ init(width,height); ro.disconnect(); }
        }
      });
      ro.observe(el);
      return ()=>{ ro.disconnect(); cancelAnimationFrame(animFrame); renderer?.dispose(); };
    }
    return ()=>{ cancelAnimationFrame(animFrame); renderer?.dispose(); };
  },[threeLoaded,components,labeled,height,fillContainer,buildGeo]);
  const getXY=e=>({x:e.clientX??e.touches?.[0]?.clientX,y:e.clientY??e.touches?.[0]?.clientY});
  const onDown=e=>{ isDragging.current=true; lastMouse.current=getXY(e); };
  const onUp=()=>{ isDragging.current=false; pinchRef.current=null; };
  const onMove=e=>{
    if(!isDragging.current||!groupRef.current) return;
    if(e.touches?.length===2){
      const dx=e.touches[0].clientX-e.touches[1].clientX, dy=e.touches[0].clientY-e.touches[1].clientY;
      const dist=Math.sqrt(dx*dx+dy*dy);
      if(pinchRef.current!==null){ zoomRef.current=Math.max(2,Math.min(14,zoomRef.current+(pinchRef.current-dist)*0.04)); if(cameraRef.current) cameraRef.current.position.z=zoomRef.current; }
      pinchRef.current=dist; return;
    }
    pinchRef.current=null;
    const{x,y}=getXY(e);
    groupRef.current.rotation.y+=(x-lastMouse.current.x)*0.012;
    groupRef.current.rotation.x+=(y-lastMouse.current.y)*0.012;
    rotRef.current={x:groupRef.current.rotation.x,y:groupRef.current.rotation.y};
    lastMouse.current={x,y};
  };
  const onWheel=e=>{ e.preventDefault(); zoomRef.current=Math.max(2,Math.min(14,zoomRef.current+e.deltaY*0.012)); if(cameraRef.current) cameraRef.current.position.z=zoomRef.current; };
  const outerStyle=fillContainer?{position:"absolute",inset:0}:{position:"relative"};
  const mountStyle=fillContainer?{width:"100%",height:"100%",cursor:"grab",userSelect:"none"}:{width:"100%",height,borderRadius:12,overflow:"hidden",cursor:"grab",userSelect:"none"};
  if(loadError) return <div style={{...outerStyle,display:"flex",alignItems:"center",justifyContent:"center",background:T.linen,borderRadius:12}}><div style={{fontSize:12,color:T.ink3}}>3D preview unavailable</div></div>;
  if(!threeLoaded) return <div style={{...outerStyle,display:"flex",alignItems:"center",justifyContent:"center",background:T.linen,borderRadius:12}}><div className="spinner" style={{width:24,height:24,border:`2px solid ${T.border}`,borderTop:`2px solid ${T.terra}`,borderRadius:"50%"}}/></div>;
  return (
    <div style={outerStyle}>
      <div ref={mountRef} className="wireframe-container" style={mountStyle} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp} onWheel={onWheel}/>
      <div style={{position:"absolute",bottom:8,right:10,fontSize:10,color:T.ink3,pointerEvents:"none",display:"flex",gap:6}}><span>⟳ drag</span><span style={{opacity:.4}}>·</span><span>scroll/pinch to zoom</span></div>
    </div>
  );
};

// Three-tier upgrade comparison modal. Replaces the prior PaywallGate +
// ProInfoModal. `reason` ('paywall' | 'general') tunes the headline copy
// only; the columns are the same in both flows. `currentTier` controls
// which card gets the Current Plan badge and which CTAs appear.
//
// Copy rules (non-negotiable): no "AI", no em dashes, no exclamations,
// no "unlock/leverage/seamless/elevate". Bev voice, benefit-oriented.
export const UPGRADE_TIER_DEFS = [
  {
    key: 'free',
    name: 'Free',
    priceMain: 'Free',
    priceSub: 'forever',
    blurb: 'Get started with the basics.',
    features: [
      { label: '5 patterns', sub: 'Try Wovely with a small library' },
      { label: 'Standard imports', sub: 'Short and medium patterns welcome' },
    ],
  },
  {
    key: 'craft',
    // priceMain/priceSub intentionally omitted — the Craft card price is
    // cadence-driven and read from TIER_CONFIG.craft in TieredUpgradeModal.
    name: 'Craft',
    blurb: 'For makers who want it all.',
    features: [
      { label: 'Everything in Free, plus', sub: 'A large library, big imports, and BevCheck' },
      { label: 'A large library', sub: 'Room to save plenty of patterns' },
      { label: 'Big patterns welcome', sub: 'Full support for complex multi-component imports' },
      { label: 'BevCheck quality scoring', sub: 'Catch off-counts and broken rounds before you start' },
      { label: 'Collections', sub: 'Organize pattern books and MKALs (3 per month)' },
      { label: 'More Craft features coming', sub: 'First in line as Craft grows' },
    ],
  },
];

// Fair-use wall — shown when a Craft user hits the pattern ceiling. Craft is
// already the only paid tier, so there's nothing to upsell: this is a plain
// support message with NO upgrade CTA, unlike the Free paywall (TieredUpgradeModal).
const FairUseWall = ({ onClose, cap }) => {
  const { isDesktop } = useBreakpoint();
  return (
    <div style={{position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:isDesktop?"center":"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div className="dim-in" style={{position:"absolute",inset:0,background:"rgba(28,23,20,.65)",backdropFilter:"blur(6px)"}}/>
      <div className={isDesktop?"":"su"} onClick={e=>e.stopPropagation()} style={{
        position:"relative",
        background:T.surface,
        borderRadius:isDesktop?20:"24px 24px 0 0",
        width:isDesktop?"min(420px, 92vw)":"100%",
        zIndex:1,
        padding:isDesktop?"28px 28px 26px":"24px 22px 34px",
        boxShadow:isDesktop?"0 24px 80px rgba(28,23,20,.35)":"0 -12px 48px rgba(28,23,20,.28)",
        fontFamily:T.sans,
      }}>
        <button onClick={onClose} aria-label="Close" style={{position:"absolute",top:14,right:16,background:T.linen,border:"none",borderRadius:"50%",width:32,height:32,cursor:"pointer",fontSize:18,color:T.ink3,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        <div style={{fontFamily:T.serif,fontSize:isDesktop?22:20,fontWeight:700,color:T.ink,lineHeight:1.2,marginBottom:10,paddingRight:32}}>Your pattern box is full</div>
        <div style={{fontSize:14,color:T.ink2,lineHeight:1.6}}>You've reached {cap} patterns, our fair-use ceiling. Email <a href="mailto:support@wovely.app" style={{color:T.terra,fontWeight:600,textDecoration:"none"}}>support@wovely.app</a> and we'll lift it for you.</div>
      </div>
    </div>
  );
};

const TieredUpgradeModal = ({ onClose, currentTier, reason, isAnonymous = false, onSignupRequired, recommendedTier = null }) => {
  const { isDesktop } = useBreakpoint();
  const [checkingOut, setCheckingOut] = useState(null); // tier key in flight
  const safeTier = normalizeTier(currentTier);
  // Default step-up: Craft is the natural pick for Free; Craft users see no
  // recommendation (there's no higher tier). When the modal was opened by a
  // Craft-only capability (multi-section/MKAL hub, collections), recommendedTier
  // carries the capability's requiredTier (Craft) so we recommend the plan that
  // actually unlocks it — same target either way now.
  const defaultRec = safeTier === TIER_FREE ? TIER_CRAFT : null;
  const recommendedKey = (recommendedTier && recommendedTier !== safeTier) ? recommendedTier : defaultRec;

  // Billing cadence toggle. Default to annual — it's the better value and the
  // plan we want to surface first. All price/savings numbers are derived from
  // TIER_CONFIG.craft so there's a single source of truth.
  const [cadence, setCadence] = useState('annual');
  const craftCfg = TIER_CONFIG.craft;
  const annualSavings = Math.round(craftCfg.priceMonthly * 12 - craftCfg.priceAnnual);
  // Exactly what the CTA will charge, by cadence. Used verbatim in the button
  // so the amount + cadence are never ambiguous.
  const chargeLabel = cadence === 'annual'
    ? `$${craftCfg.priceAnnual}/year`
    : `$${craftCfg.priceMonthly}/month`;

  const handleCheckout = async (tierKey) => {
    posthog.capture("upgrade_clicked", { tier: tierKey, reason: reason || 'general', anonymous: isAnonymous });
    // Anonymous users can't have a Stripe subscription — there's no email
    // on file. Hand control back to App.jsx so it can open the signup
    // flow with the picked tier stashed; checkout fires after conversion.
    if (isAnonymous) {
      if (onSignupRequired) onSignupRequired(tierKey, cadence);
      return;
    }
    setCheckingOut(tierKey);
    try {
      const user = supabaseAuth.getUser();
      const s = getSession();
      if (!user || !s) throw new Error("Not authenticated");
      const uid = (()=>{try{const p=JSON.parse(atob(s.access_token.split(".")[1]));return p.sub;}catch{return null;}})();
      const res = await fetch("/api/stripe-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid || user.id, email: user.email, tier: tierKey, cadence }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      window.location.href = data.url;
    } catch (err) {
      console.error("[Wovely] Checkout error:", err);
      setCheckingOut(null);
    }
  };

  // Headline copy varies by who's looking. Guests see a signup-first frame
  // ("Pick a plan to start"); paywalled Free users see the cap-hit frame;
  // everyone else sees the generic compare-plans frame.
  const reasonHeader = isAnonymous
    ? "Pick a plan to get started"
    : reason === 'paywall' ? "Your pattern box is full" : "Pick the plan that fits your craft";
  const reasonSub = isAnonymous
    ? "Create your free account, then subscribe to the plan you pick. Free is always available too."
    : reason === 'paywall'
      ? `You've used all ${TIER_CONFIG.free.patternCap} free patterns. Pick a plan to keep adding.`
      : "Compare plans and choose what works for you.";

  return (
    <div style={{position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:isDesktop?"center":"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div className="dim-in" style={{position:"absolute",inset:0,background:"rgba(28,23,20,.65)",backdropFilter:"blur(6px)"}}/>
      <div className={isDesktop?"":"su"} onClick={e=>e.stopPropagation()} style={{
        position:"relative",
        background:T.surface,
        borderRadius:isDesktop?20:"24px 24px 0 0",
        width:isDesktop?"min(960px, 95vw)":"100%",
        maxHeight:isDesktop?"min(720px, 92vh)":"92vh",
        display:"flex",flexDirection:"column",zIndex:1,
        boxShadow:isDesktop?"0 24px 80px rgba(28,23,20,.35)":"0 -12px 48px rgba(28,23,20,.28)",
        overflow:"hidden",
        fontFamily:T.sans,
      }}>
        <div style={{flexShrink:0,padding:isDesktop?"24px 28px 4px":"18px 22px 0",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
          <div>
            <div style={{fontFamily:T.serif,fontSize:isDesktop?24:20,fontWeight:700,color:T.ink,lineHeight:1.2,marginBottom:6}}>{reasonHeader}</div>
            <div style={{fontSize:13,color:T.ink2,lineHeight:1.55,maxWidth:520}}>{reasonSub}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{background:T.linen,border:"none",borderRadius:"50%",width:32,height:32,cursor:"pointer",fontSize:18,color:T.ink3,lineHeight:1,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>

        {/* Monthly/annual segmented toggle. Annual is the default; the savings
            badge and all card prices read from TIER_CONFIG.craft. */}
        <div style={{flexShrink:0,padding:isDesktop?"4px 28px 10px":"4px 22px 10px",display:"flex",flexDirection:"column",alignItems:"center",gap:7}}>
          <div role="group" aria-label="Billing cadence" style={{display:"inline-flex",background:T.linen,borderRadius:99,padding:3,gap:2}}>
            {[['annual','Annual'],['monthly','Monthly']].map(([key,label])=>(
              <button key={key} onClick={()=>setCadence(key)} aria-pressed={cadence===key} style={{
                border:"none",cursor:"pointer",borderRadius:99,padding:"7px 20px",fontSize:13,fontWeight:600,
                background:cadence===key?T.terra:"transparent",
                color:cadence===key?"#fff":T.ink2,
                boxShadow:cadence===key?"0 2px 8px rgba(123,106,212,.3)":"none",
                transition:"background .15s,color .15s",
              }}>{label}</button>
            ))}
          </div>
          <div style={{fontSize:11,fontWeight:700,color:T.terra,letterSpacing:"0.02em"}}>Best value · save ${annualSavings}/yr</div>
        </div>

        <div style={{
          flex:1,
          overflowY:"auto",
          padding:isDesktop?"20px 28px 28px":"18px 18px 36px",
          display:"grid",
          gridTemplateColumns: isDesktop ? "1fr 1fr" : "1fr",
          gap: isDesktop ? 16 : 14,
        }}>
          {UPGRADE_TIER_DEFS.map(def => {
            const isCurrent = safeTier === def.key;
            const isRecommended = recommendedKey === def.key;
            const isCheckingOut = checkingOut === def.key;
            // Paid cards show a cadence-driven price read from TIER_CONFIG;
            // Free keeps its static priceMain/priceSub.
            const isPaidCard = def.key !== TIER_FREE;
            const cfg = TIER_CONFIG[def.key];
            let priceMain = def.priceMain, priceSub = def.priceSub, priceNote = null;
            if (isPaidCard && cfg) {
              if (cadence === 'annual') {
                priceMain = `$${cfg.priceAnnual}`;
                priceSub = '/year';
                priceNote = `about $${Math.round(cfg.priceAnnual / 12)}/mo, billed yearly`;
              } else {
                priceMain = `$${cfg.priceMonthly}`;
                priceSub = '/month';
              }
            }
            const cardStyle = {
              background: "rgba(255,255,255,0.82)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              border: isRecommended ? `1.5px solid ${T.terra}` : "1px solid rgba(255,255,255,0.45)",
              borderRadius: 16,
              boxShadow: isRecommended ? "0 8px 32px rgba(123,106,212,0.18)" : "0 4px 24px rgba(90,66,160,0.08)",
              padding: 20,
              position: "relative",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            };
            return (
              <div key={def.key} style={cardStyle}>
                {isCurrent && (
                  <div style={{position:"absolute",top:12,right:12,background:T.linen,color:T.ink2,fontSize:10,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",padding:"3px 10px",borderRadius:99}}>Current Plan</div>
                )}
                {isRecommended && !isCurrent && (
                  <div style={{position:"absolute",top:12,right:12,background:T.terra,color:"#fff",fontSize:10,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",padding:"3px 10px",borderRadius:99}}>Most popular</div>
                )}
                <div>
                  <div style={{fontFamily:T.serif,fontSize:22,fontWeight:700,color:T.ink,lineHeight:1.1,marginBottom:4}}>{def.name}</div>
                  <div style={{fontSize:12,color:T.ink3,lineHeight:1.5}}>{def.blurb}</div>
                </div>
                <div>
                  <div style={{display:"flex",alignItems:"baseline",gap:4}}>
                    <span style={{fontFamily:T.serif,fontSize:28,fontWeight:700,color:T.ink}}>{priceMain}</span>
                    <span style={{fontSize:12,color:T.ink3}}>{priceSub}</span>
                  </div>
                  {priceNote && <div style={{fontSize:11,color:T.ink3,marginTop:2}}>{priceNote}</div>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:10,flex:1}}>
                  {def.features.map((f, i) => (
                    <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10}}>
                      <div style={{width:18,height:18,borderRadius:"50%",background:T.terraLt,color:T.terra,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}><span style={{fontSize:10,fontWeight:700}}>✓</span></div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:T.ink,lineHeight:1.3}}>{f.label}</div>
                        <div style={{fontSize:11,color:T.ink3,lineHeight:1.45,marginTop:1}}>{f.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:4}}>
                  {isCurrent ? (
                    <div style={{width:"100%",textAlign:"center",fontSize:12,color:T.ink3,padding:"11px 16px",border:`1px solid ${T.border}`,borderRadius:99,fontWeight:600}}>You're on this plan</div>
                  ) : def.key === TIER_FREE ? (
                    // For anonymous users, Free is the create-account-no-charge
                    // path — render an actual button so the conversion intent
                    // is one click. For signed-in Free/paid users it's not an
                    // upgrade target, so the dashed label stays.
                    isAnonymous ? (
                      <button
                        onClick={() => onSignupRequired && onSignupRequired(null)}
                        style={{
                          width:"100%",
                          background:"transparent",
                          color:T.terra,
                          border:`1.5px solid ${T.terra}`,
                          borderRadius:99,
                          padding:"12px 16px",
                          fontSize:14,
                          fontWeight:600,
                          cursor:"pointer",
                        }}
                      >Create Free Account</button>
                    ) : (
                      <div style={{width:"100%",textAlign:"center",fontSize:12,color:T.ink3,padding:"11px 16px",border:`1px dashed ${T.border}`,borderRadius:99}}>Always available</div>
                    )
                  ) : (
                    <button
                      onClick={() => handleCheckout(def.key)}
                      disabled={isCheckingOut}
                      style={{
                        width:"100%",
                        background: isRecommended ? T.terra : "transparent",
                        color: isRecommended ? "#fff" : T.terra,
                        border: isRecommended ? "none" : `1.5px solid ${T.terra}`,
                        borderRadius: 99,
                        padding: "12px 16px",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: isCheckingOut ? "wait" : "pointer",
                        boxShadow: isRecommended ? "0 4px 16px rgba(123,106,212,.3)" : "none",
                        opacity: isCheckingOut ? 0.7 : 1,
                      }}
                    >{isCheckingOut ? "Opening checkout..." : `${isAnonymous ? "Create account & get" : "Get"} ${def.name} — ${chargeLabel}`}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{flexShrink:0,padding:"12px 22px 18px",textAlign:"center",fontSize:11,color:T.ink3,borderTop:`1px solid ${T.border}`}}>
          Cancel anytime. No questions asked.
        </div>
      </div>
    </div>
  );
};


// ── Design System 2b nav icons (woven line style from Wovely App 2b.dc.html) ──
// Stroke SVGs replace the old emoji so the sidebar reads as one crafted system.
const NAV_ICON = {
  collection:(<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="7.3"/><path d="M9 5.4c3 3.6 3 9.6 0 13.2"/><path d="M15 5.4c-3 3.6-3 9.6 0 13.2"/><path d="M5.3 9.6c4 1.9 9.4 1.9 13.4 0"/><path d="M5.3 14.4c4-1.9 9.4-1.9 13.4 0"/></svg>),
  browse:(<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg>),
  stash:(<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12c0-2.3 3.1-3.6 7-3.6s7 1.3 7 3.6-3.1 3.6-7 3.6-7-1.3-7-3.6z"/><rect x="9.8" y="7.8" width="4.4" height="8.4" rx="1.4"/></svg>),
  calculator:(<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5.5 19.5L15.4 9.6"/><path d="M15.4 9.6c1-1.3 2.8-1.5 3.6-.4.8 1.1-.1 2.6-1.7 2.8"/><path d="M10 15l1.6-1.1"/></svg>),
  "stitch-check":(<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.2l7 3v4.8c0 4.4-3 7.4-7 8.8-4-1.4-7-4.4-7-8.8V6.2z"/><path d="M9 12l2 2 4-4.2"/></svg>),
  shopping:(<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 6h14l-1.4 8.4a2 2 0 01-2 1.6H8.4a2 2 0 01-2-1.6z"/><circle cx="9" cy="20" r="1.2"/><circle cx="16" cy="20" r="1.2"/></svg>),
  profile:(<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 19c.8-3.4 3.4-5.2 6.5-5.2s5.7 1.8 6.5 5.2"/></svg>),
  community:(<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20.3l-1.4-1.3C5.4 14.3 2.5 11.6 2.5 8.4 2.5 6 4.4 4.2 6.7 4.2c1.3 0 2.6.6 3.3 1.6.7-1 2-1.6 3.3-1.6 2.3 0 4.2 1.8 4.2 4.2 0 3.2-2.9 5.9-8.1 10.6z"/></svg>),
  sparkle:(<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4.2l1.5 4.3 4.3 1.5-4.3 1.5L12 15.8l-1.5-4.3L6.2 10l4.3-1.5z"/></svg>),
};
// Gold yarn-cord decoration down the sidebar's right edge. The 2b mockup's
// cord defaults to GOLD (cordColor ?? 'gold') and the cord is a sanctioned
// gold surface per the gold-is-scarce rule — same asset as the landing edge.
const CORD_GOLD = "https://res.cloudinary.com/dmaupzhcx/image/upload/e_background_removal/c_crop,g_center,h_0.9,w_1.0/e_trim/v1782961067/website-assets/yarn-cord-gold-frayed.png";
const SidebarCord = () => (
  // Single full-height repeating background instead of 14 stacked <img> tiles.
  // The stack seamed/gapped when the tiles did not sum to the exact column
  // height; a repeat-y background always covers the full height with no seam.
  <div style={{position:"absolute",top:0,left:"calc(100% - 9px)",width:17,height:"100%",pointerEvents:"none",zIndex:6,backgroundImage:`url(${CORD_GOLD})`,backgroundRepeat:"repeat-y",backgroundSize:"100% auto",backgroundPosition:"top center",filter:"drop-shadow(3px 2px 3px rgba(90,58,10,.55)) drop-shadow(6px 4px 8px rgba(90,58,10,.3))"}}/>
);

const SidebarNav = ({view,onNavigate,count,isPro,tier,isAnonymous,onAddPattern,onSignOut,onUpgrade,onOpenAuthWall,userPatterns=[],allPatterns=[]}) => {
  const starterC=DEFAULT_STARTERS.length;const addedC=userPatterns.filter(p=>!p.isStarter&&p.status!=="deleted"&&p.status!=="parked").length;
  // For anonymous users, surface Pro items without the padlock/"Pro feature" visual — the gate fires
  // on click. Showing the lock pre-gate suggests "sign up and you still can't have this" which kills conversion.
  const bevCheckSub = isAnonymous ? "Validate any pattern" : (isPro ? "Validate any pattern" : "Craft feature");
  // Collections is no longer a sibling destination — it lives inside My Wovely
  // as a section below the pattern grid. The tier gating and lock teaser are
  // handled there. Plans modal remains the marketing surface for guests.
  const ITEMS=[{key:"collection",label:"My Wovely",sub:"Your Craft Room"},{key:"browse",label:"Find Patterns",sub:"Find & browse patterns"},{key:"stash",label:"Stash & Notions",sub:"Yarn, hooks & shopping"},{key:"calculator",label:"The Workbench",sub:"Gauge, yardage & more"},{key:"stitch-check",label:"BevCheck",sub:bevCheckSub,proOnly:true},{key:"shopping",label:"Supply Run",sub:"Auto-generated needs"},{key:"community",label:"Yarn Circle",sub:"Finished makes, shared"}];
  const planT = isPro ? `Wovely ${tierLabel(tier)}` : "Free plan";
  const planS = isPro ? "Every feature active" : `${addedC} of ${TIER_CONFIG.free.patternCap} patterns`;
  const navBg = (active) => active ? "rgba(255,255,255,0.18)" : "transparent";
  const Row = ({onClick,icon,label,sub,active,locked,badge,dim}) => (
    <div className="nav-item" onClick={onClick} style={{display:"flex",alignItems:"center",gap:13,padding:"11px 12px",borderRadius:14,background:navBg(active),cursor:"pointer",transition:"background .15s",opacity:dim?.55:1,position:"relative"}}>
      <div style={{width:26,height:26,flex:"none",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",opacity:.94}}>{icon}</div>
      <div style={{flex:1}}><div style={{fontWeight:800,fontSize:15,color:"#fff",lineHeight:1.1}}>{label}</div><div style={{fontWeight:700,fontSize:11.5,color:"rgba(255,255,255,0.66)",marginTop:1}}>{sub}</div></div>
      {locked&&<span style={{fontSize:12,color:"rgba(255,255,255,0.65)"}}>🔒</span>}
      {badge&&<span style={{background:"rgba(255,255,255,0.22)",color:"#fff",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99}}>{badge}</span>}
    </div>
  );
  return (
    <div style={{width:274,flex:"none",background:"linear-gradient(180deg,#8474DA 0%,#6E5AC8 100%)",color:"#fff",height:"100vh",position:"sticky",top:0,display:"flex",flexDirection:"column",padding:"26px 24px 26px 20px",overflowY:"auto"}}>
      <SidebarCord/>
      <div onClick={()=>onNavigate("collection")} style={{display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",gap:8,marginBottom:22,cursor:"pointer",transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=".85"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
        <img src="/bev.png" alt="Bev" style={{width:78,height:78,borderRadius:"50%",border:"3px solid rgba(255,255,255,.55)",background:"#EFE9FB"}}/>
        <div style={{fontFamily:T.disp,fontWeight:600,fontSize:27,lineHeight:1}}>Wovely</div>
        <div style={{fontSize:12.5,color:"rgba(255,255,255,.72)",fontWeight:700}}>Your crochet space</div>
      </div>
      <button onClick={onAddPattern} style={{width:"100%",border:0,borderRadius:16,padding:15,background:"rgba(255,255,255,.94)",color:T.accentD,fontFamily:T.body,fontWeight:800,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:9,boxShadow:"0 10px 22px -12px rgba(0,0,0,.4)"}}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>Add Pattern
      </button>
      <div style={{display:"flex",flexDirection:"column",gap:3,marginTop:22}}>
        {ITEMS.map(item=>{const active=view===item.key;const locked=item.proOnly&&!isPro&&!isAnonymous;return(
          <Row key={item.key} icon={NAV_ICON[item.key]} label={item.label} sub={item.sub} active={active} locked={locked} dim={locked} onClick={()=>{if(locked){onUpgrade();return;}onNavigate(item.key);}}/>
        );})}
        <Row icon={NAV_ICON.sparkle} label={isPro?"My plan":"See plans"} sub={isPro?`You're on ${tierLabel(tier)}`:"Compare Free and Craft"} badge={!isPro&&!isAnonymous?"New":null} onClick={onUpgrade}/>
        <Row icon={NAV_ICON.profile} label="Profile & Settings" sub={isAnonymous?"Sign in to save":"Your corner"} active={view==="profile"} onClick={()=>onNavigate("profile")}/>
      </div>
      <div style={{marginTop:"auto",paddingTop:20,display:"flex",flexDirection:"column",gap:12}}>
        <div style={{background:"rgba(255,255,255,.13)",borderRadius:16,padding:"14px 15px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
          <div><div style={{fontWeight:800,fontSize:14,color:"#fff"}}>{planT}</div><div style={{fontWeight:700,fontSize:11.5,color:"rgba(255,255,255,.66)"}}>{planS}</div></div>
          {isPro
            ? <span style={{display:"inline-flex",alignItems:"center",gap:5,background:"linear-gradient(120deg,#FFD98A,#F5B93E)",color:"#5A3E0E",fontWeight:800,fontSize:11,letterSpacing:".07em",textTransform:"uppercase",padding:"5px 11px",borderRadius:999}}>Craft</span>
            : <button onClick={onUpgrade} style={{border:0,borderRadius:11,padding:"9px 14px",background:T.sun,color:"#5A3E0E",fontFamily:T.body,fontWeight:800,fontSize:13,cursor:"pointer",whiteSpace:"nowrap"}}>Upgrade</button>}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {isAnonymous&&<button onClick={onOpenAuthWall} style={{width:"100%",background:"rgba(255,255,255,.15)",border:"none",borderRadius:12,padding:"9px",fontSize:12.5,color:"#fff",cursor:"pointer",fontWeight:800}}>Create account</button>}
          {onSignOut&&<button onClick={onSignOut} style={{width:"100%",background:"rgba(255,255,255,.15)",border:"none",borderRadius:12,padding:"9px",fontSize:12.5,color:"#fff",cursor:"pointer",fontWeight:800}}>Sign out</button>}
          <div style={{textAlign:"center",fontSize:11,fontWeight:700}}>
            <span onClick={()=>onNavigate("privacy")} style={{color:"rgba(255,255,255,.55)",cursor:"pointer"}}>Privacy</span>
            <span style={{margin:"0 6px",color:"rgba(255,255,255,.3)"}}>|</span>
            <span onClick={()=>onNavigate("terms")} style={{color:"rgba(255,255,255,.55)",cursor:"pointer"}}>Terms</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const NavPanel = ({open,onClose,view,onNavigate,count,isPro,tier,isAnonymous,onSignOut,onUpgrade,onOpenAuthWall}) => {
  const [closing,setClosing]=useState(false);
  const dismiss=()=>{setClosing(true);setTimeout(()=>{setClosing(false);onClose();},220);};
  const go=v=>{onNavigate(v);dismiss();};
  if(!open) return null;
  // See SidebarNav for rationale: hide pre-gate padlocks from anonymous users to not kill conversion motivation.
  const bevCheckSub = isAnonymous ? "Validate any pattern" : (isPro ? "Validate any pattern" : "Craft feature");
  // Same 2b woven SVG icons as the desktop sidebar (NAV_ICON) — the drawer
  // had drifted on old emoji.
  const ITEMS=[{key:"collection",label:"My Wovely",sub:count+" patterns"},{key:"browse",label:"Find Patterns",sub:"Find & browse patterns"},{key:"stash",label:"Stash & Notions",sub:"Manage your yarn"},{key:"calculator",label:"The Workbench",sub:"Gauge, yardage & more"},{key:"stitch-check",label:"BevCheck",sub:bevCheckSub,proOnly:true},{key:"shopping",label:"Supply Run",sub:"Auto-generated needs"},{key:"community",label:"Yarn Circle",sub:"Finished makes, shared"}];
  const drawerIcon=(node)=><span style={{width:26,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",opacity:.94,flexShrink:0}}>{node}</span>;
  const planLabel = isPro ? "My plan" : "See plans";
  // Same rationale as SidebarNav: the modal is the single source of truth
  // for plan comparison, including for anonymous users. The modal itself
  // gates the Stripe step on signup.
  const planSub = isPro ? `You're on ${tierLabel(tier)}` : "Compare Free and Craft";
  const handlePlansClick = () => { onUpgrade(); dismiss(); };
  return (
    <div style={{position:"fixed",inset:0,zIndex:100}}>
      <div className={closing?"dim-out":"dim-in"} onClick={dismiss} style={{position:"absolute",inset:0,background:"rgba(28,23,20,.52)",backdropFilter:"blur(3px)"}}/>
      <div className={closing?"nav-close":"nav-open"} style={{position:"absolute",top:0,left:0,bottom:0,width:"80%",maxWidth:320,background:"#7B6AD4",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"6px 0 40px rgba(28,23,20,.2)"}}>
        <div onClick={()=>go("collection")} style={{display:"flex",alignItems:"center",gap:10,padding:"14px 16px 10px",cursor:"pointer",transition:"opacity .15s",flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.opacity=".85"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
          <div style={{width:40,height:40,borderRadius:"50%",background:"rgba(255,255,255,0.95)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 10px rgba(0,0,0,0.15)",flexShrink:0}}><img src="/bev_neutral.png" alt="Bev" style={{width:32,height:32,borderRadius:"50%",objectFit:"cover"}}/></div>
          <div><span style={{fontFamily:"'Fredoka',serif",fontSize:18,fontWeight:700,color:"#fff",letterSpacing:"-0.01em",lineHeight:1,display:"block"}}>Wovely</span><span style={{fontFamily:"Nunito,sans-serif",fontSize:10,color:"rgba(255,255,255,0.5)",letterSpacing:"0.04em",lineHeight:1,display:"block",marginTop:2}}>Your crochet space</span></div>
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {ITEMS.map(item=>{const active=view===item.key;const locked=item.proOnly&&!isPro&&!isAnonymous;const dis=!!item.disabled;return(
            <div key={item.key} className="nav-item" onClick={()=>{if(dis)return;if(locked){onUpgrade();dismiss();return;}go(item.key);}} style={{display:"flex",alignItems:"center",gap:13,padding:"12px 20px",background:active&&!dis?"rgba(255,255,255,0.25)":"transparent",cursor:dis?"not-allowed":"pointer",transition:"background .12s",opacity:dis?.4:locked?.55:1}}>
              {drawerIcon(NAV_ICON[item.key])}
              <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:"#fff"}}>{item.label}</div><div style={{fontSize:11,color:"rgba(255,255,255,0.65)",marginTop:1}}>{item.sub}</div></div>
              {dis&&<span style={{background:"rgba(255,255,255,.2)",borderRadius:99,padding:"2px 8px",fontSize:9,fontWeight:700,color:"rgba(255,255,255,.8)"}}>Soon</span>}
              {locked&&!dis&&<span style={{fontSize:12,color:"rgba(255,255,255,0.65)"}}>🔒</span>}
              {active&&!locked&&!dis&&<div style={{width:6,height:6,borderRadius:99,background:"#fff"}}/>}
            </div>
          );})}
          {/* Divider */}
          <div style={{height:1,background:"rgba(255,255,255,0.15)",margin:"8px 16px"}} />
          {/* Plans — always-visible entry to TieredUpgradeModal */}
          <div className="nav-item" onClick={handlePlansClick} style={{display:"flex",alignItems:"center",gap:13,padding:"12px 20px",cursor:"pointer",transition:"background .12s"}}>
            {drawerIcon(NAV_ICON.sparkle)}
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:600,color:"#fff"}}>{planLabel}</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.65)",marginTop:1}}>{planSub}</div>
            </div>
            {!isPro&&!isAnonymous&&<span style={{background:"rgba(255,255,255,0.22)",color:"#fff",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99}}>New</span>}
          </div>
          {/* Profile & Settings — inline nav row */}
          {(()=>{const active=view==="profile";return(
            <div className="nav-item" onClick={()=>go("profile")} style={{display:"flex",alignItems:"center",gap:13,padding:"12px 20px",background:active?"rgba(255,255,255,0.25)":"transparent",cursor:"pointer",transition:"background .12s"}}>
              {drawerIcon(NAV_ICON.profile)}
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{fontSize:14,fontWeight:600,color:"#fff"}}>Profile & Settings</div>{isPro&&<span style={{background:"rgba(123,106,212,0.6)",color:"#fff",fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:4}}>{tierLabel(tier).toUpperCase()}</span>}</div>
                {isAnonymous&&<div style={{fontSize:11,color:"rgba(255,255,255,0.65)",marginTop:1}}>Sign in to save</div>}
              </div>
              {active&&<div style={{width:6,height:6,borderRadius:99,background:"#fff"}}/>}
            </div>
          );})()}
          {/* Sign in / Sign out — inline nav row, de-emphasized */}
          {isAnonymous&&<div className="nav-item" onClick={()=>{onOpenAuthWall&&onOpenAuthWall();dismiss();}} style={{display:"flex",alignItems:"center",gap:13,padding:"12px 20px",cursor:"pointer",transition:"background .12s"}}>
            {drawerIcon(<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="14" r="4.2"/><path d="M11 11L19.5 2.5M15.5 6.5l3 3M18 4l2 2"/></svg>)}
            <div style={{fontSize:14,fontWeight:600,color:"#fff"}}>Create account</div>
          </div>}
          {onSignOut&&<div className="nav-item" onClick={()=>{onSignOut();dismiss();}} style={{display:"flex",alignItems:"center",gap:13,padding:"12px 20px",cursor:"pointer",transition:"background .12s"}}>
            {drawerIcon(<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4.5H6.5A1.5 1.5 0 005 6v12a1.5 1.5 0 001.5 1.5H9M15 8.5l4 3.5-4 3.5M19 12H9.5"/></svg>)}
            <div style={{fontSize:14,fontWeight:500,color:"rgba(255,255,255,0.7)"}}>Sign out</div>
          </div>}
          {/* Privacy | Terms */}
          <div style={{textAlign:"center",padding:8,fontSize:10,opacity:0.4}}>
            <span onClick={()=>{dismiss();onNavigate("privacy");}} style={{color:"rgba(255,255,255,.5)",cursor:"pointer"}}>Privacy</span>
            <span style={{margin:"0 6px",color:"rgba(255,255,255,.3)"}}>|</span>
            <span onClick={()=>{dismiss();onNavigate("terms");}} style={{color:"rgba(255,255,255,.5)",cursor:"pointer"}}>Terms</span>
          </div>
        </div>
      </div>
    </div>
  );
};


// "Want to start a collection?" prompt for Craft users right after a
// standard PDF import where the planner flagged the pattern as part of
// a larger project. Sits on top of the PatternCreatedOverlay (which
// auto-dismisses to My Wovely) so the choice is the first thing the
// user sees. Yes → creates a collection, links the new pattern as the
// first part, navigates to the collection detail. No → leaves the
// pattern as a standalone import.
const CollectionSuggestionPrompt = ({ pattern, meta, onYes, onNo }) => {
  const label = meta?.part_label || "Part";
  const total = typeof meta?.expected_part_count === "number" ? meta.expected_part_count : null;
  const name = meta?.collection_name || pattern?.title || "this project";
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(28,23,20,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", fontFamily: T.sans }}>
      <div className="fu" style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.45)", borderRadius: 16, boxShadow: "0 20px 60px rgba(90,66,160,0.28)", padding: 24, width: "100%", maxWidth: 420 }}>
        <div style={{ fontFamily: T.serif, fontSize: 20, fontWeight: 700, color: T.ink, marginBottom: 8, lineHeight: 1.25 }}>This looks like part of a larger project</div>
        <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.55, marginBottom: 18 }}>
          Bev spotted that this pattern might be {label.toLowerCase()} {meta?.current_part_number || 1}{total ? ` of ${total}` : ""} of <strong>{name}</strong>. Want to start a collection so the other {label.toLowerCase()}s can join it?
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onNo} style={{ background: T.linen, border: `1px solid ${T.border}`, borderRadius: 99, padding: "10px 18px", fontSize: 13, color: T.ink2, cursor: "pointer", fontWeight: 600 }}>Keep standalone</button>
          <button onClick={onYes} style={{ background: T.terra, color: "#fff", border: "none", borderRadius: 99, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(123,106,212,0.3)" }}>Yes, create collection</button>
        </div>
      </div>
    </div>
  );
};

// S76: multi_section announcement. Bev tells the user she found a multi-part
// project and laid it out part by part. This is an ANNOUNCEMENT, not a
// collection offer — the pattern stays ONE record and renders as the hub.
// Adaptive by tier: Craft gets the hub pitch; Free/Pro get the same opening
// with a gentle Craft upsell tail.
const MultiSectionAnnouncePrompt = ({ count, isCraft, onGo, onSeeCraft }) => (
  <div style={{ position: "fixed", inset: 0, zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(28,23,20,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", fontFamily: T.sans }}>
    <div className="fu" style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.45)", borderRadius: 16, boxShadow: "0 20px 60px rgba(90,66,160,0.28)", padding: 24, width: "100%", maxWidth: 440 }}>
      <div style={{ fontFamily: T.serif, fontSize: 20, fontWeight: 700, color: T.ink, marginBottom: 8, lineHeight: 1.25 }}>A project worth its own workspace</div>
      <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.6, marginBottom: 18 }}>
        This one's big. {count} parts, each made on its own, then assembled into the finished piece. Bev laid every part out separately so you can work them in any order and always know where you left off.
        {isCraft
          ? " Tap any part to start."
          : " On Craft, Bev breaks a project like this into parts you can work one at a time, instead of scrolling a long PDF."}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        {isCraft ? (
          <button onClick={onGo} style={{ background: T.terra, color: "#fff", border: "none", borderRadius: 99, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(123,106,212,0.3)" }}>Show me the parts</button>
        ) : (
          <>
            <button onClick={onGo} style={{ background: T.linen, border: `1px solid ${T.border}`, borderRadius: 99, padding: "10px 18px", fontSize: 13, color: T.ink2, cursor: "pointer", fontWeight: 600 }}>Open the pattern</button>
            <button onClick={onSeeCraft} style={{ background: T.terra, color: "#fff", border: "none", borderRadius: 99, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(123,106,212,0.3)" }}>See Craft</button>
          </>
        )}
      </div>
    </div>
  </div>
);

// PRO_FEATURES + ProInfoModal removed — both upgrade flows now route
// through TieredUpgradeModal above. Callers pass `reason='paywall'` for
// the cap-hit framing or `reason='general'` for the generic CTA.

// Day-streak tracker for "Your corner". Device-local (localStorage) and real
// going forward — counts consecutive days the app was opened on THIS device.
// Local date (not UTC) so a Jacksonville midnight doesn't split a day.
const STREAK_KEY = "wovely_day_streak";
const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const bumpDayStreak = () => {
  try {
    const today = localDay(new Date());
    const raw = JSON.parse(localStorage.getItem(STREAK_KEY) || "null");
    if (raw?.last === today) return raw.count || 1;
    const yesterday = localDay(new Date(Date.now() - 86400000));
    const count = raw?.last === yesterday ? (raw.count || 0) + 1 : 1;
    localStorage.setItem(STREAK_KEY, JSON.stringify({ last: today, count }));
    return count;
  } catch { return 0; }
};

const ProfileSettingsView = ({isPro,tier,authed,gateAction,onOpenProModal,onGoHome,patterns=[],isAnonymous=false,onSignOut,onCreateAccount}) => {
  const profileNav=useNavigate();
  const [username,setUsername]=useState(""),[displayName,setDisplayName]=useState(""),[bio,setBio]=useState("");
  const [socialInstagram,setSocialInstagram]=useState(""),[socialPinterest,setSocialPinterest]=useState(""),[socialRavelry,setSocialRavelry]=useState("");
  const [profileSaving,setProfileSaving]=useState(false),[profileMsg,setProfileMsg]=useState(null),[profileLoaded,setProfileLoaded]=useState(false);
  const [saveBtnText,setSaveBtnText]=useState("Save Profile");
  const [curPass,setCurPass]=useState(""),[newPass,setNewPass]=useState(""),[passSaving,setPassSaving]=useState(false),[passMsg,setPassMsg]=useState(null);
  // "Your corner" (2b) is the default face of /profile; the working settings
  // form lives one tab over, fully intact.
  const [profileTab,setProfileTab]=useState("corner");
  const [shareState,setShareState]=useState(null); // null | "copied"
  const{isDesktop}=useBreakpoint();
  const user = supabaseAuth.getUser();
  const session = getSession();

  const profilePct = Math.round((displayName.trim()?33:0)+(username.trim()?33:0)+(bio.trim()?34:0));

  // ── "Your corner" stats — real computed values only (no invented numbers).
  // Starters excluded from pattern counts per DEFAULT_STARTERS rule.
  const activePats=(patterns||[]).filter(p=>p.status!=="deleted");
  const realPats=activePats.filter(p=>!p.isStarter);
  const rowsCounted=realPats.reduce((s,p)=>s+((p.rows||[]).filter(r=>!r.isHeader&&!r.isNoteOnly&&r.done).length),0);
  const finishedMakes=realPats.filter(p=>{const c=(p.rows||[]).filter(r=>!r.isHeader&&!r.isNoteOnly);return c.length>0&&c.every(r=>r.done);}).length;
  const bevPassed=realPats.filter(p=>{
    const vr=p.validation_report;
    if(!vr||vr.error||vr.skipped)return false;
    const st=vr.state||vr.overall;
    if(st==="pass"||st==="valid")return true;
    if(typeof vr.score==="number")return vr.score>=80;
    return Array.isArray(vr.flaggedRows)?vr.flaggedRows.length===0:false;
  }).length;
  const dayStreak=bumpDayStreak();
  const sinceYear=user?.created_at?new Date(user.created_at).getFullYear():null;
  const goalYear=new Date().getFullYear();
  const GOAL_TARGET=12;
  const handleShareWovely=async()=>{
    const url="https://wovely.app";
    try{
      if(navigator.share){await navigator.share({title:"Wovely",text:"Bev keeps my crochet patterns and row counts in one cosy place.",url});return;}
      await navigator.clipboard.writeText(url);
      setShareState("copied");setTimeout(()=>setShareState(null),2000);
    }catch{}
  };

  useEffect(()=>{
    if (!user || profileLoaded) return;
    (async ()=>{
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user.id}&select=username,display_name,bio,social_instagram,social_pinterest,social_ravelry`, {
          headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${session.access_token}`},
        });
        if (res.ok) {
          const rows = await res.json();
          if (rows[0]) { setUsername(rows[0].username||""); setDisplayName(rows[0].display_name||""); setBio(rows[0].bio||""); setSocialInstagram(rows[0].social_instagram||""); setSocialPinterest(rows[0].social_pinterest||""); setSocialRavelry(rows[0].social_ravelry||""); }
        }
      } catch {}
      setProfileLoaded(true);
    })();
  },[user?.id]);

  const handleProfileSave = async () => {
    const handle = username.trim().replace(/^@/,"");
    if (handle && !/^[a-zA-Z0-9_]{2,30}$/.test(handle)) { setProfileMsg({type:"error",text:"Username: 2-30 chars, letters/numbers/underscores only."}); return; }
    setProfileSaving(true); setProfileMsg(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user.id}`, {
        method:"PATCH",
        headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${session.access_token}`,"Content-Type":"application/json","Prefer":"return=minimal"},
        body:JSON.stringify({username:handle||null, display_name:displayName.trim()||null, bio:bio.trim()||null, social_instagram:socialInstagram.trim()||null, social_pinterest:socialPinterest.trim()||null, social_ravelry:socialRavelry.trim()||null}),
      });
      if (!res.ok) {
        const d = await res.json().catch(()=>({}));
        if (d.message?.includes("unique") || d.code === "23505") { setProfileMsg({type:"error",text:"Username already taken."}); setProfileSaving(false); return; }
        setProfileMsg({type:"error",text:d.message||"Save failed."}); setProfileSaving(false); return;
      }
      setProfileMsg(null);
      setSaveBtnText("Saved!");
      setTimeout(()=>setSaveBtnText("Save Profile"),2000);
    } catch { setProfileMsg({type:"error",text:"Network error."}); }
    setProfileSaving(false);
  };

  const handleChangePassword = async () => {
    if (!newPass || newPass.length < 6) { setPassMsg({type:"error",text:"New password must be at least 6 characters."}); return; }
    setPassSaving(true); setPassMsg(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method:"PUT",
        headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${session.access_token}`,"Content-Type":"application/json"},
        body:JSON.stringify({password:newPass}),
      });
      if (!res.ok) { const d = await res.json().catch(()=>({})); setPassMsg({type:"error",text:d.msg||d.error_description||"Failed."}); setPassSaving(false); return; }
      setPassMsg({type:"ok",text:"Password updated."}); setCurPass(""); setNewPass("");
    } catch { setPassMsg({type:"error",text:"Network error."}); }
    setPassSaving(false);
  };

  // 2b card treatment for the settings sections (solid white panel, hairline
  // border, layered lavender shadow) + 2b eyebrow labels.
  const SECTION = {background:"#fff",border:`1px solid ${T.line}`,borderRadius:22,padding:isDesktop?"26px 30px":"22px 18px",boxShadow:T.shadowLg};
  const SC_LABEL = {fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".05em",fontFamily:T.body};
  const SECTION_TITLE = {fontFamily:T.disp,fontSize:20,fontWeight:600,color:T.ink,marginBottom:20};
  const DIVIDER = <div style={{height:16}}/>;
  const Msg = ({msg}) => msg ? <div style={{background:msg.type==="ok"?"rgba(92,122,94,.1)":T.terraLt,borderRadius:12,padding:"10px 14px",fontSize:12,color:msg.type==="ok"?T.sage:T.terra,lineHeight:1.5,marginBottom:8}}>{msg.text}</div> : null;

  // 2b achievement defs ("Stitches earned") — earned/locked off real signals
  // only. Locked = honest not-yet, never a fake badge.
  const ACHIEVEMENTS=[
    {t:"First Stitch",s:"Imported a pattern",earned:realPats.length>=1,icon:<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2.5 2.3"><circle cx="12" cy="12" r="7.3"/><path d="M9 5.4c3 3.6 3 9.6 0 13.2"/><path d="M15 5.4c-3 3.6-3 9.6 0 13.2"/></svg>},
    {t:"Finisher",s:"First finished make",earned:finishedMakes>=1,icon:<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M8.4 12.4l2.4 2.4 4.6-5"/></svg>},
    {t:"Five in a Row",s:"5-day streak",earned:dayStreak>=5,icon:<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2.5 2.3"><rect x="4.5" y="5.5" width="15" height="14.5" rx="2.5"/><path d="M4.5 10h15M8.5 3.5v3M15.5 3.5v3" style={{strokeDasharray:"none"}}/><path d="M8 14l2.6 2.6 5-5.4" style={{strokeDasharray:"none"}}/></svg>},
    {t:"Century Club",s:"100 rows counted",earned:rowsCounted>=100,icon:<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2.5 2.3"><path d="M4 19V9M10 19V5M16 19v-8M22 19H2"/></svg>},
    {t:"Frog Free",s:"10 BevChecks passed",earned:bevPassed>=10,icon:<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2.5 2.3"><path d="M12 3.2l7 3v4.8c0 4.4-3 7.4-7 8.8-4-1.4-7-4.4-7-8.8V6.2z"/><path d="M9 12l2 2 4-4.2" style={{strokeDasharray:"none"}}/></svg>},
    {t:"Deep Stash",s:"20 patterns stored",earned:realPats.length>=20,icon:<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2.5 2.3"><path d="M5 12c0-2.3 3.1-3.6 7-3.6s7 1.3 7 3.6-3.1 3.6-7 3.6-7-1.3-7-3.6z"/><rect x="9.8" y="7.8" width="4.4" height="8.4" rx="1.4" style={{strokeDasharray:"none"}}/></svg>},
  ];
  const planLabel=isPro?tierLabel(tier):"Free";
  const initials=((displayName||username||user?.email||"W").trim().charAt(0)||"W").toUpperCase();
  const GOAL_CARD={background:"#fff",border:`1px solid ${T.line}`,borderRadius:16,padding:"16px 18px",marginTop:14};
  const PACTION={display:"inline-flex",alignItems:"center",gap:8,background:"#fff",border:`1px solid ${T.line}`,borderRadius:12,padding:"10px 15px",fontFamily:T.body,fontWeight:800,fontSize:13.5,color:T.ink,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0};

  return (
    <div style={{padding:isDesktop?"24px 0 80px":"16px 18px 100px",maxWidth:760,fontFamily:T.body}}>
      <button onClick={onGoHome} style={{background:"none",border:"none",color:T.ink3,cursor:"pointer",fontSize:13,fontWeight:500,padding:0,marginBottom:16,display:"flex",alignItems:"center",gap:4}}>← My Wovely</button>

      {/* ── 2b "Your corner" header (Wovely App 2b.dc.html Profile screen) ── */}
      <div style={{fontFamily:T.disp,fontWeight:600,fontSize:isDesktop?38:30,letterSpacing:"-.01em",color:T.ink,lineHeight:1.05}}>Your corner</div>
      <div style={{fontWeight:700,fontSize:15,color:T.muted,marginTop:2}}>Everything you've made, earned and saved.</div>

      <div style={{display:"flex",gap:6,borderBottom:`1px solid ${T.line}`,margin:"20px 0 0"}}>
        {[["corner","Your corner"],["settings","Settings"]].map(([k,l])=>(
          <button key={k} onClick={()=>setProfileTab(k)} style={{padding:"12px 18px",border:"none",background:"transparent",fontFamily:T.body,fontWeight:800,fontSize:15,color:profileTab===k?T.accent:T.muted,cursor:"pointer",borderBottom:"3px solid "+(profileTab===k?T.accent:"transparent"),marginBottom:-1,transition:"color .15s"}}>{l}</button>
        ))}
      </div>

      {profileTab==="corner"&&(<>
        {/* profhead — avatar hero */}
        <div style={{display:"flex",alignItems:"center",gap:isDesktop?22:14,background:"#fff",border:`1px solid ${T.line}`,borderRadius:24,padding:isDesktop?"26px 30px":"20px 18px",marginTop:22,boxShadow:T.shadowLg}}>
          <div style={{width:92,height:92,borderRadius:"50%",border:"3px solid #DCD0F7",background:T.soft,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.disp,fontWeight:600,fontSize:36,color:T.accent}}>{initials}</div>
          <div style={{minWidth:0}}>
            <div style={{fontFamily:T.disp,fontWeight:600,fontSize:28,color:T.ink,lineHeight:1.1}}>{displayName||"Wovely maker"}</div>
            <div style={{fontWeight:700,fontSize:14,color:T.muted,marginTop:3}}>{sinceYear?`Making since ${sinceYear} · ${planLabel} plan`:`${planLabel} plan`}</div>
          </div>
          {isPro
            ?<span style={{marginLeft:"auto",display:"inline-flex",alignItems:"center",gap:5,background:"linear-gradient(120deg,#FFD98A,#F5B93E)",color:"#5A3E0E",fontWeight:800,fontSize:11,letterSpacing:".07em",textTransform:"uppercase",padding:"5px 11px",borderRadius:999,boxShadow:"0 6px 14px -6px rgba(200,150,40,.6)",flexShrink:0}}>✦ {planLabel}</span>
            :<button onClick={onOpenProModal} style={{marginLeft:"auto",border:0,borderRadius:11,padding:"9px 14px",background:T.sun,color:"#5A3E0E",fontFamily:T.body,fontWeight:800,fontSize:13,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>Upgrade</button>}
        </div>

        {/* profstats — 4 real-data tiles */}
        <div style={{display:isDesktop?"flex":"grid",gridTemplateColumns:"1fr 1fr",gap:12,margin:"18px 0 0"}}>
          {[[realPats.length,realPats.length===1?"Pattern":"Patterns"],[rowsCounted,"Rows counted"],[finishedMakes,finishedMakes===1?"Finished make":"Finished makes"],[dayStreak,"Day streak"]].map(([n,l])=>(
            <div key={l} style={{flex:1,background:"#fff",border:`1px solid ${T.line}`,borderRadius:16,padding:16,textAlign:"center"}}>
              <b style={{fontFamily:T.disp,fontWeight:600,fontSize:26,display:"block",color:T.accent}}>{n}</b>
              <span style={{fontWeight:800,fontSize:12,color:T.muted}}>{l}</span>
            </div>
          ))}
        </div>

        {/* goalcard — yearly finished-makes goal, real progress */}
        <div style={GOAL_CARD}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
            <div>
              <div style={{fontWeight:800,fontSize:13,color:T.ink}}>{goalYear} goal — {GOAL_TARGET} finished makes</div>
              <div style={{fontWeight:700,fontSize:11.5,color:T.muted,marginTop:2}}>{finishedMakes>=GOAL_TARGET?"Goal met — Bev is beside herself":`${finishedMakes} down, ${GOAL_TARGET-finishedMakes} to go — Bev believes in you`}</div>
            </div>
          </div>
          <div style={{height:9,borderRadius:999,background:T.line,marginTop:12,overflow:"hidden"}}>
            <span style={{display:"block",height:"100%",borderRadius:999,width:`${Math.min(100,Math.round(finishedMakes/GOAL_TARGET*100))}%`,background:`linear-gradient(90deg,${T.accent},${T.pink})`}}/>
          </div>
        </div>

        {/* share card — honest version of the mockup referral card (the
            give-a-month referral mechanic isn't built yet; no false promise) */}
        <div style={GOAL_CARD}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
            <div style={{minWidth:0,flex:"1 1 220px"}}>
              <div style={{fontWeight:800,fontSize:13,color:T.ink}}>Share Wovely with a maker friend</div>
              <div style={{fontWeight:700,fontSize:11.5,color:T.muted,marginTop:2}}>Know someone who'd love Bev? Send them a link.</div>
            </div>
            <button onClick={handleShareWovely} style={PACTION}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 13v6h14v-6"/></svg>
              {shareState==="copied"?"Link copied!":"Share Wovely"}
            </button>
          </div>
        </div>

        {/* Stitches earned — achievements grid, real earned/locked states */}
        <div style={{fontWeight:800,fontSize:11.5,letterSpacing:".09em",textTransform:"uppercase",color:T.muted,margin:"28px 0 7px"}}>Stitches earned</div>
        <div style={{display:"grid",gridTemplateColumns:isDesktop?"repeat(3,1fr)":"repeat(2,1fr)",gap:12}}>
          {ACHIEVEMENTS.map(a=>(
            <div key={a.t} style={{background:"#fff",border:`1px solid ${T.line}`,borderRadius:16,padding:"16px 12px",textAlign:"center",opacity:a.earned?1:.5,filter:a.earned?"none":"grayscale(.55)"}}>
              <div style={{width:46,height:46,borderRadius:14,background:T.soft,display:"flex",alignItems:"center",justifyContent:"center",color:T.accent,margin:"0 auto"}}>{a.icon}</div>
              <div style={{fontFamily:T.disp,fontWeight:600,fontSize:14.5,color:T.ink,marginTop:10}}>{a.t}</div>
              <div style={{fontWeight:700,fontSize:11.5,color:T.muted,marginTop:2}}>{a.s}</div>
            </div>
          ))}
        </div>

        {/* Quick settings rows — real destinations only */}
        <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:18}}>
          <div onClick={onOpenProModal} style={{display:"flex",alignItems:"center",gap:13,background:"#fff",border:`1px solid ${T.line}`,borderRadius:14,padding:"15px 18px",fontWeight:800,fontSize:14.5,color:T.ink,cursor:"pointer"}}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4.2l1.5 4.3 4.3 1.5-4.3 1.5L12 15.8l-1.5-4.3L6.2 10l4.3-1.5z"/></svg>
            Manage plan<span style={{marginLeft:"auto",color:T.muted,fontWeight:700,fontSize:13}}>{isPro?`Wovely ${planLabel}`:"See what Craft includes"}</span>
          </div>
          <div onClick={()=>setProfileTab("settings")} style={{display:"flex",alignItems:"center",gap:13,background:"#fff",border:`1px solid ${T.line}`,borderRadius:14,padding:"15px 18px",fontWeight:800,fontSize:14.5,color:T.ink,cursor:"pointer"}}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 19c.8-3.4 3.4-5.2 6.5-5.2s5.7 1.8 6.5 5.2"/></svg>
            Profile &amp; account settings<span style={{marginLeft:"auto",color:T.muted,fontWeight:700,fontSize:13}}>Name, bio, password</span>
          </div>
          {/* Account entries — the mobile shell has no drawer, so these live
              here (mockup setlist has the coral Log out row). */}
          {isAnonymous&&onCreateAccount&&(
            <div onClick={onCreateAccount} style={{display:"flex",alignItems:"center",gap:13,background:"#fff",border:`1px solid ${T.line}`,borderRadius:14,padding:"15px 18px",fontWeight:800,fontSize:14.5,color:T.ink,cursor:"pointer"}}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="14" r="4.2"/><path d="M11 11L19.5 2.5M15.5 6.5l3 3M18 4l2 2"/></svg>
              Create account<span style={{marginLeft:"auto",color:T.muted,fontWeight:700,fontSize:13}}>Save your work everywhere</span>
            </div>
          )}
          {!isAnonymous&&authed&&onSignOut&&(
            <div onClick={onSignOut} style={{display:"flex",alignItems:"center",gap:13,background:"#fff",border:`1px solid ${T.line}`,borderRadius:14,padding:"15px 18px",fontWeight:800,fontSize:14.5,color:T.coral,cursor:"pointer"}}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4.5H6.5A1.5 1.5 0 005 6v12a1.5 1.5 0 001.5 1.5H9M15 8.5l4 3.5-4 3.5M19 12H9.5"/></svg>
              Log out
            </div>
          )}
        </div>
      </>)}

      {profileTab==="settings"&&(<div style={{maxWidth:560,marginTop:22}}>
      {/* Profile completion bar — 2b treatment (accent fill, mint at 100%) */}
      <div style={{marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
          <div style={SC_LABEL}>Profile completion</div>
          <div style={{fontSize:12,color:profilePct===100?T.mint:T.accent,fontWeight:800}}>{profilePct}%</div>
        </div>
        <div style={{height:6,background:T.line,borderRadius:99,overflow:"hidden"}}>
          <div style={{height:"100%",width:profilePct+"%",background:profilePct===100?T.mint:`linear-gradient(90deg,${T.accent},${T.pink})`,borderRadius:99,transition:"width .3s ease"}}/>
        </div>
      </div>

      <div style={SECTION}>
        <div style={SECTION_TITLE}>Your Profile</div>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{width:92,height:92,borderRadius:"50%",background:T.soft,display:"inline-flex",alignItems:"center",justifyContent:"center",fontFamily:T.disp,fontSize:34,fontWeight:600,color:T.accent,border:"3px solid #DCD0F7"}}>{(displayName||username||"W").trim().charAt(0).toUpperCase()}</div>
          <div style={{fontFamily:T.disp,fontSize:17,fontWeight:600,color:T.ink,marginTop:12}}>{displayName||"Your Name"}</div>
          <div style={{fontSize:13,fontWeight:700,color:T.muted,marginTop:2}}>{username?"@"+username:"Set your username"}</div>
        </div>
        <Field label="Display name" placeholder="e.g. Sarah" value={displayName} onChange={e=>setDisplayName(e.target.value)}/>
        <div style={{marginBottom:14}}>
          <div style={{...SC_LABEL,marginBottom:6}}>Username</div>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:16,top:"50%",transform:"translateY(-50%)",color:T.muted,fontSize:15,fontWeight:700,pointerEvents:"none"}}>@</span>
            <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="yourhandle" style={{width:"100%",padding:"13px 16px 13px 34px",background:"#fff",border:`1.5px solid ${T.line}`,borderRadius:14,color:T.ink,fontSize:15,fontFamily:T.body,fontWeight:600,outline:"none",transition:"border-color .2s"}} onFocus={e=>e.target.style.borderColor=T.accent} onBlur={e=>e.target.style.borderColor=T.line}/>
          </div>
        </div>
        <Field label="Bio" placeholder="Tell us about your craft..." value={bio} onChange={e=>setBio(e.target.value)} rows={3}/>
        <div style={{borderTop:`1px solid ${T.line}`,paddingTop:20,marginTop:12}}>
          <div style={{...SC_LABEL,marginBottom:14}}>Social connections</div>
          <Field label="Instagram handle" placeholder="@yourhandle" value={socialInstagram} onChange={e=>setSocialInstagram(e.target.value)}/>
          <Field label="Pinterest handle" placeholder="@yourhandle" value={socialPinterest} onChange={e=>setSocialPinterest(e.target.value)}/>
          <Field label="Ravelry username" placeholder="yourhandle" value={socialRavelry} onChange={e=>setSocialRavelry(e.target.value)}/>
        </div>
        <Msg msg={profileMsg}/>
        <button onClick={()=>gateAction?.({ intent: "profile_edit", title: "Create a free account to save your profile", subtitle: "Your name, handle, and socials stay with you across devices." }, handleProfileSave)} disabled={profileSaving} style={{background:T.accent,color:"#fff",border:"none",borderRadius:13,padding:"12px 26px",fontSize:14,fontWeight:800,fontFamily:T.body,cursor:"pointer",boxShadow:`0 12px 24px -12px ${T.accent}`,opacity:profileSaving?.6:1}}>{profileSaving?"Saving…":saveBtnText}</button>
      </div>

      {DIVIDER}

      <div style={SECTION}>
        <div style={SECTION_TITLE}>Account</div>
        <div style={{marginBottom:14}}>
          <div style={{...SC_LABEL,marginBottom:6}}>Email</div>
          <div style={{padding:"13px 16px",background:T.soft,borderRadius:14,color:T.ink2,fontSize:15,fontWeight:600}}>{user?.email||"—"}</div>
        </div>
        <div style={{borderTop:`1px solid ${T.line}`,paddingTop:20}}>
          <div style={{...SC_LABEL,marginBottom:14}}>Change password</div>
          <Field label="Current password" placeholder="••••••••" value={curPass} onChange={e=>setCurPass(e.target.value)} type="password"/>
          <Field label="New password" placeholder="••••••••" value={newPass} onChange={e=>setNewPass(e.target.value)} type="password"/>
          <Msg msg={passMsg}/>
          <button onClick={()=>gateAction?.({ intent: "change_password", title: "Create a free account first", subtitle: "Sign up to set a password." }, handleChangePassword)} disabled={passSaving} style={{background:T.accent,color:"#fff",border:"none",borderRadius:13,padding:"11px 22px",fontSize:13,fontWeight:800,fontFamily:T.body,cursor:"pointer",boxShadow:`0 12px 24px -12px ${T.accent}`,opacity:passSaving?.6:1}}>{passSaving?"Saving…":"Update Password"}</button>
        </div>
      </div>

      {DIVIDER}

      {isPro
        ? <div style={{...SECTION,background:`linear-gradient(135deg,${T.accent},${T.accentD})`,border:"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:18}}>✨</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:700,color:"#fff"}}>Wovely {tierLabel(tier)}</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,.7)",marginTop:2}}>Every feature active, including Collections</div>
              </div>
            </div>
          </div>
        : <div style={{...SECTION,background:`linear-gradient(135deg,${T.accent},${T.accentD})`,border:"none"}}>
            <div style={{fontSize:14,fontWeight:700,color:"#fff",marginBottom:4}}>✨ Upgrade your plan</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.75)",lineHeight:1.5,marginBottom:12}}>Craft gives you big imports, a large library, Collections, and BevCheck.</div>
            <div onClick={onOpenProModal} style={{background:"rgba(255,255,255,.2)",borderRadius:10,padding:"10px",textAlign:"center",fontSize:14,fontWeight:700,color:"#fff",cursor:"pointer"}}>See plans</div>
          </div>
      }

      {DIVIDER}

      {/* Plan & Billing — clean list-style row that always opens the
          TieredUpgradeModal. The big gradient card above is the marquee
          surface for free users; this row is the discoverable settings
          path for everyone (especially paid users who'd otherwise see
          no obvious "manage plan" entry). */}
      <div style={SECTION}>
        <div style={SECTION_TITLE}>Plan &amp; Billing</div>
        <div onClick={onOpenProModal} style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",padding:"4px 0"}}>
          <div>
            <div style={{fontSize:14.5,fontWeight:800,color:T.ink}}>{isPro ? `Wovely ${tierLabel(tier)}` : 'Free plan'}</div>
            <div style={{fontSize:12,fontWeight:700,color:T.muted,marginTop:3}}>{isPro ? 'Tap to manage or compare plans' : 'See what Craft includes'}</div>
          </div>
          <div style={{fontSize:13,fontWeight:800,color:T.accent,whiteSpace:"nowrap"}}>{isPro ? 'Manage plan ›' : 'See plans ›'}</div>
        </div>
      </div>

      <div style={SECTION}>
        <div style={SECTION_TITLE}>Preferences</div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div><div style={{fontSize:14.5,fontWeight:800,color:T.ink}}>Dark mode</div><div style={{fontSize:12,fontWeight:700,color:T.muted,marginTop:3}}>coming soon</div></div>
          <div style={{width:44,height:26,borderRadius:13,background:T.soft,opacity:.6,position:"relative",cursor:"not-allowed"}}><div style={{width:22,height:22,borderRadius:11,background:"#fff",position:"absolute",top:2,left:2,boxShadow:"0 1px 3px rgba(0,0,0,.15)"}}/></div>
        </div>
      </div>

      <div style={{textAlign:"center",padding:"20px 0 8px",fontSize:12,color:"#726A92"}}>
        <span onClick={()=>profileNav("/privacy")} style={{color:"#726A92",cursor:"pointer"}} onMouseEnter={e=>e.target.style.color="#7B6AD4"} onMouseLeave={e=>e.target.style.color="#726A92"}>Privacy Policy</span>
        <span style={{margin:"0 8px",opacity:.5}}>|</span>
        <span onClick={()=>profileNav("/terms")} style={{color:"#726A92",cursor:"pointer"}} onMouseEnter={e=>e.target.style.color="#7B6AD4"} onMouseLeave={e=>e.target.style.color="#726A92"}>Terms of Service</span>
      </div>
      </div>)}
    </div>
  );
};



const BrowseSitesView = ({onImportUrl}) => {
  const{isDesktop,isTablet,isMobile}=useBreakpoint();
  const [url,setUrl]=useState("");
  const SITES=[
    {name:"AllFreeCrochet",desc:"The largest free crochet pattern library.",url:"https://www.allfreecrochet.com",tags:["Blankets","Amigurumi","Wearables"],free:true},
    {name:"Drops Design",desc:"Free international patterns.",url:"https://www.garnstudio.com",tags:["Garments","Accessories"],free:true},
    {name:"Yarnspirations",desc:"Official home of Caron and Bernat patterns.",url:"https://www.yarnspirations.com/collections/crochet-patterns",tags:["Beginner","Blankets"],free:true},
    {name:"Sarah Maker",desc:"Modern, well-photographed patterns.",url:"https://sarahmaker.com/crochet-patterns/",tags:["Modern","Beginner","Amigurumi"],free:true},
    {name:"Hopeful Honey",desc:"Beloved amigurumi patterns.",url:"https://www.hopefulhoney.com/p/free-crochet-patterns.html",tags:["Amigurumi","Toys"],free:true},
    {name:"The Woobles",desc:"Amigurumi kits and free beginner tutorials.",url:"https://thewoobles.com/pages/free-crochet-patterns",tags:["Amigurumi","Beginner"],free:true},
    {name:"Ravelry",desc:"World's largest pattern database.",url:"https://www.ravelry.com/patterns/library#craft=crochet",tags:["All categories","Free + Paid"],free:false},
    {name:"LoveCrafts",desc:"Quality free and paid patterns.",url:"https://www.lovecrafts.com/en-us/l/crochet/crochet-patterns?price=free",tags:["Garments","Modern"],free:false},
  ];
  const doImport=()=>{
    if(!url.trim()) return;
    onImportUrl(url.trim());
    setUrl("");
  };
  return (
    <div style={{padding:isDesktop?"24px 24px 80px":"16px 20px 100px",maxWidth:960,margin:"0 auto",background:"transparent"}}>
      {/* Section 1 — URL Import */}
      <div style={{background:"rgba(255,255,255,0.82)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderRadius:20,border:"1px solid rgba(255,255,255,0.6)",padding:isDesktop?"32px":"24px 20px",marginBottom:32,boxShadow:"0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(123,106,212,0.13)",maxWidth:700}}>
        <div style={{fontFamily:"'Fredoka',Georgia,serif",fontSize:20,fontWeight:700,color:"#2E2748",marginBottom:8}}>Import a Pattern</div>
        <div style={{fontSize:14,color:"#726A92",lineHeight:1.7,marginBottom:20}}>Find a pattern on any crochet site, copy the URL from your browser, and paste it below to import it directly into Wovely.</div>
        <div style={{display:"flex",gap:10,flexDirection:isMobile?"column":"row"}}>
          <div style={{flex:1,display:"flex",alignItems:"center",background:T.linen,border:`1.5px solid ${T.border}`,borderRadius:12,padding:"12px 16px",gap:10}}>
            <span style={{color:T.ink3,flexShrink:0}}>🔗</span>
            <input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doImport()} placeholder="https://allfreecrochet.com/..." style={{border:"none",background:"transparent",flex:1,fontSize:14,color:T.ink,outline:"none",minWidth:0}}/>
          </div>
          <button onClick={doImport} disabled={!url.trim()} style={{background:"#7B6AD4",color:"#fff",border:"none",borderRadius:12,padding:"12px 24px",fontSize:14,fontWeight:600,cursor:!url.trim()?"not-allowed":"pointer",opacity:!url.trim()?.6:1,whiteSpace:"nowrap",flexShrink:0}}>Import Pattern →</button>
        </div>
        <div style={{background:"#FFF8E7",border:"1px solid #F0C040",borderRadius:8,padding:"8px 12px",marginTop:12,fontSize:12,color:"#856404",lineHeight:1.5,fontFamily:"Nunito,sans-serif"}}>⚠️ Patterns behind a paywall or login wall can't be imported by URL. Download the PDF and use our PDF import instead.</div>
      </div>

      {/* Section 2 — Partner Sites Grid */}
      <div style={{marginBottom:32}}>
        <div style={{fontFamily:"'Fredoka',Georgia,serif",fontSize:18,fontWeight:700,color:"#2E2748",marginBottom:6}}>Browse Partner Sites</div>
        <div style={{fontSize:14,color:"#726A92",lineHeight:1.7,marginBottom:20}}>Open any site below to browse their patterns. When you find one you love, copy the URL and paste it above.</div>
        <div style={{display:"grid",gridTemplateColumns:isDesktop?"repeat(3,1fr)":isTablet?"repeat(2,1fr)":"1fr",gap:16}}>
          {SITES.map(s=>(
            <div key={s.name} style={{background:"rgba(255,255,255,0.82)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderRadius:20,border:"1px solid rgba(255,255,255,0.6)",boxShadow:"0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(123,106,212,0.13)",overflow:"hidden",transition:"transform .15s,box-shadow .15s"}} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 32px rgba(123,106,212,0.2)";}} onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(123,106,212,0.13)";}}>
              <div style={{background:"linear-gradient(135deg, #ECE6F8 0%, #F5F2FF 100%)",height:72,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
                <div style={{fontFamily:T.serif,fontSize:17,fontWeight:600,color:"#2E2748"}}>{s.name}</div>
                <div style={{position:"absolute",top:10,right:10}}><div style={{background:s.free?T.success:T.accentD,borderRadius:9999,padding:"2px 8px",fontSize:9,fontWeight:700,color:"#fff"}}>{s.free?"FREE":"FREE + PAID"}</div></div>
              </div>
              <div style={{padding:"14px 18px 18px"}}>
                <div style={{fontSize:13,color:"#726A92",lineHeight:1.5,marginBottom:10}}>{s.desc}</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:14}}>{s.tags.map(t=><div key={t} style={{background:"#ECE6F8",borderRadius:9999,padding:"2px 8px",fontSize:10,fontWeight:600,color:"#7B6AD4"}}>{t}</div>)}</div>
                <a href={s.url} target="_blank" rel="noopener noreferrer" style={{display:"block",width:"100%",background:"#7B6AD4",color:"#fff",border:"none",borderRadius:9999,padding:"10px",fontSize:13,fontWeight:600,cursor:"pointer",textAlign:"center",textDecoration:"none",boxSizing:"border-box"}}>Visit {s.name} →</a>
                <div style={{fontSize:11,color:"#9B9B9B",textAlign:"center",marginTop:6}}>Opens in new tab</div>
              </div>
            </div>
          ))}
          <div style={{background:"#F5F2FF",borderRadius:16,border:"1.5px dashed #ECE6F8",display:"flex",alignItems:"center",justifyContent:"center",minHeight:200}}>
            <div style={{textAlign:"center",padding:20}}><div style={{fontSize:24,marginBottom:8,opacity:.4}}>🌐</div><div style={{fontSize:13,color:"#9B9B9B",fontWeight:500}}>More sites coming soon</div></div>
          </div>
        </div>
      </div>

      {/* Section 3 — Coming Soon Banner */}
      <div style={{background:"#ECE6F8",borderRadius:16,padding:isDesktop?"28px 32px":"24px 20px",display:"flex",flexDirection:isMobile?"column":"row",alignItems:isMobile?"flex-start":"center",gap:isMobile?20:32}}>
        <div style={{flex:1}}>
          <div style={{marginBottom:10}}><img src="/bev_neutral.png" alt="Bev" style={{width:48,height:48,objectFit:"contain"}} onError={e=>{e.target.style.display="none";e.target.parentElement.innerHTML="🐍";}}/></div>
          <div style={{fontFamily:"'Fredoka',Georgia,serif",fontSize:18,fontWeight:700,color:"#2E2748",marginBottom:8}}>Seamless browsing is coming.</div>
          <div style={{fontSize:14,color:"#726A92",lineHeight:1.7}}>The Wovely app will let you browse any crochet site and save patterns with a single tap — no copying, no pasting.</div>
        </div>
        <div style={{display:"flex",gap:12,flexDirection:isMobile?"column":"row",alignItems:"center",flexShrink:0}}>
          <div style={{background:"#1C1C1E",borderRadius:12,padding:"12px 20px",display:"flex",alignItems:"center",gap:10,opacity:.7,cursor:"default",minWidth:120}}>
            <svg width="20" height="24" viewBox="0 0 384 512" fill="#fff"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>
            <div><div style={{fontSize:13,fontWeight:600,color:"#fff",fontFamily:"Nunito,sans-serif",lineHeight:1.2}}>App Store</div><div style={{fontSize:10,color:"rgba(255,255,255,.6)",fontFamily:"Nunito,sans-serif"}}>Coming Soon</div></div>
          </div>
          <div style={{background:"#1C1C1E",borderRadius:12,padding:"12px 20px",display:"flex",alignItems:"center",gap:10,opacity:.7,cursor:"default",minWidth:120}}>
            <svg width="18" height="20" viewBox="0 0 512 512" fill="#fff"><path d="M93.6 28.3l187.2 107.5L93.6 483.7c-5.1-4.4-8.2-10.8-8.2-18V46.3c0-7.2 3.1-13.6 8.2-18zm22.7-17L330 135.8 282.4 256 116.3 11.3zm0 473.4L282.4 256l47.6 120.2-213.7 124.5zM345.6 256l80.8-46.4c14.3-8.2 14.3-28.9 0-37.2L345.6 126l-52.8 130 52.8 130z"/></svg>
            <div><div style={{fontSize:13,fontWeight:600,color:"#fff",fontFamily:"Nunito,sans-serif",lineHeight:1.2}}>Google Play</div><div style={{fontSize:10,color:"rgba(255,255,255,.6)",fontFamily:"Nunito,sans-serif"}}>Coming Soon</div></div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── CLOUDINARY PDF THUMBNAIL HELPER ──────────────────────────────────────
const pdfThumbUrl = (sourceFileUrl) => {
  if (!sourceFileUrl || !sourceFileUrl.endsWith(".pdf")) return null;
  const m = sourceFileUrl.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/.+)$/);
  if (!m) return null;
  return m[1] + "pg_1,w_400,h_400,c_fill/" + m[2];
};




const SEED_STASH=[
  {id:1,brand:"Lion Brand",name:"Pound of Love",weight:"Worsted",color:"Antique White",colorCode:"#F5F0E1",yardage:315,skeins:2,used:0},
  {id:2,brand:"Red Heart",name:"Super Saver",weight:"Worsted",color:"Cherry Red",colorCode:"#8B1A1A",yardage:364,skeins:1,used:0},
  {id:3,brand:"Caron",name:"Simply Soft",weight:"DK",color:"Ocean",colorCode:"#3A7D8C",yardage:315,skeins:1,used:0},
];
const YarnStash = ({gateAction}) => {
  const [stash,setStash]=useState(SEED_STASH),[adding,setAdding]=useState(false),[brand,setBrand]=useState(""),[name,setName]=useState(""),[weight,setWeight]=useState("Worsted"),[color,setColor]=useState(""),[yardage,setYardage]=useState(""),[skeins,setSkeins]=useState("1");
  const totalYards=stash.reduce((a,y)=>a+y.yardage*y.skeins,0);
  const addYarn=()=>{if(!brand||!name)return;setStash(p=>[...p,{id:Date.now(),brand,name,weight,color,colorCode:"#8A8278",yardage:parseInt(yardage)||0,skeins:parseInt(skeins)||1,used:0}]);setBrand("");setName("");setColor("");setYardage("");setSkeins("1");setAdding(false);};
  const gateOpenAdd=()=>gateAction?gateAction({ intent: "add_stash", title: "Create a free account to save your stash", subtitle: "Track every skein, on every device." },()=>setAdding(true)):setAdding(true);
  const gateAddYarn=()=>gateAction?gateAction({ intent: "add_stash", title: "Create a free account to save your stash", subtitle: "Track every skein, on every device." },addYarn):addYarn();
  const{isDesktop:isD}=useBreakpoint();
  const SC_LABEL = {fontSize:10,fontVariant:"small-caps",color:T.ink3,textTransform:"lowercase",letterSpacing:".14em",fontWeight:500};
  const CARD = {background:"rgba(255,255,255,0.82)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderRadius:20,border:"1px solid rgba(255,255,255,0.6)",padding:24,boxShadow:"0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(123,106,212,0.13)"};

  if(stash.length===0&&!adding) return (
    <div style={{padding:isD?"24px 24px 100px":"0 18px 100px",maxWidth:960,margin:"0 auto"}}>
      <div style={{...CARD,textAlign:"center",padding:"60px 32px"}}>
        <div style={{fontSize:48,marginBottom:16}}>🧶</div>
        <div style={{fontFamily:T.serif,fontSize:22,fontWeight:700,color:T.ink,marginBottom:8}}>Your stash lives here</div>
        <div style={{fontSize:14,color:T.ink3,lineHeight:1.6,marginBottom:24,maxWidth:320,margin:"0 auto 24px"}}>Add your first yarn to get started — track every skein so you always know what you have before you buy.</div>
        <button onClick={gateOpenAdd} style={{background:T.terra,color:"#fff",border:"none",borderRadius:99,padding:"14px 32px",fontSize:15,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(123,106,212,.3)"}}>+ Add Your First Yarn</button>
      </div>
    </div>
  );

  return (
    <div style={{padding:isD?"24px 24px 100px":"0 18px 100px",maxWidth:960,margin:"0 auto"}}>
      {/* Stats pills */}
      <div style={{display:"flex",gap:12,marginBottom:24}}>
        {[{label:"skeins",val:stash.reduce((a,y)=>a+y.skeins,0)},{label:"yardage",val:totalYards.toLocaleString()},{label:"yarn types",val:stash.length}].map(s=>(
          <div key={s.label} style={{flex:1,...CARD,padding:"16px 12px",textAlign:"center"}}>
            <div style={{fontFamily:T.serif,fontSize:24,fontWeight:700,color:T.terra,lineHeight:1}}>{s.val}</div>
            <div style={{...SC_LABEL,marginTop:6}}>{s.label}</div>
          </div>
        ))}
      </div>
      <button onClick={()=>{ if(adding){setAdding(false);return;} gateOpenAdd(); }} style={{width:"100%",background:adding?"transparent":T.terra,color:adding?T.ink3:"#fff",border:adding?`1.5px solid ${T.border}`:"none",borderRadius:99,padding:"14px",fontSize:15,fontWeight:600,cursor:"pointer",boxShadow:adding?"none":"0 4px 16px rgba(123,106,212,.3)",marginBottom:20}}>{adding?"Cancel":"+ Add Yarn to Stash"}</button>
      {adding&&(
        <div className="fu" style={{...CARD,marginBottom:20}}>
          <Field label="Brand" placeholder="e.g. Lion Brand" value={brand} onChange={e=>setBrand(e.target.value)}/>
          <Field label="Yarn Name" placeholder="e.g. Pound of Love" value={name} onChange={e=>setName(e.target.value)}/>
          <div style={{display:"flex",gap:16,marginBottom:14}}>
            <div style={{flex:1}}><div style={SC_LABEL}>weight</div><select value={weight} onChange={e=>setWeight(e.target.value)} style={{width:"100%",padding:"12px 0",background:"transparent",border:"none",borderBottom:`1.5px solid ${T.border}`,color:T.ink,fontSize:14,outline:"none"}}>{["Lace","Fingering","Sport","DK","Worsted","Bulky","Super Bulky"].map(w=><option key={w}>{w}</option>)}</select></div>
            <div style={{flex:1}}><Field label="Color Name" placeholder="Antique White" value={color} onChange={e=>setColor(e.target.value)}/></div>
          </div>
          <div style={{display:"flex",gap:16,marginBottom:14}}>
            <div style={{flex:1}}><Field label="Yds per Skein" placeholder="315" value={yardage} onChange={e=>setYardage(e.target.value)}/></div>
            <div style={{flex:1}}><Field label="# of Skeins" placeholder="2" value={skeins} onChange={e=>setSkeins(e.target.value)}/></div>
          </div>
          <button onClick={gateAddYarn} disabled={!brand||!name} style={{width:"100%",background:T.terra,color:"#fff",border:"none",borderRadius:99,padding:"14px",fontSize:15,fontWeight:600,cursor:(!brand||!name)?"not-allowed":"pointer",opacity:(!brand||!name)?.5:1,boxShadow:"0 4px 16px rgba(123,106,212,.3)"}}>Add to Stash</button>
        </div>
      )}
      {stash.map(y=>(
        <div key={y.id} style={{...CARD,padding:"16px 20px",marginBottom:12,display:"flex",gap:16,alignItems:"center"}}>
          <div style={{width:48,height:48,borderRadius:"50%",background:y.colorCode,flexShrink:0,boxShadow:"inset 0 2px 6px rgba(0,0,0,.12), 0 2px 8px rgba(0,0,0,.06)"}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,fontWeight:600,color:T.ink}}>{y.brand} — {y.name}</div>
            <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
              <span style={{background:T.terraLt,color:T.terra,borderRadius:99,padding:"3px 10px",fontSize:10,fontWeight:600}}>{y.weight}</span>
              {y.color&&<span style={{background:T.linen,color:T.ink3,borderRadius:99,padding:"3px 10px",fontSize:10,fontWeight:500}}>{y.color}</span>}
              <span style={{background:T.linen,color:T.ink3,borderRadius:99,padding:"3px 10px",fontSize:10,fontWeight:500}}>{y.yardage} yds/skein</span>
            </div>
            <div style={{fontSize:12,color:T.terra,fontWeight:600,marginTop:6}}>{y.skeins} skein{y.skeins!==1?"s":""} · {(y.yardage*y.skeins).toLocaleString()} yds total</div>
          </div>
          <button onClick={()=>setStash(p=>p.filter(s=>s.id!==y.id))} style={{background:"none",border:"none",color:T.ink3,cursor:"pointer",fontSize:18,padding:"4px"}}>×</button>
        </div>
      ))}
    </div>
  );
};

const SEED_SHOPPING=[
  {id:1,name:"Lion Brand Pound of Love — Antique White",qty:2,unit:"skeins",checked:false},
  {id:2,name:"Clover Amour Crochet Hook Set — 5 sizes",qty:1,unit:"set",checked:false},
  {id:3,name:"Poly-Fil Premium Fiber Fill — 10oz bag",qty:1,unit:"bag",checked:false},
  {id:4,name:"Stitch Markers (locking) — pack of 50",qty:1,unit:"pack",checked:false},
  {id:5,name:"Yarn needle set — tapestry needles",qty:1,unit:"set",checked:false},
];
const ShoppingList = ({gateAction}) => {
  const [items,setItems]=useState(SEED_SHOPPING);
  const [newItem,setNewItem]=useState("");
  const{isDesktop:isDsl}=useBreakpoint();
  const toggle=id=>setItems(p=>p.map(i=>i.id===id?{...i,checked:!i.checked}:i));
  const remove=id=>setItems(p=>p.filter(i=>i.id!==id));
  const adjust=(id,d)=>setItems(p=>p.map(i=>i.id===id?{...i,qty:Math.max(1,i.qty+d)}:i));
  const addItem=()=>{if(!newItem.trim())return;setItems(p=>[...p,{id:Date.now(),name:newItem.trim(),qty:1,unit:"",checked:false}]);setNewItem("");};
  const gateAddItem=()=>gateAction?gateAction({ intent: "add_shopping", title: "Create a free account to save your list", subtitle: "Your supply run syncs across every device." },addItem):addItem();
  const unchecked=items.filter(i=>!i.checked),checked=items.filter(i=>i.checked);
  const SC_LABEL = {fontSize:10,fontVariant:"small-caps",color:T.ink3,textTransform:"lowercase",letterSpacing:".14em",fontWeight:500};
  const CARD = {background:"rgba(255,255,255,0.82)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderRadius:20,border:"1px solid rgba(255,255,255,0.6)",padding:24,boxShadow:"0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(123,106,212,0.13)"};

  if(items.length===0) return (
    <div style={{padding:isDsl?"24px 24px 100px":"0 18px 100px",maxWidth:960,margin:"0 auto"}}>
      <div style={{fontFamily:T.serif,fontSize:22,color:T.ink,marginBottom:4,fontWeight:700}}>Supply Run</div>
      <div style={{fontSize:13,color:T.ink3,marginBottom:24}}>Everything you need for your current projects.</div>
      <div style={{...CARD,textAlign:"center",padding:"60px 32px"}}>
        <div style={{fontSize:48,marginBottom:16}}>🛒</div>
        <div style={{fontFamily:T.serif,fontSize:22,fontWeight:700,color:T.ink,marginBottom:8}}>Your supply list</div>
        <div style={{fontSize:14,color:T.ink3,lineHeight:1.6,maxWidth:320,margin:"0 auto 24px"}}>Add items as you plan your next project — yarn, hooks, and notions all in one place.</div>
        <div style={{display:"flex",gap:8,maxWidth:380,margin:"0 auto"}}>
          <input value={newItem} onChange={e=>setNewItem(e.target.value)} onKeyDown={e=>e.key==="Enter"&&gateAddItem()} placeholder="Add an item..." style={{flex:1,padding:"13px 16px",background:"transparent",border:"none",borderBottom:`1.5px solid ${T.border}`,color:T.ink,fontSize:14,outline:"none",transition:"border-color .2s"}} onFocus={e=>e.target.style.borderBottomColor=T.terra} onBlur={e=>e.target.style.borderBottomColor=T.border}/>
          <button onClick={gateAddItem} style={{background:T.terra,color:"#fff",border:"none",borderRadius:99,padding:"12px 24px",fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(123,106,212,.3)"}}>Add</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{padding:isDsl?"24px 24px 100px":"0 18px 100px",maxWidth:960,margin:"0 auto"}}>
      <div style={{fontFamily:T.serif,fontSize:22,color:T.ink,marginBottom:4,fontWeight:700}}>Supply Run</div>
      <div style={{fontSize:13,color:T.ink3,marginBottom:24}}>Everything you need for your current projects.</div>

      {unchecked.length>0&&<div style={{...SC_LABEL,marginBottom:12}}>to get</div>}
      {unchecked.map(item=>(
        <div key={item.id} style={{...CARD,padding:"14px 20px",marginBottom:10,display:"flex",alignItems:"center",gap:14}}>
          <button onClick={()=>toggle(item.id)} style={{width:24,height:24,borderRadius:8,border:`2px solid ${T.border}`,background:"transparent",cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s"}}/>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:14,fontWeight:500,color:T.ink}}>{item.name}</div></div>
          <span style={{background:T.terraLt,color:T.terra,borderRadius:99,padding:"4px 12px",fontSize:11,fontWeight:700,flexShrink:0}}>{item.qty}</span>
          <div style={{display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
            <button onClick={()=>adjust(item.id,-1)} style={{width:26,height:26,borderRadius:99,border:"none",background:T.linen,cursor:"pointer",fontSize:14,color:T.ink3}}>−</button>
            <button onClick={()=>adjust(item.id,1)} style={{width:26,height:26,borderRadius:99,border:"none",background:T.linen,cursor:"pointer",fontSize:14,color:T.ink3}}>+</button>
          </div>
          <button onClick={()=>remove(item.id)} style={{background:"none",border:"none",color:T.ink3,cursor:"pointer",fontSize:16,padding:"2px",flexShrink:0}}>×</button>
        </div>
      ))}

      {checked.length>0&&<div style={{...SC_LABEL,marginTop:20,marginBottom:12}}>done</div>}
      {checked.map(item=>(
        <div key={item.id} style={{...CARD,padding:"14px 20px",marginBottom:10,display:"flex",alignItems:"center",gap:14,opacity:.45}}>
          <button onClick={()=>toggle(item.id)} style={{width:24,height:24,borderRadius:8,border:`2px solid ${T.sage}`,background:T.sage,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff"}}>✓</button>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:14,fontWeight:500,color:T.ink,textDecoration:"line-through"}}>{item.name}</div></div>
          <span style={{background:T.linen,color:T.ink3,borderRadius:99,padding:"4px 12px",fontSize:11,fontWeight:700,flexShrink:0}}>{item.qty}</span>
          <button onClick={()=>remove(item.id)} style={{background:"none",border:"none",color:T.ink3,cursor:"pointer",fontSize:16,padding:"2px",flexShrink:0}}>×</button>
        </div>
      ))}

      <div style={{display:"flex",gap:10,marginTop:20}}>
        <input value={newItem} onChange={e=>setNewItem(e.target.value)} onKeyDown={e=>e.key==="Enter"&&gateAddItem()} placeholder="Add an item..." style={{flex:1,padding:"13px 16px",background:"transparent",border:"none",borderBottom:`1.5px solid ${T.border}`,color:T.ink,fontSize:14,outline:"none",transition:"border-color .2s"}} onFocus={e=>e.target.style.borderBottomColor=T.terra} onBlur={e=>e.target.style.borderBottomColor=T.border}/>
        <button onClick={gateAddItem} style={{background:T.terra,color:"#fff",border:"none",borderRadius:99,padding:"12px 24px",fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(123,106,212,.3)"}}>Add</button>
      </div>
    </div>
  );
};


const STARTER_PHOTO_MAP = {Blankets:PHOTOS.blanket,Amigurumi:PHOTOS.granny,Wearables:PHOTOS.cardigan,Accessories:PHOTOS.tote,Home:PHOTOS.pillow};

const LegalFooter = () => {
  const legalNav=useNavigate();
  return (
    <div style={{textAlign:"center",padding:"24px 16px 32px",fontSize:12,color:"#726A92"}}>
      <span onClick={()=>legalNav("/privacy")} style={{color:"#726A92",cursor:"pointer"}} onMouseEnter={e=>e.target.style.color="#7B6AD4"} onMouseLeave={e=>e.target.style.color="#726A92"}>Privacy Policy</span>
      <span style={{margin:"0 8px",opacity:.5}}>|</span>
      <span onClick={()=>legalNav("/terms")} style={{color:"#726A92",cursor:"pointer"}} onMouseEnter={e=>e.target.style.color="#7B6AD4"} onMouseLeave={e=>e.target.style.color="#726A92"}>Terms of Service</span>
    </div>
  );
};

const WelcomeToast = ({visible}) => (
  <div style={{position:"fixed",top:16,right:16,zIndex:900,background:T.terra,color:"#fff",borderRadius:14,padding:"12px 24px",fontSize:14,fontWeight:600,boxShadow:"0 8px 32px rgba(123,106,212,.4)",display:"flex",alignItems:"center",gap:8,opacity:visible?1:0,transform:visible?"translateX(0)":"translateX(20px)",transition:"opacity .4s ease, transform .4s ease",pointerEvents:"none"}}>
    <span style={{fontSize:18}}>🧶</span> Welcome back! Your Wovely is ready.
  </div>
);

const WelcomeBanner = ({visible}) => (
  <div style={{background:T.terra,padding:"10px 16px",display:"flex",alignItems:"center",gap:8,opacity:visible?1:0,maxHeight:visible?50:0,overflow:"hidden",transition:"opacity .4s ease, max-height .4s ease"}}>
    <span style={{fontSize:13,color:"#fff",fontWeight:500,lineHeight:1.4}}>Welcome to Wovely. 🐍 Bev&apos;s got a space ready for your first pattern.</span>
  </div>
);

const InfoTooltip = ({text}) => {
  const [show,setShow]=useState(false);
  return (
    <span style={{position:"relative",display:"inline-flex",marginLeft:4,cursor:"pointer"}} onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)} onClick={()=>setShow(!show)}>
      <span style={{fontSize:12,color:T.ink3,opacity:.7}}>&#9432;</span>
      {show&&<div style={{position:"absolute",bottom:"calc(100% + 6px)",left:"50%",transform:"translateX(-50%)",background:T.ink,color:"#fff",fontSize:11,lineHeight:1.5,padding:"8px 12px",borderRadius:8,width:220,zIndex:10,boxShadow:"0 4px 16px rgba(0,0,0,.2)",pointerEvents:"none"}}>{text}<div style={{position:"absolute",top:"100%",left:"50%",transform:"translateX(-50%)",width:0,height:0,borderLeft:"6px solid transparent",borderRight:"6px solid transparent",borderTop:`6px solid ${T.ink}`}}/></div>}
    </span>
  );
};

const OnboardingScreen = ({onComplete,onBackToAuth}) => {
  const user = supabaseAuth.getUser();
  const session = getSession();
  const emailPrefix = (user?.email||"").split("@")[0].replace(/[^a-zA-Z0-9_]/g,"").slice(0,20);
  const [firstName,setFirstName]=useState(""),[lastName,setLastName]=useState("");
  const [displayName,setDisplayName]=useState(""),[username,setUsername]=useState(emailPrefix);
  const [cellPhone,setCellPhone]=useState(""),[smsOptIn,setSmsOptIn]=useState(true);
  const [saving,setSaving]=useState(false),[error,setError]=useState(null);
  const{isDesktop}=useBreakpoint();

  // Step 2 save — saves to DB, marks onboarding complete, closes modal
  const handleSave = async () => {
    if (!firstName.trim()) { setError("First name is required."); return; }
    if (!lastName.trim()) { setError("Last name is required."); return; }
    if (!displayName.trim()) { setError("Display name is required."); return; }
    const handle = username.trim().replace(/^@/,"");
    if (!handle) { setError("Username is required."); return; }
    if (!/^[a-zA-Z0-9_]{2,30}$/.test(handle)) { setError("Username: 2-30 chars, letters/numbers/underscores only."); return; }
    if (!cellPhone.trim()) { setError("Cell phone is required."); return; }
    setSaving(true); setError(null);
    if (user && session) {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user.id}`, {
          method:"PATCH",
          headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${session.access_token}`,"Content-Type":"application/json","Prefer":"return=minimal"},
          body:JSON.stringify({username:handle,display_name:displayName.trim(),first_name:firstName.trim(),last_name:lastName.trim(),cell_phone:cellPhone.trim(),sms_opt_in:smsOptIn,has_completed_onboarding:true}),
        });
        if (!res.ok) {
          const d=await res.json().catch(()=>({}));
          if (d.message?.includes("unique")||d.code==="23505") { setError("Username already taken."); setSaving(false); return; }
          setError(d.message||"Save failed."); setSaving(false); return;
        }
      } catch { setError("Network error."); setSaving(false); return; }
    }
    setSaving(false);
    onComplete();
  };

  const LABEL_WITH_TIP = (label,tip) => (
    <div style={{fontSize:11,color:T.ink3,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5,display:"flex",alignItems:"center"}}>{label}<InfoTooltip text={tip}/></div>
  );

  return (
    <div style={{position:"fixed",inset:0,zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:T.sans}}>
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(12px)"}}/>
      <div style={{position:"relative",zIndex:1,width:"100%",maxWidth:480,maxHeight:"80vh",display:"flex",flexDirection:"column",background:"rgba(250,247,243,0.96)",borderRadius:28,boxShadow:"0 20px 60px rgba(123,106,212,.15), 0 0 0 1px rgba(255,255,255,0.45) inset",border:"1px solid rgba(255,255,255,0.38)"}}>
        <div style={{overflowY:"auto",padding:isDesktop?"44px 48px 40px":"28px 24px 32px"}}>
          <button onClick={onBackToAuth} style={{background:"none",border:"none",color:T.terra,cursor:"pointer",fontSize:13,fontWeight:600,padding:0,marginBottom:20,display:"flex",alignItems:"center",gap:6}}>← Back</button>
          <div style={{textAlign:"center",marginBottom:28}}>
            <div style={{fontSize:11,color:T.ink3,fontWeight:500,letterSpacing:".06em",marginBottom:10}}>Step 2 of 2</div>
            <div style={{fontSize:48,marginBottom:12}}>🧶</div>
            <div style={{fontFamily:T.serif,fontSize:isDesktop?32:26,fontWeight:700,color:T.ink,lineHeight:1.1,letterSpacing:"-.02em"}}>Set up your profile</div>
            <p style={{fontSize:14,color:T.ink3,marginTop:8,lineHeight:1.6}}>Let other makers know who you are.</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
            <Field label="First name *" placeholder="e.g. Sarah" value={firstName} onChange={e=>setFirstName(e.target.value)}/>
            <Field label="Last name *" placeholder="e.g. Miller" value={lastName} onChange={e=>setLastName(e.target.value)}/>
          </div>
          <div style={{marginBottom:14}}>
            {LABEL_WITH_TIP("Display name *","How other makers see you in Wovely. Can be your name, nickname, anything you like.")}
            <input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="e.g. Sarah" style={{width:"100%",padding:"13px 16px",background:T.linen,border:`1.5px solid ${T.border}`,borderRadius:12,color:T.ink,fontSize:15}} onFocus={e=>e.target.style.borderColor=T.terra} onBlur={e=>e.target.style.borderColor=T.border}/>
          </div>
          <div style={{marginBottom:14}}>
            {LABEL_WITH_TIP("Username *","Your unique @handle for your public profile.")}
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:T.ink3,fontSize:15,pointerEvents:"none"}}>@</span>
              <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="yourhandle" style={{width:"100%",padding:"13px 16px 13px 30px",background:T.linen,border:`1.5px solid ${T.border}`,borderRadius:12,color:T.ink,fontSize:15}} onFocus={e=>e.target.style.borderColor=T.terra} onBlur={e=>e.target.style.borderColor=T.border}/>
            </div>
          </div>
          <div style={{marginBottom:14}}>
            {LABEL_WITH_TIP("Cell phone *","Only used for SMS updates if you opt in. Never shared.")}
            <input value={cellPhone} onChange={e=>setCellPhone(e.target.value)} placeholder="e.g. (555) 123-4567" type="tel" style={{width:"100%",padding:"13px 16px",background:T.linen,border:`1.5px solid ${T.border}`,borderRadius:12,color:T.ink,fontSize:15}} onFocus={e=>e.target.style.borderColor=T.terra} onBlur={e=>e.target.style.borderColor=T.border}/>
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0 14px"}}>
            <div>
              <div style={{fontSize:13,color:T.ink2,fontWeight:500}}>Text me updates from Wovely</div>
              <div style={{fontSize:11,color:T.ink3,marginTop:2}}>Pattern drops, community updates, and more.</div>
            </div>
            <button onClick={()=>setSmsOptIn(!smsOptIn)} style={{width:44,height:26,borderRadius:13,background:smsOptIn?T.sage:T.border,border:"none",position:"relative",cursor:"pointer",transition:"background .2s ease",flexShrink:0}}>
              <div style={{width:22,height:22,borderRadius:11,background:"#fff",position:"absolute",top:2,left:smsOptIn?20:2,boxShadow:"0 1px 3px rgba(0,0,0,.15)",transition:"left .2s ease"}}/>
            </button>
          </div>
          {error&&<div style={{background:T.terraLt,border:"1px solid rgba(123,106,212,.2)",borderRadius:10,padding:"10px 14px",fontSize:12,color:T.terra,lineHeight:1.5,marginBottom:8}}>{error}</div>}
          <button onClick={handleSave} disabled={saving} style={{width:"100%",background:T.terra,color:"#fff",border:"none",borderRadius:14,padding:"15px",fontSize:15,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(123,106,212,.3)",marginTop:4,opacity:saving?.6:1}}>{saving?"Setting up…":"Set up my profile"}</button>
        </div>
      </div>
    </div>
  );
};

// ─── MASTER DOC VIEWER (private, no app chrome) ──────────────────────────────
const MasterDocView = () => {
  const [pw,setPw]=useState(()=>sessionStorage.getItem("yh_master_pw")||"");
  const [authed,setAuthed]=useState(false);
  const [doc,setDoc]=useState(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [markedReady,setMarkedReady]=useState(false);
  const [activeTab,setActiveTab]=useState("master-doc");
  const {isDesktop}=useBreakpoint();

  // Inject marked.js + noindex meta
  useEffect(()=>{
    const meta=document.createElement("meta");meta.name="robots";meta.content="noindex, nofollow";document.head.appendChild(meta);
    if(!document.getElementById("marked-js")){
      const s=document.createElement("script");s.id="marked-js";s.src="https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js";
      s.onload=()=>setMarkedReady(true);document.head.appendChild(s);
    } else setMarkedReady(true);
    return ()=>{try{document.head.removeChild(meta);}catch{}};
  },[]);

  const fetchDoc=async(password)=>{
    setLoading(true);setError("");
    try{
      const res=await fetch("/api/master-doc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});
      if(res.status===401){setError("Incorrect password");setLoading(false);return;}
      if(!res.ok){setError("Failed to load document");setLoading(false);return;}
      const data=await res.json();
      setDoc(data);setAuthed(true);sessionStorage.setItem("yh_master_pw",password);
    }catch(e){setError("Network error");}
    setLoading(false);
  };

  // Auto-submit on mount if password in sessionStorage
  useEffect(()=>{if(pw)fetchDoc(pw);},[]);

  const renderMarkdown=(content)=>{
    if(!markedReady||!window.marked)return content;
    try{return window.marked.parse(content);}catch{return content;}
  };

  const TabBar = () => (
    <div style={{display:"flex",gap:0,borderBottom:`1px solid ${T.border}`,marginBottom:32}}>
      {[{id:"master-doc",label:"Master Doc"},{id:"changelog",label:"Changelog"}].map(tab=>(
        <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{background:"none",border:"none",borderBottom:activeTab===tab.id?`3px solid ${T.terra}`:"3px solid transparent",padding:"12px 24px",fontSize:14,fontWeight:activeTab===tab.id?700:500,color:activeTab===tab.id?T.ink:T.ink3,cursor:"pointer",transition:"all .15s",letterSpacing:".01em"}}>{tab.label}</button>
      ))}
    </div>
  );

  const ChangelogTab = () => {
    const pad = isDesktop ? "0 0" : "0 0";
    const maxW = isDesktop ? "100%" : "100%";
    return (
      <div style={{maxWidth:maxW,margin:"0 auto",padding:pad}}>
        {/* Hero */}
        <div style={{textAlign:"center",marginBottom:48}}>
          <div style={{fontSize:14,color:T.terra,fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",marginBottom:8}}>Release Notes</div>
          <h1 style={{fontFamily:T.serif,fontSize:isDesktop?38:28,fontWeight:700,color:T.ink,lineHeight:1.2,margin:"0 0 12px"}}>What's New in Wovely</h1>
          <p style={{fontSize:15,color:T.ink3,lineHeight:1.6,maxWidth:480,margin:"0 auto"}}>Every stitch of progress, documented. Follow along as we build the crochet companion you deserve.</p>
        </div>
        {/* Coming Soon card */}
        <div style={{background:"linear-gradient(135deg, #2E2748 0%, #231D3A 100%)",borderRadius:20,padding:isDesktop?"32px 36px":"24px 22px",marginBottom:40,border:"1px solid rgba(123,106,212,.25)",boxShadow:"0 8px 32px rgba(46,39,72,.25)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
            <div style={{background:"rgba(123,106,212,.2)",borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:700,color:"#CFC4F2",letterSpacing:".06em",textTransform:"uppercase"}}>Coming Soon</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.35)"}}>On the roadmap</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isDesktop?"1fr 1fr":"1fr",gap:10}}>
            {COMING_SOON.map((item,i) => (
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",background:"rgba(255,255,255,.04)",borderRadius:12,border:"1px solid rgba(255,255,255,.06)"}}>
                <span style={{color:"#7B6AD4",fontSize:14,marginTop:1,flexShrink:0}}>◇</span>
                <span style={{fontSize:13,color:"rgba(255,255,255,.8)",lineHeight:1.5}}>{item}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Version entries */}
        <div style={{position:"relative"}}>
          <div style={{position:"absolute",left:isDesktop?19:15,top:8,bottom:0,width:2,background:T.border,zIndex:0}}/>
          {CHANGELOG_ENTRIES.map((entry, idx) => (
            <div key={entry.version} className="fu" style={{position:"relative",paddingLeft:isDesktop?56:44,marginBottom:idx < CHANGELOG_ENTRIES.length - 1 ? 40 : 0,animationDelay:idx*.08+"s"}}>
              <div style={{position:"absolute",left:isDesktop?10:6,top:6,width:entry.major?22:16,height:entry.major?22:16,borderRadius:99,background:entry.major?T.terra:T.surface,border:`3px solid ${entry.major?T.terra:T.border}`,zIndex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
                {entry.major && <div style={{width:8,height:8,borderRadius:99,background:"#fff"}}/>}
              </div>
              <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:18,overflow:"hidden",boxShadow:entry.major?"0 4px 24px rgba(123,106,212,.1)":T.shadow}}>
                <div style={{padding:isDesktop?"22px 28px 18px":"18px 20px 14px",borderBottom:`1px solid ${T.border}`,background:entry.major?"linear-gradient(135deg, #F2EEFB 0%, "+T.card+" 100%)":T.card}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                    <span style={{fontFamily:"'Nunito', monospace",fontSize:isDesktop?22:18,fontWeight:700,color:T.ink,letterSpacing:"-0.02em"}}>{entry.version}</span>
                    {entry.major && <span style={{fontSize:16}} title="Major release">🧶</span>}
                    <span style={{fontSize:12,color:T.ink3,fontWeight:500,marginLeft:"auto"}}>{entry.date}</span>
                  </div>
                </div>
                <div style={{padding:isDesktop?"20px 28px 24px":"16px 20px 20px"}}>
                  {Object.entries(entry.changes).map(([cat, items]) => (
                    <div key={cat} style={{marginBottom:16}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                        <div style={{background:CAT_COLORS[cat]||T.terra,borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:700,color:"#fff",letterSpacing:".05em",textTransform:"uppercase"}}>{cat}</div>
                        <div style={{flex:1,height:1,background:T.border}}/>
                      </div>
                      {items.map((item, j) => (
                        <div key={j} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"6px 0"}}>
                          <span style={{color:CAT_COLORS[cat]||T.terra,fontSize:8,marginTop:5,flexShrink:0}}>●</span>
                          <span style={{fontSize:13,color:T.ink2,lineHeight:1.55}}>{item}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Footer */}
        <div style={{textAlign:"center",marginTop:56}}>
          <div style={{width:40,height:1,background:T.border,margin:"0 auto 20px"}}/>
          <p style={{fontSize:13,color:T.ink3,lineHeight:1.6}}>That's everything so far. More stitches coming soon.</p>
        </div>
      </div>
    );
  };

  if(authed) return (
    <div style={{minHeight:"100vh",background:"#FFFFFF",fontFamily:'"Nunito",-apple-system,sans-serif'}}>
      <style>{`
        .md-doc h1,.md-doc h2,.md-doc h3{font-family:"Fredoka",Georgia,serif;color:#2E2748;margin:1.5em 0 .5em;}
        .md-doc h1{font-size:32px;border-bottom:2px solid #ECE6F8;padding-bottom:12px;}
        .md-doc h2{font-size:24px;color:#7B6AD4;}
        .md-doc h3{font-size:18px;}
        .md-doc p{line-height:1.8;color:#726A92;margin:.8em 0;}
        .md-doc ul,.md-doc ol{padding-left:24px;color:#726A92;line-height:1.8;}
        .md-doc table{width:100%;border-collapse:collapse;margin:1em 0;}
        .md-doc th,.md-doc td{border:1px solid #ECE6F8;padding:10px 14px;text-align:left;font-size:14px;}
        .md-doc th{background:#F5F2FF;font-weight:600;color:#2E2748;}
        .md-doc code{background:#F5F2FF;padding:2px 6px;border-radius:4px;font-size:13px;font-family:monospace;}
        .md-doc pre{background:#F5F2FF;padding:16px;border-radius:10px;overflow-x:auto;margin:1em 0;}
        .md-doc pre code{background:none;padding:0;}
        .md-doc a{color:#7B6AD4;text-decoration:underline;}
        .md-doc blockquote{border-left:4px solid #7B6AD4;margin:1em 0;padding:8px 16px;background:#ECE6F8;border-radius:0 8px 8px 0;}
      `}</style>
      <CSS/>
      <div style={{maxWidth:900,margin:"0 auto",padding:"40px 24px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div>
            <div style={{fontFamily:'"Fredoka",Georgia,serif',fontSize:28,fontWeight:700,color:"#2E2748"}}>Wovely Admin</div>
            <div style={{fontSize:13,color:"#726A92",marginTop:4}}>{doc?`Version ${doc.version} · Updated ${new Date(doc.updated_at).toLocaleDateString()}`:""}</div>
          </div>
          <button onClick={()=>{sessionStorage.removeItem("yh_master_pw");setDoc(null);setAuthed(false);setPw("");}} style={{background:"#F5F2FF",border:"1px solid #ECE6F8",borderRadius:8,padding:"8px 16px",fontSize:13,color:"#5C4F44",cursor:"pointer"}}>Lock</button>
        </div>
        <TabBar/>
        {activeTab==="master-doc" && doc && (
          <>
            {doc.change_summary&&<div style={{background:"#ECE6F8",borderRadius:10,padding:"12px 16px",marginBottom:24,fontSize:13,color:"#7B6AD4",lineHeight:1.6}}>Latest changes: {doc.change_summary}</div>}
            <div className="md-doc" dangerouslySetInnerHTML={{__html:renderMarkdown(doc.content)}}/>
          </>
        )}
        {activeTab==="changelog" && <ChangelogTab/>}
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#FFFFFF",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:'"Nunito",-apple-system,sans-serif'}}>
      <div style={{width:"100%",maxWidth:380,padding:"40px 32px",background:"#FFFFFF",borderRadius:20,border:"1px solid #ECE6F8",boxShadow:"0 8px 32px rgba(123,106,212,.08)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:40,marginBottom:12}}>🧶</div>
          <div style={{fontFamily:'"Fredoka",Georgia,serif',fontSize:22,fontWeight:700,color:"#2E2748"}}>Wovely Admin</div>
          <div style={{fontSize:13,color:"#726A92",marginTop:6}}>Enter password to view</div>
        </div>
        <input value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&fetchDoc(pw)} type="password" placeholder="Password" style={{width:"100%",padding:"13px 16px",background:"#F5F2FF",border:"1.5px solid #ECE6F8",borderRadius:12,color:"#2E2748",fontSize:15,marginBottom:12,outline:"none"}}/>
        {error&&<div style={{fontSize:12,color:"#7B6AD4",marginBottom:10}}>{error}</div>}
        <button onClick={()=>fetchDoc(pw)} disabled={loading||!pw} style={{width:"100%",background:"#7B6AD4",color:"#fff",border:"none",borderRadius:12,padding:"14px",fontSize:15,fontWeight:600,cursor:"pointer",opacity:loading?.6:1}}>{loading?"Loading…":"Unlock"}</button>
      </div>
    </div>
  );
};

// ─── CHANGELOG DATA & PAGE ──────────────────────────────────────────────────
const CHANGELOG_ENTRIES = [
  {
    version: "v1.6.0", date: "April 4, 2026", major: false,
    changes: {
      "New": [
        "🌀 Stitch Vision is now Stitch-O-Vision",
        "💜 BevCheck replaces old Stitch Check in nav",
        "📊 Structured API logging to Supabase vercel_logs table",
        "🚨 Client-side error reporting — captures unhandled JS errors and promise rejections",
        "🧠 Stitch-O-Vision prompt now distinguishes stitches from construction techniques",
      ],
      "Fixed": [
        "📱 FeedbackWidget bottom sheet no longer hidden behind FAB on iOS",
      ],
    },
  },
  {
    version: "v1.5.x", date: "March 24, 2026", major: true,
    changes: {
      "New": [
        "PDF pattern import with Gemini AI extraction",
        "Collapsible component sections in row manager",
        "Make count tracking (FLIPPER x2 = 2 passes)",
        "Assembly & Finishing extracted as final component",
        "Pattern Notes collapsible header in row manager",
        "Action item rows (place eyes, begin stuffing) with visual treatment",
      ],
      "Improved": [
        "RND vs ROW labeling now detects construction type",
        "Multi-round expansion — RND 10-23 becomes 14 individual rows",
        "View Source Pattern pill in row manager",
      ],
      "Fixed": [
        "Starter patterns always show 5 in nav count",
        "Pattern sort order — newest first, starters below",
      ],
    },
  },
  {
    version: "v1.4.x", date: "March 22, 2026", major: false,
    changes: {
      "New": [
        "Real Supabase auth — signup, signin, signout, session persistence",
        "Three-step onboarding flow",
        "Profile & Settings view",
        "Builds in Progress with live count in nav",
        "Starter patterns (Granny Square, Amigurumi Ball, Basic Beanie)",
        "Row notes persist to Supabase",
      ],
      "Fixed": [
        "Stale sessions redirect to welcome screen correctly",
      ],
    },
  },
  {
    version: "v1.3.x", date: "March 20, 2026", major: true,
    changes: {
      "New": [
        "Wovely brand launch — retired Stitch Box",
        "Smart Import URL pipeline with og:image extraction",
        "Snap & Stitch (Snap to Pattern) with Gemini Vision",
        "Social sharing with milestone banners and share cards",
        "Welcome screen with illustrated world background",
        "Yarn animation (pure CSS — mobile Safari safe)",
        "Free/Pro/App Store modals",
        "Waitlist email capture live in Supabase",
      ],
    },
  },
];

const COMING_SOON = [
  "Row Tracker / in-row repeat tracker for bracket repeats",
  "Stitch tutorial videos (Bella Coco integration)",
  "Snap & Stitch end-to-end (multi-angle scan)",
  "iOS and Android apps",
];

const CAT_COLORS = {
  "New": T.terra,
  "Improved": T.sage,
  "Fixed": T.gold,
  "Coming Soon": "#7B6AD4",
};

const ChangelogPage = () => {
  const navigate = useNavigate();
  const {isDesktop} = useBreakpoint();

  useEffect(() => {
    document.title = "Wovely Changelog";
    let ogTitle = document.querySelector('meta[property="og:title"]');
    let ogDesc = document.querySelector('meta[property="og:description"]');
    if (!ogTitle) { ogTitle = document.createElement("meta"); ogTitle.setAttribute("property","og:title"); document.head.appendChild(ogTitle); }
    if (!ogDesc) { ogDesc = document.createElement("meta"); ogDesc.setAttribute("property","og:description"); document.head.appendChild(ogDesc); }
    ogTitle.setAttribute("content", "Wovely Changelog");
    ogDesc.setAttribute("content", "What's new in Wovely");
    return () => { document.title = "Wovely"; };
  }, []);

  const pad = isDesktop ? "0 60px" : "0 20px";
  const maxW = isDesktop ? 720 : "100%";

  return (
    <div style={{fontFamily:T.sans,background:T.bg,minHeight:"100vh"}}>
      <CSS/>
      {/* Header bar */}
      <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:"0 24px",height:60,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer"}} onClick={()=>navigate("/")}>
          <span style={{fontSize:22}}>🧶</span>
          <span style={{fontFamily:T.serif,fontSize:20,fontWeight:700,color:T.ink}}>Wovely</span>
        </div>
        <div style={{fontSize:12,color:T.ink3,fontWeight:500,letterSpacing:".04em",textTransform:"uppercase"}}>Changelog</div>
      </div>

      <div style={{maxWidth:maxW,margin:"0 auto",padding:pad,paddingTop:40,paddingBottom:100}}>
        {/* Hero */}
        <div style={{textAlign:"center",marginBottom:48}}>
          <div style={{fontSize:14,color:T.terra,fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",marginBottom:8}}>Release Notes</div>
          <h1 style={{fontFamily:T.serif,fontSize:isDesktop?38:28,fontWeight:700,color:T.ink,lineHeight:1.2,margin:"0 0 12px"}}>What's New in Wovely</h1>
          <p style={{fontSize:15,color:T.ink3,lineHeight:1.6,maxWidth:480,margin:"0 auto"}}>Every stitch of progress, documented. Follow along as we build the crochet companion you deserve.</p>
        </div>

        {/* Coming Soon card */}
        <div style={{background:"linear-gradient(135deg, #2E2748 0%, #231D3A 100%)",borderRadius:20,padding:isDesktop?"32px 36px":"24px 22px",marginBottom:40,border:"1px solid rgba(123,106,212,.25)",boxShadow:"0 8px 32px rgba(46,39,72,.25)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
            <div style={{background:"rgba(123,106,212,.2)",borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:700,color:"#CFC4F2",letterSpacing:".06em",textTransform:"uppercase"}}>Coming Soon</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.35)"}}>On the roadmap</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isDesktop?"1fr 1fr":"1fr",gap:10}}>
            {COMING_SOON.map((item,i) => (
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",background:"rgba(255,255,255,.04)",borderRadius:12,border:"1px solid rgba(255,255,255,.06)"}}>
                <span style={{color:"#7B6AD4",fontSize:14,marginTop:1,flexShrink:0}}>◇</span>
                <span style={{fontSize:13,color:"rgba(255,255,255,.8)",lineHeight:1.5}}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Version entries */}
        <div style={{position:"relative"}}>
          {/* Timeline line */}
          <div style={{position:"absolute",left:isDesktop?19:15,top:8,bottom:0,width:2,background:T.border,zIndex:0}}/>

          {CHANGELOG_ENTRIES.map((entry, idx) => (
            <div key={entry.version} className="fu" style={{position:"relative",paddingLeft:isDesktop?56:44,marginBottom:idx < CHANGELOG_ENTRIES.length - 1 ? 40 : 0,animationDelay:idx*.08+"s"}}>
              {/* Timeline dot */}
              <div style={{position:"absolute",left:isDesktop?10:6,top:6,width:entry.major?22:16,height:entry.major?22:16,borderRadius:99,background:entry.major?T.terra:T.surface,border:`3px solid ${entry.major?T.terra:T.border}`,zIndex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
                {entry.major && <div style={{width:8,height:8,borderRadius:99,background:"#fff"}}/>}
              </div>

              {/* Version card */}
              <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:18,overflow:"hidden",boxShadow:entry.major?"0 4px 24px rgba(123,106,212,.1)":T.shadow}}>
                {/* Version header */}
                <div style={{padding:isDesktop?"22px 28px 18px":"18px 20px 14px",borderBottom:`1px solid ${T.border}`,background:entry.major?"linear-gradient(135deg, #F2EEFB 0%, "+T.card+" 100%)":T.card}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                    <span style={{fontFamily:"'Nunito', monospace",fontSize:isDesktop?22:18,fontWeight:700,color:T.ink,letterSpacing:"-0.02em"}}>{entry.version}</span>
                    {entry.major && <span style={{fontSize:16}} title="Major release">🧶</span>}
                    <span style={{fontSize:12,color:T.ink3,fontWeight:500,marginLeft:"auto"}}>{entry.date}</span>
                  </div>
                </div>

                {/* Change categories */}
                <div style={{padding:isDesktop?"20px 28px 24px":"16px 20px 20px"}}>
                  {Object.entries(entry.changes).map(([cat, items]) => (
                    <div key={cat} style={{marginBottom:16}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                        <div style={{background:CAT_COLORS[cat]||T.terra,borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:700,color:"#fff",letterSpacing:".05em",textTransform:"uppercase"}}>{cat}</div>
                        <div style={{flex:1,height:1,background:T.border}}/>
                      </div>
                      {items.map((item, j) => (
                        <div key={j} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"6px 0"}}>
                          <span style={{color:CAT_COLORS[cat]||T.terra,fontSize:8,marginTop:5,flexShrink:0}}>●</span>
                          <span style={{fontSize:13,color:T.ink2,lineHeight:1.55}}>{item}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{textAlign:"center",marginTop:56,padding:"0 20px"}}>
          <div style={{width:40,height:1,background:T.border,margin:"0 auto 20px"}}/>
          <p style={{fontSize:13,color:T.ink3,lineHeight:1.6}}>That's everything so far. More stitches coming soon.</p>
          <div style={{marginTop:16}}>
            <button onClick={()=>navigate("/")} style={{background:T.terra,color:"#fff",border:"none",borderRadius:12,padding:"12px 28px",fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(123,106,212,.3)"}}>Open Wovely</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function Wovely() {
  const navigate = useNavigate();
  const location = useLocation();
  // Active content scroll container. Both layouts scroll an inner overflowY:auto
  // div (not window), so scroll resets must target this ref, not just window.
  const mainScrollRef = useRef(null);
  // Instant session restore: if a local session exists, assume authed immediately
  // to avoid login screen flicker. The async validate() will correct if expired.
  const _hasLocalSession = !!getSession()?.access_token && !!supabaseAuth.getUser();
  // Tier is the source of truth. isPro is derived for legacy call sites
  // (true for pro+craft). Initial state reads the cached tier (falls back
  // to legacy yh_is_pro flag for sessions that pre-date migration 008).
  const [authed,setAuthed]=useState(_hasLocalSession);
  // Anonymous (guest) state: true when the active session's JWT has
  // is_anonymous: true. Initialized from the cached flag + JWT so the
  // first paint reflects guest UI without waiting for validate(). Real
  // sign-up via convertAnonymousToUser flips this back to false and
  // clears the cache.
  const [isAnonymous,setIsAnonymousState]=useState(()=>_hasLocalSession ? (isAnonymousSession() || readCachedIsAnonymous()) : false);
  const setIsAnonymous=(v)=>{setIsAnonymousState(!!v);writeCachedIsAnonymous(!!v);};
  const [tier,setTierState]=useState(()=>_hasLocalSession?readCachedTier():TIER_FREE);
  const isPro=isPaidTier(tier);
  const setTier=(t)=>{const n=normalizeTier(t);setTierState(n);writeCachedTier(n);};
  // Back-compat shim — call sites that still call setIsPro(boolean) get
  // mapped to a tier change. Used by the sign-out + onboarding-back paths.
  const setIsPro=(p)=>setTier(p?TIER_CRAFT:TIER_FREE);
  const [authChecked,setAuthChecked]=useState(false);
  // First name for the Craft Room greeting ("Good morning, Adam" — 2b
  // mockup). Sourced from the boot-time user_profiles fetch below;
  // first_name preferred, display_name's first word as fallback.
  const [greetName,setGreetName]=useState("");
  const applyGreetName=(row)=>{const n=(row?.first_name||"").trim()||((row?.display_name||"").trim().split(/\s+/)[0]||"");if(n)setGreetName(n);};
  const [userPatterns,setUserPatterns]=useState([]);
  const [patternsFetched,setPatternsFetched]=useState(false);
  const [starterPatterns,setStarterPatterns]=useState(()=>makeStarterPatterns());
  // Guided first-run: the empty-library fork (pick a starter OR import your
  // own). The starter pick (S83) runs the real import pipeline; these two
  // flags only drive the fork surface itself.
  const [firstRunMode,setFirstRunMode]=useState("fork"); // "fork" | "gallery"
  const [starterError,setStarterError]=useState(false); // starter fetch/extract/enqueue failed
  const [starterImporting,setStarterImporting]=useState(false); // double-tap guard while enqueueing
  // Derive view from URL path instead of state
  const view = viewFromPath(location.pathname);
  const [selected,setSelected]=useState(null),[navOpen,setNavOpen]=useState(false),[addOpen,setAddOpen]=useState(false),[imageImportOpen,setImageImportOpen]=useState(false),[addMenuOpen,setAddMenuOpen]=useState(false),[menuAnchor,setMenuAnchor]=useState(null),[showPaywall,setShowPaywall]=useState(false),[showFairUseWall,setShowFairUseWall]=useState(false),[cat,setCat]=useState("All"),[search,setSearch]=useState("");
  const [showWelcomeBanner,setShowWelcomeBanner]=useState(false);
  const [showWelcomeToast,setShowWelcomeToast]=useState(false);
  const [showProModal,setShowProModal]=useState(false);
  const [chatOpen,setChatOpen]=useState(false);
  const [pendingMethod,setPendingMethod]=useState(null);
  // Pill→modal resume hand-off (S1.5.3). { jobId, fileType } while the pill
  // is reopening a still-processing import; cleared once the modal closes.
  const [pendingResumeJobId,setPendingResumeJobId]=useState(null);
  const [showOnboarding,setShowOnboarding]=useState(false);
  const [justCompletedOnboarding,setJustCompletedOnboarding]=useState(false);
  const [createdPattern,setCreatedPattern]=useState(null);
  const [pendingScrollToRow,setPendingScrollToRow]=useState(null);
  const [readyPromptPattern,setReadyPromptPattern]=useState(null);
  const [deleteTarget,setDeleteTarget]=useState(null);
  const [upgradeToast,setUpgradeToast]=useState(null);
  const [showVault,setShowVault]=useState(()=>{try{return typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('vaultdemo')==='1';}catch{return false;}});
  // When a Craft-only capability (multi-section/MKAL hub, collections) opens the
  // upgrade modal, the tier to recommend. null → modal's default Free→Pro step-up.
  const [paywallRecommend,setPaywallRecommend]=useState(null);
  const [coverPickerTarget,setCoverPickerTarget]=useState(null);
  const [pendingImportUrl,setPendingImportUrl]=useState(null);
  // Collections (Phase 1). `selectedCollection` is the collection currently
  // open in the detail view; `collectionContext` is set when an import is
  // launched from inside a collection so handleAddPattern can link the new
  // pattern to the collection on save. `collectionsRefreshNonce` bumps to
  // re-fetch the list view after a create/delete.
  const [selectedCollection,setSelectedCollection]=useState(null);
  // Pinned chart image (Craft). { image, collectionId }. Lives at App level so
  // it survives clue-to-clue navigation within a collection; the clear-on-leave
  // effect below drops it when the user leaves that collection's context. Only
  // one image pinned at a time.
  const [pinnedImage,setPinnedImage]=useState(null);
  const [pinnedLightboxOpen,setPinnedLightboxOpen]=useState(false);
  const togglePin=(image,collectionId)=>{
    if(!image?.id) return;
    setPinnedImage(prev => prev?.image?.id===image.id ? null : { image, collectionId: collectionId ?? null });
  };
  // Zero-friction "Start a Collection" flow: when true, the next
  // successful PDF import is auto-promoted into a brand-new collection.
  // Set when the user taps "Start a Collection"; cleared after the
  // collection is created (or the import flow is cancelled).
  const [startingCollection,setStartingCollection]=useState(false);
  // Post-import "want to collect this?" prompt + Free/Pro contextual
  // upgrade banner. Both live on the PatternDetail (banner) / overlay
  // (modal-ish prompt) and are populated by handleAddPattern after a
  // standard import comes back with multi-part metadata.
  const [collectionSuggestion,setCollectionSuggestion]=useState(null); // { pattern, meta } — Craft only
  const [multiSectionNotice,setMultiSectionNotice]=useState(null); // { count, pattern } — S76 multi_section announcement
  const [collectionUpgradeBanner,setCollectionUpgradeBanner]=useState(null); // { patternId, meta } — Free/Pro
  const [collectionContext,setCollectionContext]=useState(null);
  const [collectionsRefreshNonce,setCollectionsRefreshNonce]=useState(0);
  // Handoff from ImportPill (queue completed) → review modal. { fileType, extractedData } or null.
  const [pendingExtractedHandoff,setPendingExtractedHandoff]=useState(null);
  // Tier the user picked from the upgrade modal while still anonymous.
  // Stashed so that after they convert through the AuthWall, we can auto-fire
  // Stripe checkout for the tier they picked — no second click needed.
  // null when the picked tier was Free (signup-only, no Stripe step).
  // Mirrored to sessionStorage (PENDING_UPGRADE_KEY) so OAuth or any
  // full-page redirect path that remounts the React tree doesn't lose it.
  const [pendingUpgradeTier,setPendingUpgradeTier]=useState(null);
  // Billing cadence the user picked alongside pendingUpgradeTier (see
  // PENDING_UPGRADE_CADENCE_KEY). Defaults to monthly when absent.
  const [pendingUpgradeCadence,setPendingUpgradeCadence]=useState(null);
  // Anonymous mode: set when user clicks "Try it free" on landing. Persists in sessionStorage so
  // refresh/nav within the tab keeps them in the app shell instead of bouncing to the landing.
  const [anonymousMode,setAnonymousMode]=useState(()=>{try{return sessionStorage.getItem("wovely_anonymous_mode")==="1";}catch{return false;}});
  const enterAnonymousMode=useCallback(()=>{try{sessionStorage.setItem("wovely_anonymous_mode","1");}catch{}setAnonymousMode(true);try{posthog.capture("anonymous_mode_entered");}catch{}},[]);

  // Landing "Try free" fork stashes the picked path (wovely_first_run_intent)
  // before entering guest mode — honor it once the shell is up so the user
  // lands directly in the flow they tapped instead of re-choosing. Lives up
  // here with the other hooks: it must run on every render (the component has
  // conditional early returns further down).
  useEffect(() => {
    if (!anonymousMode) return;
    let intent = null;
    try { intent = sessionStorage.getItem("wovely_first_run_intent"); sessionStorage.removeItem("wovely_first_run_intent"); } catch {}
    if (intent === "starter") { setStarterError(false); setFirstRunMode("gallery"); }
    else if (intent === "import") {
      setMenuAnchor({ top: 96, left: Math.max(12, window.innerWidth / 2 - 110) });
      setAddMenuOpen(true);
    }
  }, [anonymousMode]);
  // AuthWallModal global state — the gateAction helper (below) routes anonymous users here
  // before any Pro paywall. Critical invariant: never show the Pro paywall to an unauthed user.
  const [authWallOpen,setAuthWallOpen]=useState(false);
  const [authWallContext,setAuthWallContext]=useState(null);
  const{isTablet,isDesktop}=useBreakpoint();
  const allPatterns = [...userPatterns,...starterPatterns];
  const userStarterCount=userPatterns.filter(p=>p.isStarter).length;
  // Gating info for the active session — atCap, canAdd, isPro derived
  // from tier string. Named tierGate to disambiguate from the tier state
  // (string) above.
  const tierGate=useTier(tier,userPatterns.length,userStarterCount);

  // 5-tap Wovely logo easter egg (adam only)
  const handleLogoTap = useWovelySuperTap(triggerWhatsNew);
  const isAdam = supabaseAuth.getUser()?.email === "alabare@gmail.com";

  // Central gate — hierarchy: anonymous → AuthWall, authed-non-Pro on Pro action → ProInfoModal, else proceed.
  // proceedCallback is re-invoked after successful signup/signin so the action the user intended can resume.
  const gateAction = (options, proceedCallback) => {
    const { requiresPro=false, title, subtitle, intent } = options || {};
    const cb = typeof proceedCallback === "function" ? proceedCallback : () => {};
    if (!authed) {
      try { posthog.capture("auth_wall_shown", { intent: intent || "unknown", requires_pro: !!requiresPro }); } catch {}
      setAuthWallContext({
        title: title || "Create a free account",
        subtitle: subtitle || "Takes 10 seconds. No credit card.",
        intent,
        requiresPro,
        // Best-effort resume: after signup, re-evaluate the gate. New users are authed but not Pro,
        // so Pro-gated actions correctly fall through to the Pro paywall; free-gated actions proceed.
        // 300ms delay lets the session write to localStorage, React state settle, and the profile
        // prefetch (in AuthWallModal onSuccess) complete before the gated action reads getUser/getSession.
        onSuccess: () => { setTimeout(() => { if (requiresPro) { setShowProModal(true); return; } cb(); }, 300); },
      });
      setAuthWallOpen(true);
      return;
    }
    if (requiresPro && !isPro) {
      try { posthog.capture("pro_paywall_shown", { intent: intent || "unknown" }); } catch {}
      setShowProModal(true);
      return;
    }
    cb();
  };

  // Fire Stripe checkout for the given tier. Optional `passedUser` short
  // circuits the session read — important for the post-conversion path
  // where supabaseAuth.getUser() can briefly lag the rotated JWT during
  // the anonymous-to-real flip. Trusting the user object returned by
  // waitForSession() in the AuthWallModal avoids that race entirely.
  // Navigates the page on success, returns false on failure so the
  // caller can decide how to recover.
  const fireUpgradeCheckout = async (tierKey, passedUser, cadence) => {
    try {
      let email, userId;
      if (passedUser?.email) {
        email = passedUser.email;
        userId = passedUser.id;
      } else {
        const u = supabaseAuth.getUser();
        const s = getSession();
        if (!u || !s) {
          console.warn("[Wovely] fireUpgradeCheckout: no user/session, bailing");
          return false;
        }
        email = u.email;
        userId = (()=>{try{const p=JSON.parse(atob(s.access_token.split(".")[1]));return p.sub;}catch{return null;}})() || u.id;
      }
      console.log("[Wovely] fireUpgradeCheckout:", { tierKey, hasPassedUser: !!passedUser, email, userId });
      const res = await fetch("/api/stripe-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email, tier: tierKey, cadence: cadence || 'monthly' }),
      });
      const data = await res.json();
      if (!res.ok) { console.error("[Wovely] Checkout error:", data?.error || data); return false; }
      window.location.href = data.url;
      return true;
    } catch (err) {
      console.error("[Wovely] Checkout exception:", err);
      return false;
    }
  };

  // Called by TieredUpgradeModal when an anonymous user picks any plan
  // (paid or free). Closes the modal, stashes the picked tier, and opens
  // the AuthWall in convert mode with copy that matches the intent.
  // Passing null means the user picked Free — signup only, no Stripe.
  const handleUpgradeSignupRequired = (tierKey, cadence) => {
    setShowPaywall(false);
    setShowProModal(false);
    setPendingUpgradeTier(tierKey || null);
    setPendingUpgradeCadence(tierKey ? (cadence || 'monthly') : null);
    // Mirror to sessionStorage so the tier survives any remount path —
    // most importantly OAuth, which round-trips through the provider and
    // returns to a fresh app instance with no React state to read from.
    try {
      if (tierKey) {
        sessionStorage.setItem(PENDING_UPGRADE_KEY, tierKey);
        sessionStorage.setItem(PENDING_UPGRADE_CADENCE_KEY, cadence || 'monthly');
      } else {
        sessionStorage.removeItem(PENDING_UPGRADE_KEY);
        sessionStorage.removeItem(PENDING_UPGRADE_CADENCE_KEY);
      }
    } catch {}
    setAuthWallContext({
      title: tierKey ? `Create your account to subscribe` : "Create your free account",
      subtitle: tierKey
        ? `One step to get Wovely Craft. Your guest pattern carries over.`
        : "Your guest pattern carries over to your new account.",
      intent: tierKey ? `upgrade_signup_${tierKey}` : "upgrade_signup_free",
      requiresPro: false,
      onSuccess: () => {},
    });
    setAuthWallOpen(true);
  };

  // Shared handler for AuthWallModal success. Flips auth state, clears anon mode, identifies the
  // user in PostHog, prefetches tier so Pro/Craft-gated resumes don't flash, THEN invokes the
  // context's onSuccess (which runs the gate's setTimeout → proceedCallback). Must be async so the
  // tier prefetch completes before the resumed action reads it from state.
  const handleAuthWallSuccess = async (user) => {
    setAuthed(true);
    document.cookie = "wovely_authed=1;path=/;max-age=31536000";
    try { sessionStorage.removeItem("wovely_anonymous_mode"); } catch {}
    setAnonymousMode(false);
    // After a conversion (PUT /auth/v1/user + refresh), the new JWT no
    // longer carries is_anonymous. Re-read it so the wall on the pattern
    // detail page drops immediately without a reload.
    setIsAnonymous(isAnonymousSession());
    if (user) posthog.identify(user.id, { email: user.email });
    setErrorReporterUser(user?.id || null);
    // Prefetch tier so paid-tier resumes see the right value (new users default to free, which is
    // correct — but returning Pro/Craft users signing in via the wall should not flash as free).
    const s = getSession();
    if (s?.access_token && user?.id) {
      try {
        const pr = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user.id}&select=tier,is_pro`, {
          headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${s.access_token}` },
        });
        if (pr.ok) {
          const rows = await pr.json();
          if (rows[0]) {
            const nextTier = rows[0].tier || tierFromLegacyIsPro(rows[0].is_pro === true);
            setTier(nextTier);
          }
        }
      } catch (e) { console.warn("[Wovely] AuthWall profile prefetch failed:", e.message); }
    }
    if (authWallContext?.onSuccess) authWallContext.onSuccess(user);
    // Post-conversion auto-checkout: if the user picked a paid tier from
    // the upgrade modal before signing up, send them straight to Stripe
    // without making them re-open the modal and re-pick. Picked Free is
    // a no-op — they wanted the free account and now they have one.
    // Read from sessionStorage first so we don't lose the picked tier
    // across an OAuth round-trip or other remount; fall back to state.
    let tierKey = null;
    try { tierKey = sessionStorage.getItem(PENDING_UPGRADE_KEY); } catch {}
    if (!tierKey) tierKey = pendingUpgradeTier;
    let pendingCadence = null;
    try { pendingCadence = sessionStorage.getItem(PENDING_UPGRADE_CADENCE_KEY); } catch {}
    if (!pendingCadence) pendingCadence = pendingUpgradeCadence;
    if (tierKey) {
      // Clear both stores immediately so a failed Stripe call doesn't
      // produce a redirect loop on the next mount.
      try { sessionStorage.removeItem(PENDING_UPGRADE_KEY); sessionStorage.removeItem(PENDING_UPGRADE_CADENCE_KEY); } catch {}
      setPendingUpgradeTier(null);
      setPendingUpgradeCadence(null);
      // 500ms gives the rotated JWT + profile fetch enough headroom to
      // settle in localStorage. Pass `user` directly so the checkout
      // call doesn't depend on the session read — robust to any
      // remaining lag in the anonymous-to-real conversion flip.
      setTimeout(() => { fireUpgradeCheckout(tierKey, user, pendingCadence); }, 500);
    }
  };

  // Initialize client-side error reporting once on mount
  useEffect(() => {
    initErrorReporter();
  }, []);

  // Post-signup auto-checkout, redirect-safe variant. Catches the cases
  // where the React tree remounts between picking the tier and finishing
  // the auth flow — OAuth round-trip, full page reload, email confirm
  // link, etc. handleAuthWallSuccess covers the in-app signup path
  // already; sessionStorage removeItem is the lock so both paths can
  // race safely (first reader wins). Skips when the user is anonymous
  // or already paid (no Stripe call needed in either state).
  useEffect(() => {
    if (!authChecked || !authed || isAnonymous) return;
    if (isPaidTier(tier)) {
      // User already has a paid plan — drop any stale pending tier on
      // the floor rather than redirecting them to Stripe for a second
      // subscription.
      try { sessionStorage.removeItem(PENDING_UPGRADE_KEY); } catch {}
      return;
    }
    let tierKey = null;
    try { tierKey = sessionStorage.getItem(PENDING_UPGRADE_KEY); } catch {}
    if (!tierKey) return;
    let pendingCadence = null;
    try { pendingCadence = sessionStorage.getItem(PENDING_UPGRADE_CADENCE_KEY); } catch {}
    try { sessionStorage.removeItem(PENDING_UPGRADE_KEY); sessionStorage.removeItem(PENDING_UPGRADE_CADENCE_KEY); } catch {}
    setPendingUpgradeTier(null);
    setPendingUpgradeCadence(null);
    // Same 100ms settle delay as the AuthWall path for JWT + profile
    // localStorage writes. Stripe checkout failure is logged but not
    // retried; the user can re-open "See plans" and pick again.
    setTimeout(() => { fireUpgradeCheckout(tierKey, undefined, pendingCadence); }, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, authed, isAnonymous, tier]);

  // Route-change dismissal (S1.5.3). When the user navigates while an import
  // modal is mounted, close it. If a polling job is still in flight, the
  // modal's unmount handler writes setActiveImportJob → ImportPill takes
  // over without any extra wiring. BrowserRouter + useLocation per the
  // WOVELY_CONTEXT.md note against useBlocker.
  const lastPathRef = useRef(location.pathname);
  useEffect(() => {
    if (lastPathRef.current === location.pathname) return;
    lastPathRef.current = location.pathname;
    if (addOpen) setAddOpen(false);
    if (imageImportOpen) setImageImportOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Guard to prevent concurrent profile fetches from racing
  const isFetchingProfile = useRef(false);
  const isValidating = useRef(false);

  // Validate session against Supabase on mount
  useEffect(()=>{
    const clearAuth = () => {
      saveSession(null);
      setAuthed(false);
    };
    const validate = async () => {
      if (isValidating.current) return;
      isValidating.current = true;
      const s = getSession();
      if (!s?.refresh_token) { clearAuth(); setAuthChecked(true); isValidating.current=false; return; }
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method:"POST",
          headers:{"apikey":SUPABASE_ANON_KEY,"Content-Type":"application/json"},
          body:JSON.stringify({refresh_token:s.refresh_token}),
        });
        if (res.ok) {
          const ns = await res.json();
          saveSession(ns);
          // Fetch profile BEFORE setting authed to prevent is_pro flash
          if (!isFetchingProfile.current) {
            isFetchingProfile.current = true;
            try {
              const uid = (() => { try { const p=JSON.parse(atob(ns.access_token.split(".")[1])); return p.sub; } catch { return null; } })();
              if (uid) {
                const pr = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${uid}&select=has_completed_onboarding,tier,is_pro,first_name,display_name`, {
                  headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${ns.access_token}`},
                });
                if (pr.ok) {
                  const rows = await pr.json();
                  console.log("[Wovely] Profile fetch result:", JSON.stringify(rows), "uid:", uid);
                  if (rows[0]) {
                    // Profile onboarding redirect removed — new signups land directly in the app.
                    const nextTier = rows[0].tier || tierFromLegacyIsPro(rows[0].is_pro === true);
                    console.log("[Wovely] tier from DB:", rows[0].tier, "is_pro:", rows[0].is_pro, "→ tier:", nextTier);
                    setTier(nextTier);
                    applyGreetName(rows[0]);
                  } else {
                    console.warn("[Wovely] Profile fetch returned empty array — no user_profiles row for uid:", uid);
                  }
                } else {
                  console.warn("[Wovely] Profile fetch failed:", pr.status, "— using cached tier");
                }
              }
            } catch (e) { console.warn("[Wovely] Profile fetch error:", e.message, "— using cached tier"); }
            finally { isFetchingProfile.current = false; }
          }
          // Identify user for PostHog analytics on session restore
          const restoredUser=supabaseAuth.getUser();
          if(restoredUser) posthog.identify(restoredUser.id,{email:restoredUser.email});
          setErrorReporterUser(restoredUser?.id || null);
          // Refresh isAnonymous from the freshly-rotated JWT — covers the
          // page-reload case where a guest comes back to a still-anonymous
          // session and we need the guest UI before render.
          setIsAnonymous(isAnonymousSession());
          setAuthed(true);document.cookie="wovely_authed=1;path=/;max-age=31536000";
        } else {
          clearAuth();
        }
      } catch {
        clearAuth();
      }
      setAuthChecked(true);
      isValidating.current=false;
    };
    validate();
  },[]);

  // Handle Stripe upgrade redirect — check URL params on mount
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const upgradeStatus=params.get("upgrade");
    if(!upgradeStatus) return;
    window.history.replaceState({},"",window.location.pathname);
    if(upgradeStatus==="success"){
      posthog.capture("upgrade_completed");
      setShowVault(true); // Free→Craft vault-door reveal celebration (replaces the plain toast)
      // Re-fetch profile to pick up is_pro=true from webhook
      const s=getSession();
      if(s?.access_token){
        const uid=(()=>{try{const p=JSON.parse(atob(s.access_token.split(".")[1]));return p.sub;}catch{return null;}})();
        if(uid){
          fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${uid}&select=tier,is_pro`,{
            headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${s.access_token}`},
          }).then(r=>r.ok?r.json():null).then(rows=>{
            if(rows?.[0]){setTier(rows[0].tier||tierFromLegacyIsPro(rows[0].is_pro===true));}
          }).catch(()=>{});
        }
      }
      setTimeout(()=>setUpgradeToast(null),5000);
    } else if(upgradeStatus==="cancelled"){
      setUpgradeToast("cancelled");
      setTimeout(()=>setUpgradeToast(null),4000);
    }
  },[]);

  const handleSignOut = async () => { posthog.reset(); await supabaseAuth.signOut(); setAuthed(false); setTier(TIER_FREE); setUserPatterns([]); clearCachedTier(); setIsAnonymous(false); clearCachedIsAnonymous(); setPendingUpgradeTier(null); try { sessionStorage.removeItem("wovely_redirect_intent"); sessionStorage.removeItem("wovely_anonymous_mode"); sessionStorage.removeItem(PENDING_UPGRADE_KEY); } catch {} setAnonymousMode(false); document.cookie="wovely_authed=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/"; navigate("/"); };

  // Open the auth/convert wall for a guest from the nav. Bypasses gateAction
  // (which only opens the wall when !authed — a guest is authed, so it would
  // no-op). The wall opens in signup mode with isAnonymous=true, so AuthWallModal
  // runs convertAnonymousToUser, preserving the guest's UUID and their patterns.
  const openNavAuthWall = () => {
    setAuthWallContext({ title: "Create your free account", subtitle: "Save your work and pick up on any device.", intent: "nav_sign_in", requiresPro: false, onSuccess: () => {} });
    setAuthWallOpen(true);
  };

  // After login the app swaps <Auth/> → My Wovely at the SAME "/" path, so
  // ScrollToTop (which only fires on a pathname change) never resets scroll and
  // the page inherits the Auth landing's scroll offset. Reset on the auth→app
  // transition — but only when landing on "/", so a wovely_redirect_intent
  // deep-link to /pattern/:id (which DOES change the path, and is handled by
  // ScrollToTop / PatternDetail) is left untouched. Resets the active inner
  // scroll container (desktop & mobile) plus window.
  const prevAuthedRef = useRef(authed);
  useEffect(() => {
    const justLoggedIn = !prevAuthedRef.current && authed;
    prevAuthedRef.current = authed;
    if (justLoggedIn && location.pathname === "/") {
      window.scrollTo(0, 0);
      if (mainScrollRef.current) mainScrollRef.current.scrollTop = 0;
    }
  }, [authed, location.pathname]);

  // Navigation helper — translates view keys to URL paths
  const navigateToView = useCallback((v, patternId) => {
    if (v === "detail" && patternId) {
      navigate("/pattern/" + encodeURIComponent(patternId));
    } else {
      const path = VIEW_TO_PATH[v] || "/";
      if (path !== location.pathname) navigate(path);
    }
  }, [navigate, location.pathname]);

  // Starter patterns are hardcoded in DEFAULT_STARTERS — no DB fetch needed

  // Fetch user's saved patterns from Supabase on login
  useEffect(()=>{
    console.log("[Wovely] Pattern fetch triggered, authed:", authed, "authChecked:", authChecked);
    if(!authed||!authChecked) return;
    const user=supabaseAuth.getUser();
    const session=getSession();
    console.log("[Wovely] Pattern fetch user id:", user?.id);
    if(!user||!session) return;
    (async()=>{
      try{
        const res=await fetch(`${SUPABASE_URL}/rest/v1/patterns?user_id=eq.${user.id}&status=neq.deleted&order=created_at.desc&limit=500`,{
          headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${session.access_token}`},
        });
        console.log("[Wovely] Pattern fetch response status:", res.status, "content-range:", res.headers.get("content-range"));
        if(res.ok||res.status===206){
          const data=await res.json();
          console.log("[Wovely] Pattern fetch count:", data.length, "titles:", data.map(r=>r.title));
          if(data.length>0){
            const patterns=data.map(r=>({
              id:r.id,_supabaseId:r.id,title:r.title||"",cat:r.cat||"",source:r.source||"",source_url:r.source_url||"",
              notes:r.notes||"",pattern_notes:r.pattern_notes||"",photo:r.cover_image_url||r.photo||r.image_url||"",cover_image_url:r.cover_image_url||null,hook:r.hook||r.hook_size||"",weight:r.weight||r.yarn_weight||"",
              yardage:r.yardage||0,materials:r.materials||[],rows:(r.rows||[]).map(row=>({...row,done:!!row.done})),
              rating:r.rating||0,skeins:r.skeins||0,skeinYards:r.skein_yards||200,
              gauge:r.gauge||{stitches:12,rows:16,size:4},dimensions:r.dimensions||{},
              status:r.status||"active",isStarter:!!r.is_starter,is_ai_generated:!!r.is_ai_generated,difficulty:r.difficulty||"",tags:r.tags||[],started:r.status==="in_progress",
              source_file_url:r.source_file_url||"",source_file_name:r.source_file_name||"",source_file_type:r.source_file_type||"",
              my_hook_size:r.my_hook_size||null,my_yarn_weight:r.my_yarn_weight||null,my_yardage:r.my_yardage||null,my_skeins:r.my_skeins||null,
              collection_id:r.collection_id||null,is_collection_part:!!r.is_collection_part,collection_order:r.collection_order||0,
            }));
            // Backfill known patterns missing cover images
            const MARINA_COVER="https://res.cloudinary.com/dmaupzhcx/image/upload/v1774406086/l0rdxjgszsdkctqrnyeh.png";
            patterns.forEach(p=>{
              if(!p.cover_image_url&&p.title&&p.title.toLowerCase().includes("marina")){
                p.cover_image_url=MARINA_COVER;p.photo=MARINA_COVER;
                // Also persist to Supabase
                const pid=p._supabaseId||p.id;
                if(user&&session&&typeof pid==="string"){
                  fetch(`${SUPABASE_URL}/rest/v1/patterns?id=eq.${pid}&user_id=eq.${user.id}`,{method:"PATCH",headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${session.access_token}`,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({cover_image_url:MARINA_COVER})}).catch(()=>{});
                }
              }
            });
            setUserPatterns(prev=>{
              // Keep local-only patterns (starters, unsaved) that aren't in Supabase
              const supaIds=new Set(patterns.map(p=>p.id));
              const localOnly=prev.filter(p=>!supaIds.has(p.id)&&!supaIds.has(p._supabaseId));
              console.log("[Wovely] Merge: Supabase patterns:", patterns.length, "local-only kept:", localOnly.length, localOnly.map(p=>p.title));
              return [...patterns,...localOnly];
            });
          }else{
            console.log("[Wovely] No patterns in Supabase for this user, keeping local state as-is");
          }
          setPatternsFetched(true);
        }else{
          const errText=await res.text();
          console.error("[Wovely] Patterns fetch failed:", res.status, errText);
          setPatternsFetched(true);
        }
      }catch(e){console.error("[Wovely] Fetch patterns error:",e);setPatternsFetched(true);}
    })();
  },[authed,authChecked]);

  // Deep-link resolution: when URL is /hive/:id, resolve selected pattern from loaded data
  // Wait for patternsFetched so instant session restore doesn't redirect before patterns load
  useEffect(()=>{
    if(view!=="detail") return;
    const pid=patternIdFromPath(location.pathname);
    if(!pid) return;
    if(selected&&(String(selected.id)===pid||String(selected._supabaseId)===pid)) return;
    const allP=[...userPatterns,...starterPatterns];
    const match=allP.find(p=>String(p.id)===pid||String(p._supabaseId)===pid);
    if(match) setSelected(match);
    else if(authed&&authChecked&&patternsFetched&&allP.length>0) navigate("/",{replace:true});
  },[view,location.pathname,userPatterns,starterPatterns,authed,authChecked,patternsFetched]);

  // Last URL memory: save pattern detail URLs to sessionStorage with timestamp
  useEffect(()=>{
    if(!authed) return;
    if((location.pathname.startsWith("/pattern/")||location.pathname.startsWith("/hive/")) && patternIdFromPath(location.pathname)){
      try { sessionStorage.setItem("wovely_redirect_intent",JSON.stringify({url:location.pathname,storedAt:Date.now()})); } catch {}
    }
  },[location.pathname,authed]);

  // Deep-link resolution for /collections/:id. If the URL points to a
  // specific collection but selectedCollection is null (page reload,
  // shared URL, back/forward nav), fetch the row so the detail view
  // can render. Falls through to My Wovely if the fetch returns no row
  // (deleted or not owned) — there's no standalone collections list
  // anymore.
  useEffect(() => {
    if (view !== "collection-detail") return;
    const cid = collectionIdFromPath(location.pathname);
    if (!cid) return;
    if (selectedCollection?.id === cid) return;
    if (!authed) return;
    (async () => {
      try {
        const s = getSession();
        if (!s?.access_token) return;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/collections?id=eq.${cid}&select=*`, {
          headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${s.access_token}` },
        });
        if (!res.ok) { navigate("/", { replace: true }); return; }
        const rows = await res.json();
        if (rows[0]) setSelectedCollection(rows[0]);
        else navigate("/", { replace: true });
      } catch { navigate("/", { replace: true }); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, location.pathname, authed, selectedCollection?.id]);

  // Clear the pinned chart image when the user leaves the collection it was
  // pinned from. "In context" = viewing that collection's detail OR a pattern
  // (clue) belonging to it. Anything else (dashboard, another collection, an
  // unrelated pattern) drops the pin.
  useEffect(() => {
    if (!pinnedImage) return;
    const cid = pinnedImage.collectionId;
    const inContext =
      (view === "collection-detail" && selectedCollection?.id === cid) ||
      (view === "detail" && selected && selected.collection_id === cid);
    if (!inContext) { setPinnedImage(null); setPinnedLightboxOpen(false); }
  }, [view, selectedCollection?.id, selected, pinnedImage]);

  // /hive-vision route: open add-pattern modal (Snap & Stitch tab) and redirect to /hive
  useEffect(()=>{
    if(view==="hive-vision"&&authed){
      setAddOpen(true);
      navigate("/",{replace:true});
    }
  },[view,authed]);

  const checkUpgradeIntent=async()=>{
    if(localStorage.getItem("yh_upgrade_intent")!=="true") return;
    localStorage.removeItem("yh_upgrade_intent");
    const user=supabaseAuth.getUser();const s=getSession();
    if(!user||!s) return;
    try{
      const uid=(()=>{try{const p=JSON.parse(atob(s.access_token.split(".")[1]));return p.sub;}catch{return null;}})();
      const res=await fetch("/api/stripe-checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:uid||user.id,email:user.email})});
      const data=await res.json();
      if(res.ok&&data.url) window.location.href=data.url;
    }catch(e){console.error("[Wovely] Upgrade intent checkout failed:",e);}
  };

  const handleNewSignup = () => {
    posthog.capture("user_signed_up");
    setAuthed(true);document.cookie="wovely_authed=1;path=/;max-age=31536000";
    try{sessionStorage.removeItem("wovely_anonymous_mode");}catch{}
    setAnonymousMode(false);
    navigate("/");
    // Profile onboarding redirect removed — new signups land directly on My Wovely.
    setShowWelcomeBanner(true);
    checkUpgradeIntent();
    setTimeout(()=>setShowWelcomeBanner(false),4000);
  };

  const handleSignIn = async () => {
    // Fetch profile BEFORE rendering authenticated UI to prevent is_pro flash
    const s = getSession();
    if (s?.access_token) {
      try {
        const uid = (() => { try { const p=JSON.parse(atob(s.access_token.split(".")[1])); return p.sub; } catch { return null; } })();
        if (uid) {
          const pr = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${uid}&select=tier,is_pro,has_completed_onboarding,first_name,display_name`, {
            headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${s.access_token}`},
          });
          if (pr.ok) {
            const rows = await pr.json();
            if (rows[0]) {
              setTier(rows[0].tier || tierFromLegacyIsPro(rows[0].is_pro === true));
              applyGreetName(rows[0]);
            }
          }
        }
      } catch (e) { console.warn("[Wovely] Sign-in profile prefetch failed:", e.message); }
    }
    const user=supabaseAuth.getUser();
    if(user) posthog.identify(user.id,{email:user.email});
    posthog.capture("user_logged_in");
    setAuthed(true);document.cookie="wovely_authed=1;path=/;max-age=31536000";
    try{sessionStorage.removeItem("wovely_anonymous_mode");}catch{}
    setAnonymousMode(false);
    // Post-login redirect: only restore pattern detail URLs saved within 15 minutes
    let postLoginPath = "/";
    try {
      const raw = sessionStorage.getItem("wovely_redirect_intent");
      if (raw) {
        const { url, storedAt } = JSON.parse(raw);
        if (url && (url.startsWith("/pattern/") || url.startsWith("/hive/")) && storedAt && (Date.now() - storedAt) < 15 * 60 * 1000) {
          postLoginPath = url.replace("/hive/", "/pattern/");
        }
        sessionStorage.removeItem("wovely_redirect_intent");
      }
    } catch {}
    navigate(postLoginPath);
    setShowWelcomeToast(true);
    setTimeout(()=>setShowWelcomeToast(false),3000);
    checkUpgradeIntent();
  };

  // Restore last pattern URL on boot (runs once when authed on / or /hive)
  // Only restores if stored within 15 minutes (quick return scenario)
  const lastUrlRestoreRef = useRef(false);
  useEffect(()=>{
    if(lastUrlRestoreRef.current) return;
    if(!authed||!authChecked) return;
    // Boot-only one-shot: latch the moment auth is ready so this restore can
    // only run during the initial load. Otherwise a later user-initiated
    // navigation to "/" (e.g. clicking My Wovely from inside a pattern) re-runs
    // this effect, finds the still-fresh wovely_redirect_intent that the
    // last-URL-memory effect keeps writing while a pattern is open, and bounces
    // the route straight back into the pattern — the first click then appears
    // to do nothing and a second click is needed.
    lastUrlRestoreRef.current = true;
    if(location.pathname!=="/"&&location.pathname!=="/hive") return;
    try {
      const raw = sessionStorage.getItem("wovely_redirect_intent");
      if (raw) {
        const { url, storedAt } = JSON.parse(raw);
        if (url && (url.startsWith("/pattern/") || url.startsWith("/hive/")) && storedAt && (Date.now() - storedAt) < 15 * 60 * 1000) {
          lastUrlRestoreRef.current = true;
          sessionStorage.removeItem("wovely_redirect_intent");
          navigate(url.replace("/hive/", "/pattern/"), { replace: true });
          return;
        }
        sessionStorage.removeItem("wovely_redirect_intent");
      }
    } catch {}
  },[authed,authChecked,location.pathname,navigate]);

  // Private route: /master-doc (includes changelog tab) — rendered before auth check
  if(location.pathname==="/master-doc") return <MasterDocView/>;
  // Redirect old /changelog URL to /master-doc
  if(location.pathname==="/changelog") return <Navigate to="/master-doc" replace/>;
  // Public legal pages — render without auth if not logged in, inside shell if logged in
  if(!authed&&(location.pathname==="/privacy"||location.pathname==="/terms")) {
    return <><CSS/>{location.pathname==="/privacy"?<PrivacyPolicy/>:<TermsOfService/>}<LegalFooter/></>;
  }

  // Show nothing until session is validated against Supabase
  if(!authChecked) return <><CSS/><div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center"}}><div className="spinner" style={{width:28,height:28,border:`3px solid ${T.border}`,borderTopColor:T.terra,borderRadius:"50%"}}/></div></>;
  // Stitch result page — show standalone for public, app shell for logged-in users
  if(location.pathname.startsWith("/stitch/")&&!supabaseAuth.getUser()) return <><CSS/><StitchResultPage/></>;
  if(!authed) {
    // Anonymous mode: show the landing page on "/" until the user clicks "Try it free" (or signs in).
    // Once in anon mode, they can browse the entire shell. Non-root paths always fall through
    // so deep links like /pattern/:id work for signed-out users too.
    if(location.pathname==="/"&&!anonymousMode){
      return <><CSS/><Auth onEnter={handleSignIn} onEnterAsNew={handleNewSignup} onTryAnonymous={enterAnonymousMode}/></>;
    }
  }
  // Unknown routes redirect to /
  // /collections (bare) is kept in knownPaths so old bookmarks don't 404 —
  // viewFromPath maps it to "collection" so the user lands on My Wovely.
  const knownPaths=["/","/hive","/builds","/browse","/stash","/tools","/stitch-check","/shopping","/profile","/circle","/hive-vision","/master-doc","/privacy","/terms","/collections"];
  if(!knownPaths.some(p=>location.pathname===p||location.pathname.startsWith("/pattern/")||location.pathname.startsWith("/hive/")||location.pathname.startsWith("/collections/"))) return <Navigate to="/" replace/>;
  const detailOnSave=u=>{
    const withTimestamp={...u,updated_at:new Date().toISOString()};
    setUserPatterns(prev=>prev.map(p=>p.id===u.id?withTimestamp:p));setStarterPatterns(prev=>prev.map(p=>p.id===u.id?withTimestamp:p));setSelected(withTimestamp);
    const user=supabaseAuth.getUser();const session=getSession();
    // Honest activation signal: the first time a user checks/tracks a row on
    // ANY pattern (their own OR a starter clone). Fires once per user. Starter
    // clones suppress pattern_uploaded, so this is the real "they're using it".
    try{
      const checkedAny=(u.rows||[]).some(r=>r.done&&!r.isHeader&&!r.isNoteOnly);
      if(checkedAny&&user){
        const akey="wovely_activated_"+user.id;
        if(!localStorage.getItem(akey)){
          localStorage.setItem(akey,"1");
          posthog.capture("pattern_activated",{pattern_id:String(u._supabaseId||u.id||""),is_starter:!!u.isStarter});
        }
      }
    }catch{}
    const pid=u._supabaseId||u.id;
    if(user&&session&&typeof pid==="string"&&!pid.startsWith("local_")&&!pid.startsWith("onboard_")&&!pid.startsWith("starter_")){
      fetch(`${SUPABASE_URL}/rest/v1/patterns?id=eq.${pid}&user_id=eq.${user.id}`,{
        method:"PATCH",
        headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${session.access_token}`,"Content-Type":"application/json","Prefer":"return=minimal"},
        body:JSON.stringify({rows:u.rows||[],row_count:(u.rows||[]).length,updated_at:new Date().toISOString(),source_file_url:u.source_file_url||null,source_file_name:u.source_file_name||null,source_file_type:u.source_file_type||null,my_hook_size:u.my_hook_size||null,my_yarn_weight:u.my_yarn_weight||null,my_yardage:u.my_yardage||null,my_skeins:u.my_skeins||null,...(u.notes!==undefined?{notes:u.notes}:{})}),
      }).then(r=>{console.log("[Wovely] Row progress PATCH status:",r.status,"for pattern:",pid);if(!r.ok)r.text().then(t=>console.error("[Wovely] Row PATCH error body:",t));}).catch(e=>console.error("[Wovely] Row progress save error:",e));
    }
  };
  const detailOnBack=()=>{localStorage.removeItem("yh_last_url");navigate("/");};

  const startAndOpenPattern=(p)=>{
    const updated={...p,started:true};
    setUserPatterns(prev=>prev.map(x=>x.id===p.id?updated:x));
    setStarterPatterns(prev=>prev.map(x=>x.id===p.id?updated:x));
    setSelected(updated);
    // Persist started status to Supabase
    const user=supabaseAuth.getUser();const session=getSession();
    const pid=p._supabaseId||p.id;
    if(user&&session&&typeof pid==="string"&&!pid.startsWith("local_")&&!pid.startsWith("starter_")){
      fetch(`${SUPABASE_URL}/rest/v1/patterns?id=eq.${pid}&user_id=eq.${user.id}`,{
        method:"PATCH",headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${session.access_token}`,"Content-Type":"application/json","Prefer":"return=minimal"},
        body:JSON.stringify({status:"in_progress"}),
      }).catch(e=>console.error("[Wovely] Start pattern error:",e));
    }
    navigateToView("detail",p._supabaseId||p.id);
  };
  const openDetail=p=>{
    // Show "Ready to build?" prompt for unstarted patterns with rows
    if(!p.started&&!p.isStarter&&p.rows&&p.rows.length>0&&pct(p)===0){
      setReadyPromptPattern(p);
      return;
    }
    // Auto-start starter patterns on first open
    if(!p.started&&p.rows&&p.rows.length>0){
      startAndOpenPattern(p);
    } else {
      setSelected(p);
      navigateToView("detail",p._supabaseId||p.id);
    }
  };
  // Fire-and-forget Bev image classification. Runs ONCE per source PDF even
  // when the import split into multiple patterns — the server classifies the
  // pages and distributes pattern_images rows across the patterns by matching
  // component_name. `patterns` is [{ id, component_name }]. Never blocks the UI.
  const fireImageExtraction = (patterns, fileUrl, userId) => {
    const list = (patterns || []).filter(p => p && p.id);
    if (!fileUrl || list.length === 0) {
      console.log("[Wovely] extract-images skipped — missing fileUrl or patterns", { hasFileUrl: !!fileUrl, count: list.length });
      return;
    }
    console.log("[Wovely] extract-images firing for", list.length, "pattern(s), file:", fileUrl);
    // Stamp the pending marker per pattern BEFORE the kick, so a detail view
    // mounted immediately after save polls the rows in live (S83 ribbon fix).
    // Centralized here so every caller (single import, collection split,
    // suggestion-accept split) gets the marker without per-site wiring.
    list.forEach(pt => markImagesPending(pt.id));
    fetch("/api/extract-pattern", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "extract-images", patterns: list, file_url: fileUrl, user_id: userId }),
    })
      .then(r => r.json().catch(() => ({})))
      .then(d => console.log("[Wovely] extract-images response:", d))
      .catch(e => console.warn("[Wovely] extract-images failed:", e?.message));
  };

  // Insert one pattern row per extracted component, all linked to
  // targetCollection starting after baseOrder. Mirrors each into local
  // userPatterns and refreshes the collection pattern_count. Returns
  // [{ id, component_name }] for the rows that saved. Shared by the
  // "Start a Collection" / existing-collection import path and the post-import
  // "accept collection suggestion" split.
  const insertComponentPatterns = async ({ p, targetCollection, baseOrder, user, session, importFileUrl = null }) => {
    const components = Array.isArray(p.components) ? p.components : [];
    console.log("[Wovely] split: inserting", components.length, "components:", components.map(c => c?.name), "baseOrder:", baseOrder);
    const savedIds = [];
    const partLabel = (p._multiPart?.part_label) || targetCollection.part_label || "Part";
    // S76: every clue child inherits the parent import's source file URL, so the
    // file linkage survives the split (Replace, re-extraction, repair scripts,
    // and the extract-images gate all depend on it). Fall back to the import
    // handoff's URL when the modal payload didn't carry it (pill→modal resume).
    const childSourceUrl = resolveChildSourceUrl(p.source_file_url, importFileUrl);
    for (let i = 0; i < components.length; i++) {
      const comp = components[i];
      const order = baseOrder + i + 1;
      console.log(`[Wovely] split: component[${i}] '${comp?.name}' → order ${order}`);
      const compRows = buildRowsFromComponents([comp]);
      const partTitle = (comp.name && comp.name.trim()) || `${partLabel} ${order}`;
      const payload = {
        user_id: user.id,
        title: partTitle,
        cat: p.cat || "",
        source: p.source || "",
        source_url: p.source_url || "",
        notes: "",
        pattern_notes: p.pattern_notes || null,
        difficulty: p.difficulty || "",
        yarn_weight: p.weight || "",
        hook_size: p.hook || "",
        gauge: p.gauge || {},
        tags: p.tags || [],
        is_ai_generated: !!p.is_ai_generated,
        is_starter: false,
        image_url: p.image_url || "",
        photo: p.photo || "",
        cover_image_url: p.cover_image_url || null,
        row_count: compRows.length,
        materials: p.materials || [],
        rows: compRows,
        rating: 0,
        yardage: p.yardage || 0,
        skeins: p.skeins || 0,
        skein_yards: p.skeinYards || 200,
        dimensions: p.dimensions || {},
        weight: p.weight || "",
        hook: p.hook || "",
        source_file_url: childSourceUrl,
        source_file_name: p.source_file_name || (childSourceUrl ? (childSourceUrl.split("/").pop() || null) : null),
        source_file_type: p.source_file_type || (childSourceUrl && childSourceUrl.toLowerCase().endsWith(".pdf") ? "application/pdf" : null),
        extracted_by_ai: !!p.extracted_by_ai,
        components: [comp],
        validation_flags: p.validation_flags || null,
        validation_report: p.validation_report || null,
        collection_id: targetCollection.id,
        is_collection_part: true,
        collection_order: order,
      };
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/patterns`, {
          method: "POST",
          headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${session.access_token}`, "Content-Type": "application/json", "Prefer": "return=representation" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const rows = await res.json();
          if (rows[0]?.id) {
            savedIds.push({ id: rows[0].id, component_name: partTitle });
            // Reflect locally — the pattern fetch on next mount will sync
            // anything we missed (e.g., server defaults). skeinYards
            // mirrors skein_yards back to the client field convention.
            const localOne = {
              id: rows[0].id,
              _supabaseId: rows[0].id,
              title: partTitle,
              cat: payload.cat,
              source: payload.source,
              source_url: payload.source_url,
              notes: payload.notes,
              pattern_notes: payload.pattern_notes || "",
              photo: payload.cover_image_url || payload.photo || payload.image_url || "",
              cover_image_url: payload.cover_image_url,
              hook: payload.hook,
              weight: payload.weight,
              yardage: payload.yardage,
              materials: payload.materials,
              rows: payload.rows.map(r => ({ ...r, done: !!r.done })),
              rating: 0,
              skeins: payload.skeins,
              skeinYards: payload.skein_yards,
              gauge: payload.gauge,
              dimensions: payload.dimensions,
              status: "active",
              isStarter: false,
              is_ai_generated: payload.is_ai_generated,
              difficulty: payload.difficulty,
              tags: payload.tags,
              started: false,
              source_file_url: payload.source_file_url || "",
              source_file_name: payload.source_file_name || "",
              source_file_type: payload.source_file_type || "",
              my_hook_size: null, my_yarn_weight: null, my_yardage: null, my_skeins: null,
              collection_id: targetCollection.id,
              is_collection_part: true,
              collection_order: order,
            };
            setUserPatterns(prev => [localOne, ...prev]);
          }
        } else {
          console.warn("[Wovely] Multi-part insert failed", await res.text());
        }
      } catch (e) {
        console.warn("[Wovely] Multi-part insert error", e?.message);
      }
    }

    // Refresh collection.pattern_count (best-effort).
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/collections?id=eq.${targetCollection.id}`, {
        method: "PATCH",
        headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${session.access_token}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
        body: JSON.stringify({ pattern_count: baseOrder + savedIds.length, updated_at: new Date().toISOString() }),
      });
    } catch {}

    return savedIds;
  };

  // Save the multi-component collection import path. Used when:
  //   - the user came from "Start a Collection" OR an existing collection
  //     surface (collectionContext.id set)
  //   - AND the extraction produced more than one component
  // Each component becomes its own pattern row, linked to a single
  // collection. Shared metadata (materials, hook, source file, cover) is
  // copied to every pattern; rows + title vary per component.
  const runMultiComponentCollectionSave = async (p) => {
    const user = supabaseAuth.getUser();
    const session = getSession();
    if (!user || !session) return false;

    // 1) Resolve / create the target collection.
    let targetCollection = collectionContext;
    let baseOrder = 0;
    if (startingCollection) {
      const meta = p._multiPart || {};
      const colPayload = {
        name: meta.collection_name || p.title || "Untitled Collection",
        description: null,
        collection_type: meta.collection_type === "mkal" ? "mkal" : "general",
        cover_image_url: p.cover_image_url || null,
        part_label: meta.part_label || "Part",
        expected_part_count: typeof meta.expected_part_count === "number" ? meta.expected_part_count : undefined,
      };
      const { data: newCol, error: colErr } = await createCollection(colPayload);
      if (colErr || !newCol) { console.warn("[Wovely] Multi-part: collection create failed", colErr); return false; }
      targetCollection = newCol;
      baseOrder = 0;
    } else if (collectionContext?.id) {
      if (collectionContext._targetOrder) {
        baseOrder = collectionContext._targetOrder - 1;
      } else {
        try {
          const { data: existing } = await listPatternsInCollection(collectionContext.id);
          baseOrder = existing?.length || 0;
        } catch { baseOrder = 0; }
      }
    } else {
      return false;
    }

    // 2) Insert one pattern per component (+ refresh count).
    const importFileUrl = p.source_file_url || pendingExtractedHandoff?.fileUrl || null;
    const savedIds = await insertComponentPatterns({ p, targetCollection, baseOrder, user, session, importFileUrl });

    // 3) Image extraction — fire ONCE for the shared PDF. The server matches
    // each classified page to the right clue by component_name.
    fireImageExtraction(savedIds, importFileUrl, user.id);

    // 4) Cleanup flow flags + navigate to the collection detail.
    setStartingCollection(false);
    setCollectionContext(null);
    setAddOpen(false);
    setActiveImportJob(null);
    setSelectedCollection(targetCollection);
    navigate("/collections/" + targetCollection.id);
    return true;
  };

  const handleAddPattern=async(p)=>{
    // Saving a pattern means we're done with the import_job that produced it —
    // clear sessionStorage so ImportPill doesn't re-render the same job after
    // the modal closes and walk the user through a duplicate import.
    setActiveImportJob(null);
    // Starter imports never fire pattern_uploaded — activation stays the
    // honest pattern_activated signal in detailOnSave (first row checked),
    // which DOES count starter rows. That's the point of the starter.
    if(p.isStarter){ try{ sessionStorage.removeItem(STARTER_JOB_KEY); }catch{} }
    else posthog.capture("pattern_uploaded",{file_type:p.source_file_type||"unknown"});

    // S76 document-type router. `document_type` (from the planner) is additive:
    // when it is missing or unrecognized we fall through to the existing
    // structural behavior unchanged. The ONE behavior it changes is
    // multi_section_pattern — ONE finished object made of named parts (e.g.
    // Dani's tieback). That must stay a SINGLE pattern with its sections in
    // `components`; it must NOT be split into a collection and must NOT trigger
    // the "want to collect this?" suggestion. single_pattern / pattern_book /
    // mkal keep their existing paths.
    const docType = p.document_type || null;
    const componentCount = Array.isArray(p.components) ? p.components.length : 0;
    // Structural-guard mismatch logging (do not silently override on day one).
    if (docType && importRouteMismatch(docType, componentCount)) {
      console.log(`[doc-type-router] classifier=${docType} structural=${componentCount > 1 ? "multi" : "single"} mismatch title="${p.title || ""}"`);
    }
    const forceSinglePattern = docType === DOC_TYPES.MULTI_SECTION;

    // Multi-component collection import → split. Each component becomes its
    // own pattern row, linked to a single collection. Only kicks in when
    // BOTH conditions hold: this is a collection-flavored import AND the
    // extraction produced more than one component. Standalone imports and
    // single-component collection imports keep the existing single-insert
    // path below unchanged. A multi_section_pattern is never split, even from a
    // collection surface — it stays one pattern (which becomes one clue).
    const isCollectionImportEarly = !!collectionContext?.id || !!startingCollection;
    if (!forceSinglePattern && isCollectionImportEarly && Array.isArray(p.components) && p.components.length > 1) {
      await runMultiComponentCollectionSave(p);
      return;
    }

    const user=supabaseAuth.getUser();
    const session=getSession();
    // Deduplicate title: if user already has a pattern with same title, append (2), (3), etc.
    let dedupTitle=p.title||"";
    if(user&&session&&dedupTitle){
      try{
        const checkRes=await fetch(`${SUPABASE_URL}/rest/v1/patterns?user_id=eq.${user.id}&title=like.${encodeURIComponent(dedupTitle)}*&status=neq.deleted&select=title`,{
          headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${session.access_token}`},
        });
        if(checkRes.ok){
          const existing=await checkRes.json();
          const titles=new Set(existing.map(r=>r.title));
          if(titles.has(dedupTitle)){
            let n=2;
            while(titles.has(`${p.title} (${n})`)) n++;
            dedupTitle=`${p.title} (${n})`;
          }
        }
      }catch(e){console.warn("[Wovely] Dedup check failed:",e.message);}
    }
    // Optimistically add to local state
    const localId=p.id||"local_"+Date.now();
    const localPattern={...p,id:localId,title:dedupTitle};
    setUserPatterns(prev=>[localPattern,...prev]);
    // Collection import: skip the PatternCreatedOverlay entirely and
    // navigate back to the collection detail view after the Supabase
    // save + linkage completes (handled below). This is the MKAL
    // workflow — the user is adding clues sequentially, they want to
    // see the growing collection, not the standalone pattern view.
    const isCollectionImport = !!collectionContext?.id;
    // Zero-friction "Start a Collection" import: same skip — we'll
    // create the collection + navigate to its detail once the row is
    // saved and we have a Supabase id to link.
    const isStartingCollection = !isCollectionImport && !!startingCollection;
    if (isCollectionImport || isStartingCollection) {
      setAddOpen(false);
    } else if(p._reviewRowNumber!==undefined){
      // "Review Issue →" flow: skip overlay, go directly to detail with scrollToRow
      setPendingScrollToRow(p._reviewRowNumber);
      setAddOpen(false);
      setTimeout(()=>{startAndOpenPattern(localPattern);},100);
    } else if (forceSinglePattern) {
      // multi_section: announce the multi-part layout instead of the standard
      // created overlay. "Show me the parts" opens the pattern (which renders
      // as the hub). The pattern stays ONE record.
      setAddOpen(false);
      setMultiSectionNotice({ count: componentCount, pattern: localPattern });
    } else {
      setCreatedPattern(localPattern);
    }
    // Persist to Supabase
    if(user&&session){
      try{
        // Defense-in-depth: the pattern object can arrive with an empty
        // source_file_url on some queue/resume paths even though the import job
        // carried a file_url. Backfill from the pill→modal handoff so the row
        // (and Bev's image classification, which is gated on it) isn't starved.
        const resolvedSourceUrl=p.source_file_url||pendingExtractedHandoff?.fileUrl||null;
        const res=await fetch(`${SUPABASE_URL}/rest/v1/patterns`,{
          method:"POST",
          headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${session.access_token}`,"Content-Type":"application/json","Prefer":"return=representation"},
          body:JSON.stringify({user_id:user.id,title:dedupTitle,cat:p.cat||"",source:p.source||"",source_url:p.source_url||"",notes:p.notes||"",pattern_notes:p.pattern_notes||null,difficulty:p.difficulty||"",yarn_weight:p.weight||"",hook_size:p.hook||"",gauge:p.gauge||{},tags:p.tags||[],is_ai_generated:!!p.is_ai_generated,is_starter:!!p.isStarter,image_url:p.image_url||"",photo:p.photo||"",cover_image_url:p.cover_image_url||null,row_count:(p.rows||[]).length,materials:p.materials||[],rows:p.rows||[],rating:p.rating||0,yardage:p.yardage||0,skeins:p.skeins||0,skein_yards:p.skeinYards||200,dimensions:p.dimensions||{},weight:p.weight||"",hook:p.hook||"",source_file_url:resolvedSourceUrl,source_file_name:p.source_file_name||(resolvedSourceUrl?(resolvedSourceUrl.split("/").pop()||null):null),source_file_type:p.source_file_type||(resolvedSourceUrl&&resolvedSourceUrl.toLowerCase().endsWith(".pdf")?"application/pdf":null),extracted_by_ai:!!p.extracted_by_ai,components:p.components||null,validation_flags:p.validation_flags||null,validation_report:p.validation_report||null}),
        });
        console.log("[Wovely] INSERT response status:", res.status);
        if(res.ok){
          const rows=await res.json();
          console.log("[Wovely] INSERT response body:", JSON.stringify(rows));
          if(rows[0]?.id){
            console.log("[Wovely] Pattern saved with Supabase ID:", rows[0].id);
            // Update local state with Supabase ID
            setUserPatterns(prev=>prev.map(pat=>pat.id===localId?{...pat,id:rows[0].id,_supabaseId:rows[0].id}:pat));
            setCreatedPattern(prev=>prev&&prev.id===localId?{...prev,id:rows[0].id,_supabaseId:rows[0].id}:prev);
            // Fire-and-forget: kick off Bev's per-page image classification.
            // Server inserts pattern_images rows with cloudinary_url=null;
            // PatternDetail (Craft tier) lazy-renders + uploads them on view.
            // Single-pattern import → one entry, no component routing needed.
            fireImageExtraction([{ id: rows[0].id, component_name: null }], resolvedSourceUrl, user.id);
            // Collection linkage — when the import was launched from a
            // collection detail view (or a greyed clue slot), persist
            // collection_id / collection_order so the new pattern shows
            // up inside the collection on the next fetch. Explicit
            // _targetOrder wins (greyed slot picked a specific clue
            // number); else we append at the end of the current list.
            if (collectionContext?.id) {
              const ctxCollection = collectionContext;
              let assignedOrder = ctxCollection._targetOrder;
              try {
                if (!assignedOrder) {
                  const { data: existing } = await listPatternsInCollection(ctxCollection.id);
                  assignedOrder = (existing?.length || 0) + 1;
                }
                await linkPatternToCollection(rows[0].id, ctxCollection.id, assignedOrder);
              } catch (e) { console.warn("[Wovely] Collection linkage failed:", e.message); }
              // Reflect the collection link locally so the pattern detail
              // breadcrumb + clue nav render correctly on first navigation
              // — the next fetch will overwrite this with the canonical row.
              setUserPatterns(prev => prev.map(pat => pat.id === rows[0].id
                ? { ...pat, collection_id: ctxCollection.id, is_collection_part: true, collection_order: assignedOrder }
                : pat));
              setCollectionContext(null);
              setSelectedCollection(ctxCollection);
              // After a collection import, drop the user on the pattern
              // detail with collection context — back arrow points to
              // the collection, clue nav becomes visible. Matches the
              // "navigate to pattern detail WITH collection context" spec.
              const linkedPattern = { ...localPattern, id: rows[0].id, _supabaseId: rows[0].id, collection_id: ctxCollection.id, is_collection_part: true, collection_order: assignedOrder };
              setSelected(linkedPattern);
              navigate("/pattern/" + encodeURIComponent(rows[0].id));
            } else if (isStartingCollection) {
              // Zero-friction "Start a Collection". Use multi-part metadata
              // from the planning pass when available; otherwise fall back
              // to a General collection named after the pattern itself so
              // we always end up with a collection the user can rename.
              const meta = p._multiPart || {};
              const colPayload = {
                name: meta.collection_name || p.title || "Untitled Collection",
                description: null,
                collection_type: meta.collection_type === "mkal" ? "mkal" : "general",
                cover_image_url: p.cover_image_url || null,
                part_label: meta.part_label || "Part",
                expected_part_count: typeof meta.expected_part_count === "number" ? meta.expected_part_count : undefined,
              };
              const { data: newCollection, error: colErr } = await createCollection(colPayload);
              if (colErr || !newCollection) {
                console.warn("[Wovely] Auto-create collection failed:", colErr);
                // Fall back to showing the pattern detail without collection.
                setSelected({ ...localPattern, id: rows[0].id, _supabaseId: rows[0].id });
                navigate("/pattern/" + encodeURIComponent(rows[0].id));
              } else {
                const assignedOrder = typeof meta.current_part_number === "number" && meta.current_part_number > 0 ? meta.current_part_number : 1;
                try { await linkPatternToCollection(rows[0].id, newCollection.id, assignedOrder); }
                catch (e) { console.warn("[Wovely] Auto-link first part failed:", e.message); }
                setUserPatterns(prev => prev.map(pat => pat.id === rows[0].id
                  ? { ...pat, collection_id: newCollection.id, is_collection_part: true, collection_order: assignedOrder }
                  : pat));
                setSelectedCollection(newCollection);
                navigate("/collections/" + newCollection.id);
              }
              setStartingCollection(false);
            } else if (!forceSinglePattern && p._multiPart && p._multiPart.collection_name) {
              // Standard import — the planner detected multi-part. Tier
              // gating lives one layer up: Craft sees the post-import
              // "want to start a collection?" prompt; Free/Pro sees the
              // contextual upgrade banner on PatternDetail. Both paths
              // leave the pattern as a normal standalone import. Suppressed
              // for multi_section_pattern (one object, never a collection).
              const linkedPattern = { ...localPattern, id: rows[0].id, _supabaseId: rows[0].id };
              if (tier === TIER_CRAFT) {
                setCollectionSuggestion({ pattern: linkedPattern, meta: p._multiPart });
              } else {
                setCollectionUpgradeBanner({ patternId: rows[0].id, meta: p._multiPart });
              }
            }
          }
        }else{const errText=await res.text();console.error("[Wovely] Pattern save failed:",res.status,errText);}
      }catch(e){console.error("[Wovely] Pattern save error:",e);}
    }
  };
  // Guest import gate. Different from gateAction: unauthed users go through
  // silent anonymous sign-in instead of the AuthWall, then proceed to the
  // file picker. Already-anonymous users with their 1 free import used are
  // routed to the AuthWall with copy that nudges them to convert rather than
  // pushed to the paid-tier paywall. Free/Pro/Craft users keep the existing
  // behavior (cap → tier paywall, else proceed).
  // At-cap routing. Free hits the upgrade paywall — there's a higher tier to
  // sell. Craft is already on the only paid tier, so hitting the fair-use
  // ceiling shows a plain support message with no upgrade CTA.
  const triggerAtCap = () => {
    if (tier === TIER_CRAFT) setShowFairUseWall(true);
    else setShowPaywall(true);
  };
  const gateImport = async (intent, proceedCallback) => {
    const cb = typeof proceedCallback === "function" ? proceedCallback : () => {};
    if (!authed) {
      try { posthog.capture("guest_import_started", { intent }); } catch {}
      const { error } = await supabaseAuth.signInAnonymously();
      if (error) {
        // Anon sign-in failed (most likely Allow anonymous sign-ins is OFF
        // in Supabase). Fall back to the AuthWall so the user can still
        // sign up the regular way.
        console.warn("[Wovely] Anonymous sign-in failed, falling back to AuthWall:", error?.message || error);
        gateAction(
          { intent: intent || "import_pattern", title: "Create a free account to save patterns", subtitle: "Your imports and progress stay with you across devices." },
          () => { if(tierGate.atCap){triggerAtCap();return;} cb(); }
        );
        return;
      }
      // Anon sign-in succeeded — flip the session flags before opening
      // the modal so the import API call carries the new Bearer token.
      setAuthed(true);
      document.cookie = "wovely_authed=1;path=/;max-age=31536000";
      setIsAnonymous(true);
      try { sessionStorage.removeItem("wovely_anonymous_mode"); } catch {}
      setAnonymousMode(false);
      const u = supabaseAuth.getUser();
      if (u) posthog.identify(u.id, { email: u.email || "guest" });
      cb();
      return;
    }
    if (isAnonymous && (userPatterns.length - userStarterCount) >= ANON_PATTERN_CAP) {
      // Guest already used their 1 import. Show the AuthWall with copy
      // that emphasizes "create an account to keep importing", not a
      // paid-tier upsell.
      try { posthog.capture("guest_cap_hit", { intent }); } catch {}
      setAuthWallContext({
        title: "Create a free account to save up to 5 patterns",
        subtitle: "Your guest pattern stays attached to your new account.",
        intent: intent || "guest_cap",
        requiresPro: false,
        onSuccess: () => { setTimeout(() => cb(), 300); },
      });
      setAuthWallOpen(true);
      return;
    }
    if (tierGate.atCap) { triggerAtCap(); return; }
    cb();
  };

  const openAddModal=(method)=>{
    gateImport("import_pattern", () => { setPendingImportUrl(null); setPendingMethod(method||null); setAddOpen(true); });
  };

  // ── Guided first-run: starter pick runs the REAL import pipeline (S83) ─────
  // Mirrors the URL→PDF precedent in AddPatternModal: download the PDF, run
  // the SAME client-side pdf.js extraction as a user upload (page markers, no
  // truncation), then POST /api/import-job with the exact user-upload body.
  // From the queue onward nothing diverges: real worker phases drive the
  // ImportPill, the reveal is the pill's own completed state, review modal
  // included, confirm → handleAddPattern → startAndOpenPattern.
  const openStarterGallery = () => { setStarterError(false); setFirstRunMode("gallery"); };
  const isStarterJobId = (jobId) => { try { return !!jobId && sessionStorage.getItem(STARTER_JOB_KEY) === jobId; } catch { return false; } };

  const startStarterImport = async () => {
    if (starterImporting) return;
    setStarterImporting(true); setStarterError(false);
    try {
      const fileUrl = `${SUPABASE_URL}/storage/v1/object/public/pattern-files/${STARTER.storagePath}`;
      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error("starter fetch failed: " + res.status);
      const blob = await res.blob();
      const file = new File([blob], STARTER.storagePath.split("/").pop(), { type: "application/pdf" });
      const { text: rawText } = await extractTextFromPDF(file);
      if (!rawText || rawText.trim().length < STARTER_MIN_TEXT_CHARS) {
        console.error("[Wovely] Starter PDF text layer too thin:", rawText ? rawText.trim().length : 0, "chars — refusing to enqueue");
        setStarterError(true);
        return;
      }
      const session = getSession();
      if (!session?.access_token) { setStarterError(true); return; }
      const jobRes = await fetch("/api/import-job", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({ file_url: fileUrl, file_type: "pdf", raw_text: rawText, cover_image_url: STARTER.coverUrl || null, pdf_metadata_title: STARTER.title }),
      });
      if (!jobRes.ok) {
        console.error("[Wovely] Starter import-job POST failed:", jobRes.status, await jobRes.text().catch(()=>""));
        setStarterError(true);
        return;
      }
      const { job_id } = await jobRes.json();
      try { sessionStorage.setItem(STARTER_JOB_KEY, job_id); } catch {}
      setActiveImportJob(job_id); // pill is hidden while the modal is open; this survives a mid-import reload
      try { posthog.capture("starter_import_started", { starter: STARTER.storagePath }); } catch {}
      // Open the full modal in its loading state — identical to a user upload
      // post-submit. Same handoff handlePillResume uses: PDFUploadForm mounts
      // straight into the extracting stage polling this job, and
      // initialIsStarter resolves true via isStarterJobId(pendingResumeJobId).
      // Closing the modal mid-import re-arms the corner pill through the
      // existing unmount handoff, same as a real import. firstRunMode resets
      // so the fork (not the stale gallery) sits behind the modal.
      setPendingExtractedHandoff(null);
      setPendingResumeJobId({ jobId: job_id, fileType: 'pdf' });
      setPendingMethod('pdf');
      setFirstRunMode("fork");
      setAddOpen(true);
    } catch (e) {
      console.error("[Wovely] Starter import error:", e?.message);
      setStarterError(true);
    } finally {
      setStarterImporting(false);
    }
  };

  // Pick handler from the starter gallery. gateImport runs first — guests get
  // the anonymous sign-in (so the starter survives anon→signup identity
  // linking) and cap checks behave exactly as they do for a real import.
  const handlePickStarter = () => gateImport("starter_pick", startStarterImport);

  // Zero-friction collection creation: open the standard PDF picker but
  // flip the startingCollection flag so handleAddPattern promotes the
  // resulting pattern into a brand-new collection on save.
  const handleStartCollectionImport = () => {
    setStartingCollection(true);
    gateImport("start_collection_import", () => { setPendingImportUrl(null); setPendingMethod("pdf"); setAddOpen(true); });
  };
  // Shared local-state hook fired after a collection delete succeeds on the
  // backend. deleteCollection now removes the clue patterns outright, so we
  // drop them from userPatterns locally rather than releasing them back into
  // the library. Any non-clue patterns that were loosely linked have their
  // FK nulled server-side, so we release just those locally.
  const releaseCollectionPatternsLocally = (collectionId) => {
    if (!collectionId) return;
    setUserPatterns(prev => prev
      .filter(p => !(p.collection_id === collectionId && p.is_collection_part))
      .map(p => (p.collection_id === collectionId
        ? { ...p, collection_id: null, is_collection_part: false, collection_order: 0 }
        : p)));
    if (selected && selected.collection_id === collectionId) {
      setSelected(prev => prev ? { ...prev, collection_id: null, is_collection_part: false, collection_order: 0 } : prev);
    }
  };
  // CollectionSuggestionPrompt "Yes" — auto-create a new collection from
  // the detected metadata and re-link the just-saved pattern as the first
  // part, then jump to the collection detail. Mirrors the
  // isStartingCollection branch in handleAddPattern, but applies after a
  // standard import once the user opts in.
  const handleAcceptCollectionSuggestion = async () => {
    const sugg = collectionSuggestion;
    if (!sugg) return;
    setCollectionSuggestion(null);
    setCreatedPattern(null); // close the success overlay if it's open
    const meta = sugg.meta || {};
    const pat = sugg.pattern;
    const user = supabaseAuth.getUser();
    const session = getSession();
    const colPayload = {
      name: meta.collection_name || pat?.title || "Untitled Collection",
      description: null,
      collection_type: meta.collection_type === "mkal" ? "mkal" : "general",
      cover_image_url: pat?.cover_image_url || null,
      part_label: meta.part_label || "Part",
      expected_part_count: typeof meta.expected_part_count === "number" ? meta.expected_part_count : undefined,
    };
    const { data: newCollection, error: colErr } = await createCollection(colPayload);
    if (colErr || !newCollection) { console.warn("[Wovely] Suggestion accept create failed:", colErr); return; }
    const linkId = pat._supabaseId || pat.id;

    // Multi-component standalone import that the user now wants collected →
    // split the single saved pattern into one-per-component, same as the
    // zero-friction "Start a Collection" path. The already-saved single
    // pattern is removed and replaced by the split rows.
    const components = Array.isArray(pat.components) ? pat.components : [];
    if (components.length > 1 && user && session) {
      // Delete the original single (multi-component) pattern row.
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/patterns?id=eq.${linkId}&user_id=eq.${user.id}`, {
          method: "DELETE",
          headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${session.access_token}`, "Prefer": "return=minimal" },
        });
      } catch (e) { console.warn("[Wovely] Suggestion split: original delete failed:", e?.message); }
      setUserPatterns(prev => prev.filter(x => x.id !== linkId && x._supabaseId !== linkId));

      const acceptFileUrl = pat.source_file_url || pendingExtractedHandoff?.fileUrl || null;
      const savedIds = await insertComponentPatterns({ p: pat, targetCollection: newCollection, baseOrder: 0, user, session, importFileUrl: acceptFileUrl });
      fireImageExtraction(savedIds, acceptFileUrl, user.id);
      setSelectedCollection(newCollection);
      navigate("/collections/" + newCollection.id);
      return;
    }

    // Single-component pattern → link as-is (existing behavior).
    const assignedOrder = typeof meta.current_part_number === "number" && meta.current_part_number > 0 ? meta.current_part_number : 1;
    try { await linkPatternToCollection(linkId, newCollection.id, assignedOrder); }
    catch (e) { console.warn("[Wovely] Suggestion accept link failed:", e.message); }
    setUserPatterns(prev => prev.map(p => p.id === linkId || p._supabaseId === linkId
      ? { ...p, collection_id: newCollection.id, is_collection_part: true, collection_order: assignedOrder }
      : p));
    setSelectedCollection(newCollection);
    navigate("/collections/" + newCollection.id);
  };
  const handleImportUrl=(u)=>{
    gateImport("import_pattern_url", () => { setPendingImportUrl(u); setPendingMethod("url"); setAddOpen(true); });
  };
  const openImageImport=()=>{
    gateImport("import_pattern_image", () => { setImageImportOpen(true); });
  };
  // ImportPill callbacks. Completed: open the review modal with extracted data.
  // Failed: open a fresh import modal (no auto-requeue per spec).
  // Resume (S1.5.3): pill is tapped *during* processing → reopen the full
  // loading modal against the same job_id so polling continues seamlessly.
  const handlePillReview=({jobId,fileType,extractedData,coverImageUrl,validationReport,fileUrl})=>{
    setPendingResumeJobId(null);
    setPendingExtractedHandoff({ fileType, extractedData, coverImageUrl: coverImageUrl || null, validationReport: validationReport || null, fileUrl: fileUrl || null, isStarter: isStarterJobId(jobId) });
    if (fileType === 'pdf') { setPendingMethod('pdf'); setAddOpen(true); }
    else if (fileType === 'image') { setImageImportOpen(true); }
  };
  const handlePillTryAgain=({jobId,fileType})=>{
    // A failed starter job falls back to the normal pick-a-file modal; drop
    // the starter marker so a subsequent own-PDF import isn't flagged.
    if (isStarterJobId(jobId)) { try { sessionStorage.removeItem(STARTER_JOB_KEY); } catch {} }
    setPendingResumeJobId(null);
    setPendingExtractedHandoff(null);
    if (fileType === 'pdf') { setPendingMethod('pdf'); setAddOpen(true); }
    else if (fileType === 'image') { setImageImportOpen(true); }
  };
  const handlePillResume=({jobId,fileType})=>{
    setPendingExtractedHandoff(null);
    setPendingResumeJobId({ jobId, fileType });
    if (fileType === 'pdf') { setPendingMethod('pdf'); setAddOpen(true); }
    else if (fileType === 'image') { setImageImportOpen(true); }
  };
  // Generic "see Pro features" entry: routes anonymous users through AuthWall first.
  // Use for locked nav items, BevCheck-style Pro triggers, and any CTA that previously called setShowProModal directly.
  const openProGate=(intent)=>gateAction(
    { requiresPro: true, intent: intent || "unlock_pro", title: "Create a free account to unlock Craft", subtitle: "Sign up free, then upgrade to Craft anytime." },
    () => {}
  );
  const updatePatternStatus=(p,status)=>{
    const updated={...p,status};
    setUserPatterns(prev=>prev.map(x=>x.id===p.id?updated:x));
    setStarterPatterns(prev=>prev.map(x=>x.id===p.id?updated:x));
    const user=supabaseAuth.getUser();const session=getSession();
    const pid=p._supabaseId||p.id;
    if(user&&session&&typeof pid==="string"&&!pid.startsWith("local_")&&!pid.startsWith("starter_")){
      fetch(`${SUPABASE_URL}/rest/v1/patterns?id=eq.${pid}&user_id=eq.${user.id}`,{
        method:"PATCH",headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${session.access_token}`,"Content-Type":"application/json","Prefer":"return=minimal"},
        body:JSON.stringify({status,updated_at:new Date().toISOString()}),
      }).catch(e=>console.error("[Wovely] Status update error:",e));
    }
  };
  const handleParkPattern=(p)=>updatePatternStatus(p,"parked");
  const handleUnparkPattern=(p)=>updatePatternStatus(p,"active");
  const handleDeletePattern=(p)=>setDeleteTarget(p);
  const confirmDelete=()=>{if(deleteTarget){updatePatternStatus(deleteTarget,"deleted");setDeleteTarget(null);}};
  const parkInsteadOfDelete=()=>{if(deleteTarget){updatePatternStatus(deleteTarget,"parked");setDeleteTarget(null);}};
  const handleRenamePattern=async(p,newTitle)=>{
    const updated={...p,title:newTitle};
    setUserPatterns(prev=>prev.map(x=>x.id===p.id?updated:x));
    const user=supabaseAuth.getUser();const session=getSession();
    const pid=p._supabaseId||p.id;
    if(user&&session&&typeof pid==="string"&&!pid.startsWith("local_")&&!pid.startsWith("starter_")){
      fetch(`${SUPABASE_URL}/rest/v1/patterns?id=eq.${pid}&user_id=eq.${user.id}`,{
        method:"PATCH",headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${session.access_token}`,"Content-Type":"application/json","Prefer":"return=minimal"},
        body:JSON.stringify({title:newTitle,updated_at:new Date().toISOString()}),
      }).catch(e=>console.error("[Wovely] Rename error:",e));
    }
  };
  const handleCoverChange=(p)=>setCoverPickerTarget(p);
  const handleCoverConfirm=async(imageUrl)=>{
    const p=coverPickerTarget;if(!p)return;
    let finalUrl=imageUrl;
    // Optimistic UI update
    const update=pat=>pat.id===p.id?{...pat,cover_image_url:finalUrl,photo:finalUrl||pat.photo}:pat;
    setUserPatterns(prev=>prev.map(update));
    if(selected&&selected.id===p.id)setSelected(prev=>prev?{...prev,cover_image_url:finalUrl,photo:finalUrl||prev.photo}:prev);
    setCoverPickerTarget(null);
    // Persist to Supabase
    const user=supabaseAuth.getUser();const session=getSession();
    const pid=p._supabaseId||p.id;
    if(user&&session&&typeof pid==="string"&&!pid.startsWith("local_")&&!pid.startsWith("starter_")){
      fetch(`${SUPABASE_URL}/rest/v1/patterns?id=eq.${pid}&user_id=eq.${user.id}`,{
        method:"PATCH",headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${session.access_token}`,"Content-Type":"application/json","Prefer":"return=minimal"},
        body:JSON.stringify({cover_image_url:finalUrl,updated_at:new Date().toISOString()}),
      }).then(r=>{if(r.ok)console.log("[Wovely] Cover image updated for",pid);else r.text().then(t=>console.error("[Wovely] Cover PATCH error:",t));}).catch(e=>console.error("[Wovely] Cover save error:",e));
    }
  };
  const inProgress=allPatterns.filter(p=>{const v=pct(p);return !p.isStarter&&p.status!=="deleted"&&p.status!=="parked"&&((p.status==="in_progress"&&v<100)||(p.started&&v<100)||(v>0&&v<100));});
  const TITLE_MAP={collection:null,wip:"On the Hook",browse:"Find Patterns",stash:"Stash & Notions",calculator:"The Workbench",shopping:"Supply Run",profile:"Profile & Settings",community:null,privacy:"Privacy Policy",terms:"Terms of Service"};

  if(isDesktop) return (
    <div style={{display:"flex",minHeight:"100vh",width:"100%",background:`${T.crosshatch},${T.bg}`,fontFamily:T.sans,position:"relative"}}>
      <CSS/>
      <WhatsNewModal/>
      <AuthWallModal isOpen={authWallOpen} onClose={()=>{setAuthWallOpen(false);setAuthWallContext(null);setPendingUpgradeTier(null);setPendingUpgradeCadence(null);try{sessionStorage.removeItem(PENDING_UPGRADE_KEY);sessionStorage.removeItem(PENDING_UPGRADE_CADENCE_KEY);}catch{}}} onSuccess={handleAuthWallSuccess} title={authWallContext?.title} subtitle={authWallContext?.subtitle} intent={authWallContext?.intent} isAnonymous={isAnonymous}/>
      {!addOpen&&!imageImportOpen&&<ImportPill onTapReview={handlePillReview} onTapTryAgain={handlePillTryAgain} onTapResume={handlePillResume}/>}
      {showOnboarding&&<OnboardingScreen onComplete={()=>{setShowOnboarding(false);setJustCompletedOnboarding(true);navigate("/profile");}} onBackToAuth={async()=>{setShowOnboarding(false);await supabaseAuth.signOut();setAuthed(false);setTier(TIER_FREE);clearCachedTier();setUserPatterns([]);}}/>}
      {showPaywall&&<TieredUpgradeModal currentTier={tier} reason="paywall" onClose={()=>{setShowPaywall(false);setPaywallRecommend(null);}} isAnonymous={!authed || isAnonymous} onSignupRequired={handleUpgradeSignupRequired} recommendedTier={paywallRecommend}/>}
      {showFairUseWall&&<FairUseWall cap={TIER_CONFIG.craft.patternCap} onClose={()=>setShowFairUseWall(false)}/>}
      {showProModal&&<TieredUpgradeModal currentTier={tier} reason="general" onClose={()=>{setShowProModal(false);setPaywallRecommend(null);}} isAnonymous={!authed || isAnonymous} onSignupRequired={handleUpgradeSignupRequired} recommendedTier={paywallRecommend}/>}
      <BevChat open={chatOpen} onClose={()=>setChatOpen(false)} onPaywall={()=>{setChatOpen(false);setShowProModal(true);}} onCircle={()=>setChatOpen(false)}/>
      <VaultReveal open={showVault} onDone={()=>setShowVault(false)}/>
      {collectionSuggestion && <CollectionSuggestionPrompt pattern={collectionSuggestion.pattern} meta={collectionSuggestion.meta} onYes={handleAcceptCollectionSuggestion} onNo={()=>setCollectionSuggestion(null)} />}
      {addOpen&&<AddPatternModal onClose={()=>{setAddOpen(false);setPendingImportUrl(null);setPendingMethod(null);setPendingExtractedHandoff(null);setPendingResumeJobId(null);setCollectionContext(null);setStartingCollection(false);}} onSave={handleAddPattern} isPro={isPro} patternCount={userPatterns.length} Btn={Btn} Photo={Photo} Bar={Bar} WireframeViewer={WireframeViewer} onUpgrade={()=>openProGate("bevcheck_preview")} onPhotoImport={()=>{setAddOpen(false);setPendingImportUrl(null);setPendingMethod(null);openImageImport();}} initialMethod={pendingImportUrl?"url":pendingMethod||undefined} initialUrl={pendingImportUrl||undefined} initialExtracted={pendingExtractedHandoff?.fileType==='pdf'?pendingExtractedHandoff.extractedData:null} initialCoverUrl={pendingExtractedHandoff?.fileType==='pdf'?pendingExtractedHandoff.coverImageUrl:null} initialFileUrl={pendingExtractedHandoff?.fileType==='pdf'?pendingExtractedHandoff.fileUrl:null} initialValidationReport={pendingExtractedHandoff?.fileType==='pdf'?pendingExtractedHandoff.validationReport:null} initialPollingJobId={pendingResumeJobId?.fileType==='pdf'?pendingResumeJobId.jobId:null} isCollectionImport={!!startingCollection || !!collectionContext?.id} initialIsStarter={(pendingExtractedHandoff?.fileType==='pdf'&&!!pendingExtractedHandoff?.isStarter)||(pendingResumeJobId?.fileType==='pdf'&&isStarterJobId(pendingResumeJobId.jobId))}/>}
      {imageImportOpen&&<ImageImportModal onClose={()=>{setImageImportOpen(false);setPendingExtractedHandoff(null);setPendingResumeJobId(null);}} onPatternSaved={handleAddPattern} userId={supabaseAuth.getUser()?.id} isPro={isPro} onUpgrade={()=>openProGate("bevcheck_preview")} initialExtracted={pendingExtractedHandoff?.fileType==='image'?pendingExtractedHandoff.extractedData:null} initialCoverUrl={pendingExtractedHandoff?.fileType==='image'?pendingExtractedHandoff.coverImageUrl:null} initialValidationReport={pendingExtractedHandoff?.fileType==='image'?pendingExtractedHandoff.validationReport:null} initialPollingJobId={pendingResumeJobId?.fileType==='image'?pendingResumeJobId.jobId:null}/>}
      {addMenuOpen&&menuAnchor&&<><div onClick={()=>{setAddMenuOpen(false);setMenuAnchor(null);}} style={{position:"fixed",inset:0,zIndex:49}}/><div style={{position:"fixed",top:menuAnchor.top,left:menuAnchor.left,zIndex:50,background:"#fff",border:`1px solid ${T.border}`,borderRadius:14,boxShadow:"0 8px 32px rgba(45,45,78,.12)",minWidth:220,padding:"6px 0",fontFamily:"Nunito,sans-serif"}}>{[{icon:"📄",label:"Add PDF",action:()=>{setAddMenuOpen(false);setMenuAnchor(null);openAddModal("pdf");}},{icon:"📸",label:"Add from photos",action:()=>{setAddMenuOpen(false);setMenuAnchor(null);openImageImport();}},{icon:"🔗",label:"Paste a URL",action:()=>{setAddMenuOpen(false);setMenuAnchor(null);openAddModal("url");}},...(tier===TIER_CRAFT?[{icon:"📚",label:"Start a Collection",action:()=>{setAddMenuOpen(false);setMenuAnchor(null);handleStartCollectionImport();}}]:[]),{icon:"🌐",label:"Explore free patterns",action:()=>{setAddMenuOpen(false);setMenuAnchor(null);navigateToView("browse");}}].map(item=>(<div key={item.label} onClick={item.action} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",cursor:"pointer",fontSize:13,fontWeight:500,color:T.ink,transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=T.linen} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><span style={{fontSize:16,width:22,textAlign:"center"}}>{item.icon}</span>{item.label}</div>))}</div></>}
      {createdPattern&&<PatternCreatedOverlay pattern={createdPattern} onStartBuilding={()=>{const p=createdPattern;const ctx=collectionContext;setCreatedPattern(null);setCollectionContext(null);startAndOpenPattern(p);}} onGoToHive={()=>{const ctx=collectionContext;setCreatedPattern(null);setCollectionContext(null);if(ctx?.id){setSelectedCollection(ctx);navigate("/collections/"+ctx.id);}else{navigateToView("collection");}}}/>}
      {multiSectionNotice&&<MultiSectionAnnouncePrompt count={multiSectionNotice.count} isCraft={tier===TIER_CRAFT} onGo={()=>{const pat=multiSectionNotice.pattern;setMultiSectionNotice(null);if(pat)startAndOpenPattern(pat);}} onSeeCraft={()=>{setMultiSectionNotice(null);setPaywallRecommend(requiredTier('collections'));setShowPaywall(true);}}/>}
      {pinnedImage?.image && <PinnedThumbnail image={pinnedImage.image} onOpen={()=>setPinnedLightboxOpen(true)} onUnpin={()=>{setPinnedImage(null);setPinnedLightboxOpen(false);}} />}
      {pinnedLightboxOpen && pinnedImage?.image && <ChartLightbox images={[pinnedImage.image]} startIndex={0} onClose={()=>setPinnedLightboxOpen(false)} canPin={true} pinnedImageId={pinnedImage.image.id} onTogglePin={(img)=>{togglePin(img,pinnedImage.collectionId);setPinnedLightboxOpen(false);}} />}
      {readyPromptPattern&&<ReadyToBuildPrompt pattern={readyPromptPattern} onStartBuilding={()=>{const p=readyPromptPattern;setReadyPromptPattern(null);startAndOpenPattern(p);}} onViewDetails={()=>{const p=readyPromptPattern;setReadyPromptPattern(null);setSelected(p);navigateToView("detail",p._supabaseId||p.id);}} onDismiss={()=>setReadyPromptPattern(null)}/>}
      {deleteTarget&&<DeleteConfirmModal pattern={deleteTarget} isPro={isPro} onCancel={()=>setDeleteTarget(null)} onDelete={confirmDelete} onPark={parkInsteadOfDelete} onGoPro={()=>{setDeleteTarget(null);setShowProModal(true);}}/>}
      {coverPickerTarget&&<CoverImagePicker pattern={coverPickerTarget} onConfirm={handleCoverConfirm} onClose={()=>setCoverPickerTarget(null)} pdfThumbUrl={pdfThumbUrl} CAT_IMG={CAT_IMG} ALL_CAT_ENTRIES={ALL_CAT_ENTRIES}/>}
      <WelcomeToast visible={showWelcomeToast}/>
      {upgradeToast&&<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:999,background:upgradeToast==="success"?"#1E8A63":"#726A92",color:"#fff",borderRadius:14,padding:"12px 24px",fontSize:14,fontWeight:600,boxShadow:"0 8px 32px rgba(0,0,0,.2)",animation:"modalPop .3s ease both",textAlign:"center"}}>{upgradeToast==="success"?`Welcome to Wovely ${tierLabel(tier)}!`:"No worries — you can upgrade anytime"}</div>}
      <SidebarNav view={view} onNavigate={navigateToView} count={userPatterns.length} isPro={isPro} tier={tier} isAnonymous={!authed || isAnonymous} onAddPattern={()=>openAddModal()} onSignOut={handleSignOut} onUpgrade={()=>setShowProModal(true)} onOpenAuthWall={openNavAuthWall} userPatterns={userPatterns} allPatterns={allPatterns}/>
      <div ref={mainScrollRef} style={{flex:1,minWidth:0,overflowY:"auto",display:"flex",flexDirection:"column",background:"transparent"}}>
        <WelcomeBanner visible={showWelcomeBanner}/>
        <div style={{padding:"0 40px",height:68,display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:20,flexShrink:0,background:"rgba(251,249,255,.86)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)"}}>
          <div onClick={isAdam?handleLogoTap:undefined} style={{fontFamily:T.disp,fontSize:26,fontWeight:600,color:T.ink,cursor:isAdam?"pointer":"default"}}>{TITLE_MAP[view]!==null?TITLE_MAP[view]:""}</div>
          <div style={{display:"flex",alignItems:"center",gap:14,position:"relative"}}>
            <button onClick={()=>setChatOpen(true)} aria-label="Talk to us" title="Talk to us" style={{display:"flex",alignItems:"center",gap:8,background:"none",border:0,cursor:"pointer",fontWeight:800,fontSize:14,color:T.accent,fontFamily:T.body}}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11.5a7.5 7.5 0 01-10.9 6.7L4.5 19l1-4.1A7.5 7.5 0 1120 11.5z"/></svg>Talk to us</button>
            <div style={{fontWeight:800,fontSize:13,color:T.muted,background:"#fff",border:`1px solid ${T.line}`,padding:"9px 15px",borderRadius:999,display:"flex",alignItems:"center",gap:7}}><span style={{color:T.accent}}>✦</span> {isPro?tierLabel(tier):"Free"}</div>
            <button onClick={()=>openAddModal()} style={{background:T.accent,color:"#fff",border:0,borderRadius:13,padding:"11px 20px",fontSize:14,fontWeight:800,fontFamily:T.body,cursor:"pointer",boxShadow:`0 12px 24px -12px ${T.accent}`,display:"flex",alignItems:"center",gap:8}}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg> Add Pattern
            </button>
          </div>
        </div>
        <div style={{flex:1,padding:"0 32px",minHeight:"100vh"}}>
          {view==="collection"&&(userPatterns.length===0&&(patternsFetched||anonymousMode)?<FirstRunFork mode={firstRunMode} starter={STARTER} busy={starterImporting} error={starterError} isMobile={!isDesktop} onImportOwn={()=>openAddModal()} onShowGallery={openStarterGallery} onBack={()=>setFirstRunMode("fork")} onPickStarter={handlePickStarter}/>:<CollectionView userPatterns={userPatterns} starterPatterns={starterPatterns} cat={cat} setCat={setCat} search={search} setSearch={setSearch} openDetail={openDetail} onAddPattern={openAddModal} isPro={isPro} tier={tierGate} isAnonymous={!authed || isAnonymous} onOpenCollection={(c)=>{setSelectedCollection(c);navigate("/collections/"+c.id);}} onCreateCollection={()=>handleStartCollectionImport()} onStartCollectionImport={handleStartCollectionImport} onOpenUpgrade={()=>setShowProModal(true)} onCollectionDeletedLocal={releaseCollectionPatternsLocally} onNavigate={navigateToView} onPark={handleParkPattern} onUnpark={handleUnparkPattern} onDelete={handleDeletePattern} onCoverChange={handleCoverChange} onRename={handleRenamePattern} pct={pct} catFallbackPhoto={catFallbackPhoto} Photo={Photo} Bar={Bar} Stars={Stars} CATS={CATS} TIER_CONFIG={TIER_CONFIG} firstName={greetName}/>)}
          {view==="wip"&&<div style={{padding:"24px 0 80px"}}><button onClick={()=>navigateToView("collection")} style={{background:"none",border:"none",color:T.terra,cursor:"pointer",fontSize:13,fontWeight:600,padding:0,marginBottom:20,display:"flex",alignItems:"center",gap:6}}>← Back</button>{inProgress.length===0?<div style={{textAlign:"center",padding:"80px 20px"}}><div style={{fontSize:48,marginBottom:14}}>🪡</div><div style={{fontFamily:T.serif,fontSize:20,fontWeight:600,color:"#2E2748",marginBottom:8}}>Your builds in progress</div><div style={{fontSize:14,color:"#726A92",lineHeight:1.6}}>They'll show up here once you start crocheting a pattern.</div></div>:<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:20}}>{inProgress.map((p,i)=><PatternCard key={p.id} p={p} delay={i*.06} onClick={()=>openDetail(p)} pct={pct} catFallbackPhoto={catFallbackPhoto} Photo={Photo} Bar={Bar} Stars={Stars}/>)}</div>}</div>}
          {view==="detail"&&selected&&<div style={{margin:"0 -40px"}}><Detail key={selected._supabaseId||selected.id} p={selected} onBack={()=>{setPendingScrollToRow(null);detailOnBack();}} onSave={detailOnSave} pct={pct} estYards={estYards} estSkeins={estSkeins} pdfThumbUrl={pdfThumbUrl} CSS={CSS} Bar={Bar} Photo={Photo} Stars={Stars} WireframeViewer={WireframeViewer} Btn={Btn} scrollToRow={pendingScrollToRow} isAnonymous={isAnonymous} tier={tier} onShowUpgrade={()=>setShowProModal(true)} pinnedImageId={pinnedImage?.image?.id||null} onTogglePin={(img)=>togglePin(img, selected?.collection_id ?? null)} onSignUp={()=>{setAuthWallContext({title:"You're just getting started",subtitle:"Create a free account to see the full pattern.",intent:"guest_preview_cta",requiresPro:false,onSuccess:()=>{}});setAuthWallOpen(true);}} collectionUpgrade={(collectionUpgradeBanner && (collectionUpgradeBanner.patternId===(selected._supabaseId||selected.id))) ? collectionUpgradeBanner.meta : null} onCollectionUpgrade={()=>{setPaywallRecommend(requiredTier('collections'));setShowProModal(true);}} onCollectionUpgradeDismiss={()=>setCollectionUpgradeBanner(null)}/></div>}
          {view==="browse"&&<BrowseSitesView onImportUrl={handleImportUrl}/>}
          {view==="stash"&&<div style={{paddingTop:24}}><YarnStash gateAction={gateAction}/></div>}
          {view==="calculator"&&<div style={{paddingTop:24}}><Calculators/></div>}
          {view==="stitch-check"&&<div style={{paddingTop:24}}><StitchCheck gateAction={gateAction}/></div>}
          {view==="shopping"&&<div style={{paddingTop:24}}><ShoppingList gateAction={gateAction}/></div>}
          {view==="community"&&<div style={{paddingTop:24}}><YarnCircle isDesktop={isDesktop} isTablet={isTablet} authed={authed} isAnonymous={!authed||isAnonymous} demo={typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('circledemo')==='1'} onShare={()=>openAddModal()} onOpenPattern={(pid)=>navigate("/pattern/"+encodeURIComponent(pid))} onSignIn={openNavAuthWall}/></div>}
          {view==="profile"&&<ProfileSettingsView isPro={isPro} tier={tier} authed={authed} patterns={userPatterns} isAnonymous={!authed || isAnonymous} onSignOut={handleSignOut} onCreateAccount={openNavAuthWall} gateAction={gateAction} onOpenProModal={()=>openProGate("profile_upgrade_pill")} onGoHome={()=>navigate("/")}/>}
          {view==="collection-detail"&&selectedCollection&&<CollectionDetailView collection={selectedCollection} onBack={()=>{setSelectedCollection(null);navigate("/");}} onOpenPattern={(p)=>{const pid=p._supabaseId||p.id;setSelected(p);navigate("/pattern/"+encodeURIComponent(pid));}} onImportClue={(c,order)=>{setCollectionContext({...c,_targetOrder:order});setPendingMethod("pdf");setAddOpen(true);}} onAddPattern={(c)=>{setCollectionContext(c);setPendingMethod("pdf");setAddOpen(true);}} onCollectionChanged={(c)=>setSelectedCollection(c)} tier={tier} onShowUpgrade={()=>setShowProModal(true)} pinnedImageId={pinnedImage?.image?.id||null} onTogglePin={(img)=>togglePin(img, selectedCollection?.id ?? null)} onCollectionDeleted={(deletedId)=>{releaseCollectionPatternsLocally(deletedId);setSelectedCollection(null);setCollectionsRefreshNonce(n=>n+1);navigate("/");}}/>}
          {view==="collection-detail"&&!selectedCollection&&<div style={{padding:"80px 0",textAlign:"center"}}><div className="spinner" style={{width:28,height:28,border:"3px solid #ECE6F8",borderTopColor:"#7B6AD4",borderRadius:"50%",margin:"0 auto"}}/></div>}
          {view==="privacy"&&<PrivacyPolicy/>}
          {view==="terms"&&<TermsOfService/>}
          {location.pathname.startsWith("/stitch/")&&<div style={{paddingTop:24}}><StitchResultPage/></div>}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{fontFamily:T.sans,background:`${T.crosshatch},${T.bg}`,minHeight:"100vh",maxWidth:isTablet?680:430,margin:"0 auto",display:"flex",flexDirection:"column",position:"relative"}}>
      <CSS/>
      <WhatsNewModal/>
      <AuthWallModal isOpen={authWallOpen} onClose={()=>{setAuthWallOpen(false);setAuthWallContext(null);setPendingUpgradeTier(null);setPendingUpgradeCadence(null);try{sessionStorage.removeItem(PENDING_UPGRADE_KEY);sessionStorage.removeItem(PENDING_UPGRADE_CADENCE_KEY);}catch{}}} onSuccess={handleAuthWallSuccess} title={authWallContext?.title} subtitle={authWallContext?.subtitle} intent={authWallContext?.intent} isAnonymous={isAnonymous}/>
      {!addOpen&&!imageImportOpen&&<ImportPill onTapReview={handlePillReview} onTapTryAgain={handlePillTryAgain} onTapResume={handlePillResume}/>}
      {showOnboarding&&<OnboardingScreen onComplete={()=>{setShowOnboarding(false);setJustCompletedOnboarding(true);navigate("/profile");}} onBackToAuth={async()=>{setShowOnboarding(false);await supabaseAuth.signOut();setAuthed(false);setTier(TIER_FREE);clearCachedTier();setUserPatterns([]);}}/>}
      <WelcomeToast visible={showWelcomeToast}/>
      {upgradeToast&&<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:999,background:upgradeToast==="success"?"#1E8A63":"#726A92",color:"#fff",borderRadius:14,padding:"12px 24px",fontSize:14,fontWeight:600,boxShadow:"0 8px 32px rgba(0,0,0,.2)",animation:"modalPop .3s ease both",textAlign:"center"}}>{upgradeToast==="success"?`Welcome to Wovely ${tierLabel(tier)}!`:"No worries — you can upgrade anytime"}</div>}
      {/* Hamburger drawer (NavPanel) retired — the 2b mobile shell navigates
          via the fixed bottom nav below, per Wovely App 2b.dc.html ≤640px. */}
      {showPaywall&&<TieredUpgradeModal currentTier={tier} reason="paywall" onClose={()=>{setShowPaywall(false);setPaywallRecommend(null);}} isAnonymous={!authed || isAnonymous} onSignupRequired={handleUpgradeSignupRequired} recommendedTier={paywallRecommend}/>}
      {showFairUseWall&&<FairUseWall cap={TIER_CONFIG.craft.patternCap} onClose={()=>setShowFairUseWall(false)}/>}
      {showProModal&&<TieredUpgradeModal currentTier={tier} reason="general" onClose={()=>{setShowProModal(false);setPaywallRecommend(null);}} isAnonymous={!authed || isAnonymous} onSignupRequired={handleUpgradeSignupRequired} recommendedTier={paywallRecommend}/>}
      <BevChat open={chatOpen} onClose={()=>setChatOpen(false)} onPaywall={()=>{setChatOpen(false);setShowProModal(true);}} onCircle={()=>setChatOpen(false)}/>
      <VaultReveal open={showVault} onDone={()=>setShowVault(false)}/>
      {collectionSuggestion && <CollectionSuggestionPrompt pattern={collectionSuggestion.pattern} meta={collectionSuggestion.meta} onYes={handleAcceptCollectionSuggestion} onNo={()=>setCollectionSuggestion(null)} />}
      {addOpen&&<AddPatternModal onClose={()=>{setAddOpen(false);setPendingImportUrl(null);setPendingMethod(null);setPendingExtractedHandoff(null);setPendingResumeJobId(null);setCollectionContext(null);setStartingCollection(false);}} onSave={handleAddPattern} isPro={isPro} patternCount={userPatterns.length} Btn={Btn} Photo={Photo} Bar={Bar} WireframeViewer={WireframeViewer} onUpgrade={()=>openProGate("bevcheck_preview")} onPhotoImport={()=>{setAddOpen(false);setPendingImportUrl(null);setPendingMethod(null);openImageImport();}} initialMethod={pendingImportUrl?"url":pendingMethod||undefined} initialUrl={pendingImportUrl||undefined} initialExtracted={pendingExtractedHandoff?.fileType==='pdf'?pendingExtractedHandoff.extractedData:null} initialCoverUrl={pendingExtractedHandoff?.fileType==='pdf'?pendingExtractedHandoff.coverImageUrl:null} initialFileUrl={pendingExtractedHandoff?.fileType==='pdf'?pendingExtractedHandoff.fileUrl:null} initialValidationReport={pendingExtractedHandoff?.fileType==='pdf'?pendingExtractedHandoff.validationReport:null} initialPollingJobId={pendingResumeJobId?.fileType==='pdf'?pendingResumeJobId.jobId:null} isCollectionImport={!!startingCollection || !!collectionContext?.id} initialIsStarter={(pendingExtractedHandoff?.fileType==='pdf'&&!!pendingExtractedHandoff?.isStarter)||(pendingResumeJobId?.fileType==='pdf'&&isStarterJobId(pendingResumeJobId.jobId))}/>}
      {imageImportOpen&&<ImageImportModal onClose={()=>{setImageImportOpen(false);setPendingExtractedHandoff(null);setPendingResumeJobId(null);}} onPatternSaved={handleAddPattern} userId={supabaseAuth.getUser()?.id} isPro={isPro} onUpgrade={()=>openProGate("bevcheck_preview")} initialExtracted={pendingExtractedHandoff?.fileType==='image'?pendingExtractedHandoff.extractedData:null} initialCoverUrl={pendingExtractedHandoff?.fileType==='image'?pendingExtractedHandoff.coverImageUrl:null} initialValidationReport={pendingExtractedHandoff?.fileType==='image'?pendingExtractedHandoff.validationReport:null} initialPollingJobId={pendingResumeJobId?.fileType==='image'?pendingResumeJobId.jobId:null}/>}
      {createdPattern&&<PatternCreatedOverlay pattern={createdPattern} onStartBuilding={()=>{const p=createdPattern;const ctx=collectionContext;setCreatedPattern(null);setCollectionContext(null);startAndOpenPattern(p);}} onGoToHive={()=>{const ctx=collectionContext;setCreatedPattern(null);setCollectionContext(null);if(ctx?.id){setSelectedCollection(ctx);navigate("/collections/"+ctx.id);}else{navigateToView("collection");}}}/>}
      {multiSectionNotice&&<MultiSectionAnnouncePrompt count={multiSectionNotice.count} isCraft={tier===TIER_CRAFT} onGo={()=>{const pat=multiSectionNotice.pattern;setMultiSectionNotice(null);if(pat)startAndOpenPattern(pat);}} onSeeCraft={()=>{setMultiSectionNotice(null);setPaywallRecommend(requiredTier('collections'));setShowPaywall(true);}}/>}
      {pinnedImage?.image && <PinnedThumbnail image={pinnedImage.image} onOpen={()=>setPinnedLightboxOpen(true)} onUnpin={()=>{setPinnedImage(null);setPinnedLightboxOpen(false);}} />}
      {pinnedLightboxOpen && pinnedImage?.image && <ChartLightbox images={[pinnedImage.image]} startIndex={0} onClose={()=>setPinnedLightboxOpen(false)} canPin={true} pinnedImageId={pinnedImage.image.id} onTogglePin={(img)=>{togglePin(img,pinnedImage.collectionId);setPinnedLightboxOpen(false);}} />}
      {readyPromptPattern&&<ReadyToBuildPrompt pattern={readyPromptPattern} onStartBuilding={()=>{const p=readyPromptPattern;setReadyPromptPattern(null);startAndOpenPattern(p);}} onViewDetails={()=>{const p=readyPromptPattern;setReadyPromptPattern(null);setSelected(p);navigateToView("detail",p._supabaseId||p.id);}} onDismiss={()=>setReadyPromptPattern(null)}/>}
      {deleteTarget&&<DeleteConfirmModal pattern={deleteTarget} isPro={isPro} onCancel={()=>setDeleteTarget(null)} onDelete={confirmDelete} onPark={parkInsteadOfDelete} onGoPro={()=>{setDeleteTarget(null);setShowProModal(true);}}/>}
      {showWelcomeBanner&&<WelcomeBanner onDismiss={()=>setShowWelcomeBanner(false)}/>}
      {/* 2b mobile topbar (Wovely App 2b.dc.html ≤640px): brand moves up here
          (.tbbrand), profile becomes the round .tbprof button — nav lives in
          the fixed bottom bar, so no hamburger. */}
      <div style={{padding:"0 18px",height:60,display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:20,flexShrink:0,background:"rgba(251,249,255,.9)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)"}}>
        <div onClick={()=>{if(isAdam)handleLogoTap();navigateToView("collection");}} style={{display:"flex",alignItems:"center",gap:9,cursor:"pointer"}}>
          <img src="/bev_neutral.png" alt="Bev" style={{width:34,height:34,borderRadius:"50%",border:"2px solid #DCD0F7",background:T.soft,objectFit:"cover"}}/>
          <span style={{fontFamily:T.disp,fontSize:20,fontWeight:600,color:T.ink,lineHeight:1}}>Wovely</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setChatOpen(true)} aria-label="Talk to us" title="Talk to us" style={{display:"flex",alignItems:"center",gap:8,background:"none",border:0,cursor:"pointer",fontWeight:800,fontSize:14,color:T.accent,fontFamily:T.body}}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11.5a7.5 7.5 0 01-10.9 6.7L4.5 19l1-4.1A7.5 7.5 0 1120 11.5z"/></svg>Talk to us</button>
          <button onClick={()=>openAddModal()} aria-label="Add pattern" style={{background:T.accent,border:"none",borderRadius:"50%",width:36,height:36,cursor:"pointer",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 8px 18px -6px ${T.accent}`}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg></button>
          <button onClick={()=>navigateToView("profile")} aria-label="Profile & Settings" style={{width:36,height:36,borderRadius:"50%",background:"#fff",border:`1px solid ${T.line}`,color:T.accent,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,padding:0}}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 19c.8-3.4 3.4-5.2 6.5-5.2s5.7 1.8 6.5 5.2"/></svg>
          </button>
        </div>
      </div>
      {addMenuOpen&&<><div onClick={()=>setAddMenuOpen(false)} style={{position:"fixed",inset:0,zIndex:49,background:"rgba(28,23,20,.4)"}}/><div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:50,background:"#fff",borderRadius:"20px 20px 0 0",padding:"12px 0 24px",boxShadow:"0 -8px 32px rgba(45,45,78,.12)",fontFamily:"Nunito,sans-serif"}}><div style={{width:36,height:3,background:T.border,borderRadius:99,margin:"0 auto 16px"}}/>{[{icon:"📄",label:"Add PDF",sub:"Upload & extract",action:()=>{setAddMenuOpen(false);openAddModal("pdf");}},{icon:"📸",label:"Add from photos",sub:"Screenshots, scans, photos",action:()=>{setAddMenuOpen(false);openImageImport();}},{icon:"🔗",label:"Paste a URL",sub:"Any pattern link",action:()=>{setAddMenuOpen(false);openAddModal("url");}},...(tier===TIER_CRAFT?[{icon:"📚",label:"Start a Collection",sub:"MKAL, bundle, or pattern set",action:()=>{setAddMenuOpen(false);handleStartCollectionImport();}}]:[]),{icon:"🌐",label:"Explore free patterns",sub:"AllFreeCrochet, Drops & more",action:()=>{setAddMenuOpen(false);navigateToView("browse");}}].map(item=>(<div key={item.label} onClick={item.action} style={{display:"flex",alignItems:"center",gap:14,padding:"12px 22px",cursor:"pointer"}}><span style={{fontSize:22,width:28,textAlign:"center"}}>{item.icon}</span><div><div style={{fontSize:14,fontWeight:600,color:T.ink}}>{item.label}</div><div style={{fontSize:12,color:T.ink3}}>{item.sub}</div></div></div>))}</div></>}
      <div ref={mainScrollRef} style={{flex:1,overflowX:"hidden",overflowY:"auto",paddingBottom:"calc(110px + env(safe-area-inset-bottom, 0px))",minHeight:"100vh"}}>
        {view==="collection"&&(userPatterns.length===0&&(patternsFetched||anonymousMode)?<FirstRunFork mode={firstRunMode} starter={STARTER} busy={starterImporting} error={starterError} isMobile={!isDesktop} onImportOwn={()=>openAddModal()} onShowGallery={openStarterGallery} onBack={()=>setFirstRunMode("fork")} onPickStarter={handlePickStarter}/>:<CollectionView userPatterns={userPatterns} starterPatterns={starterPatterns} cat={cat} setCat={setCat} search={search} setSearch={setSearch} openDetail={openDetail} onAddPattern={()=>openAddModal()} isPro={isPro} tier={tierGate} isAnonymous={!authed || isAnonymous} onOpenCollection={(c)=>{setSelectedCollection(c);navigate("/collections/"+c.id);}} onCreateCollection={()=>handleStartCollectionImport()} onStartCollectionImport={handleStartCollectionImport} onOpenUpgrade={()=>setShowProModal(true)} onCollectionDeletedLocal={releaseCollectionPatternsLocally} onNavigate={navigateToView} onPark={handleParkPattern} onUnpark={handleUnparkPattern} onDelete={handleDeletePattern} onCoverChange={handleCoverChange} onRename={handleRenamePattern} pct={pct} catFallbackPhoto={catFallbackPhoto} Photo={Photo} Bar={Bar} Stars={Stars} CATS={CATS} TIER_CONFIG={TIER_CONFIG} firstName={greetName}/>)}
        {view==="wip"&&<div style={{padding:"16px 18px 80px"}}>{inProgress.length===0?<div style={{textAlign:"center",padding:"60px 20px"}}><div style={{fontSize:48,marginBottom:14}}>🪡</div><div style={{fontFamily:T.serif,fontSize:18,fontWeight:600,color:"#2E2748",marginBottom:8}}>Your builds in progress</div><div style={{fontSize:14,color:"#726A92",lineHeight:1.6}}>They'll show up here once you start crocheting a pattern.</div></div>:<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>{inProgress.map((p,i)=><PatternCard key={p.id} p={p} delay={i*.06} onClick={()=>openDetail(p)} pct={pct} catFallbackPhoto={catFallbackPhoto} Photo={Photo} Bar={Bar} Stars={Stars}/>)}</div>}</div>}
        {view==="detail"&&selected&&<Detail key={selected._supabaseId||selected.id} p={selected} onBack={()=>{setPendingScrollToRow(null);detailOnBack();}} onSave={detailOnSave} pct={pct} estYards={estYards} estSkeins={estSkeins} pdfThumbUrl={pdfThumbUrl} CSS={CSS} Bar={Bar} Photo={Photo} Stars={Stars} WireframeViewer={WireframeViewer} Btn={Btn} scrollToRow={pendingScrollToRow} isAnonymous={isAnonymous} tier={tier} onShowUpgrade={()=>setShowProModal(true)} pinnedImageId={pinnedImage?.image?.id||null} onTogglePin={(img)=>togglePin(img, selected?.collection_id ?? null)} onSignUp={()=>{setAuthWallContext({title:"You're just getting started",subtitle:"Create a free account to see the full pattern.",intent:"guest_preview_cta",requiresPro:false,onSuccess:()=>{}});setAuthWallOpen(true);}} collectionUpgrade={(collectionUpgradeBanner && (collectionUpgradeBanner.patternId===(selected._supabaseId||selected.id))) ? collectionUpgradeBanner.meta : null} onCollectionUpgrade={()=>{setPaywallRecommend(requiredTier('collections'));setShowProModal(true);}} onCollectionUpgradeDismiss={()=>setCollectionUpgradeBanner(null)}/>}
        {view==="browse"&&<BrowseSitesView onImportUrl={handleImportUrl}/>}
        {view==="stash"&&<div style={{paddingTop:18}}><YarnStash gateAction={gateAction}/></div>}
        {view==="calculator"&&<div style={{paddingTop:18}}><Calculators/></div>}
        {view==="stitch-check"&&<div style={{paddingTop:18}}><StitchCheck gateAction={gateAction}/></div>}
        {view==="shopping"&&<div style={{paddingTop:18}}><ShoppingList gateAction={gateAction}/></div>}
        {view==="community"&&<div style={{paddingTop:18}}><YarnCircle isDesktop={isDesktop} isTablet={isTablet} authed={authed} isAnonymous={!authed||isAnonymous} demo={typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('circledemo')==='1'} onShare={()=>openAddModal()} onOpenPattern={(pid)=>navigate("/pattern/"+encodeURIComponent(pid))} onSignIn={openNavAuthWall}/></div>}
        {view==="profile"&&<ProfileSettingsView isPro={isPro} tier={tier} authed={authed} patterns={userPatterns} isAnonymous={!authed || isAnonymous} onSignOut={handleSignOut} onCreateAccount={openNavAuthWall} gateAction={gateAction} onOpenProModal={()=>openProGate("profile_upgrade_pill")} onGoHome={()=>navigate("/")}/>}
        {view==="collection-detail"&&selectedCollection&&<CollectionDetailView collection={selectedCollection} onBack={()=>{setSelectedCollection(null);navigate("/");}} onOpenPattern={(p)=>{const pid=p._supabaseId||p.id;setSelected(p);navigate("/pattern/"+encodeURIComponent(pid));}} onImportClue={(c,order)=>{setCollectionContext({...c,_targetOrder:order});setPendingMethod("pdf");setAddOpen(true);}} onAddPattern={(c)=>{setCollectionContext(c);setPendingMethod("pdf");setAddOpen(true);}} onCollectionChanged={(c)=>setSelectedCollection(c)} tier={tier} onShowUpgrade={()=>setShowProModal(true)} pinnedImageId={pinnedImage?.image?.id||null} onTogglePin={(img)=>togglePin(img, selectedCollection?.id ?? null)} onCollectionDeleted={(deletedId)=>{releaseCollectionPatternsLocally(deletedId);setSelectedCollection(null);setCollectionsRefreshNonce(n=>n+1);navigate("/");}}/>}
          {view==="collection-detail"&&!selectedCollection&&<div style={{padding:"80px 0",textAlign:"center"}}><div className="spinner" style={{width:28,height:28,border:"3px solid #ECE6F8",borderTopColor:"#7B6AD4",borderRadius:"50%",margin:"0 auto"}}/></div>}
        {view==="privacy"&&<PrivacyPolicy/>}
        {view==="terms"&&<TermsOfService/>}
        {location.pathname.startsWith("/stitch/")&&<div style={{paddingTop:18}}><StitchResultPage/></div>}
      </div>
      {/* ── 2b mobile bottom nav (Wovely App 2b.dc.html ≤640px .side) ──
          The sidebar becomes a fixed 68px gradient bar: icon + tiny label
          per item, active gets the soft white pill. Profile lives in the
          topbar (.tbprof), so it's not a tab. z-30 sits under modals (400+),
          ImportPill (50) and focus mode (500). */}
      {(()=>{
        const TABS=[
          {key:"collection",tm:"Wovely"},
          {key:"browse",tm:"Find"},
          {key:"stash",tm:"Stash"},
          {key:"calculator",tm:"Workbench"},
          {key:"stitch-check",tm:"BevCheck",proOnly:true},
          {key:"shopping",tm:"Supplies"},
          {key:"community",tm:"Circle"},
        ];
        return (
          <>
            {/* Gold yarn cord, rotated to run along the bar's top edge (mockup
                .yarncord mobile treatment) */}
            <div aria-hidden="true" style={{position:"fixed",left:0,top:"calc(100vh - 58px - env(safe-area-inset-bottom, 0px))",width:17,height:"100vw",transformOrigin:"top left",transform:"rotate(-90deg)",zIndex:31,pointerEvents:"none",overflow:"hidden",display:"flex",flexDirection:"column",filter:"drop-shadow(3px 2px 3px rgba(90,58,10,.55))"}}>
              {Array.from({length:14}).map((_,i)=><img key={i} src={CORD_GOLD} alt="" style={{width:"100%",display:"block",flex:"none",transform:i%2?"scaleY(-1)":"none"}}/>)}
            </div>
            <nav style={{position:"fixed",left:0,right:0,bottom:0,height:"calc(68px + env(safe-area-inset-bottom, 0px))",paddingBottom:"env(safe-area-inset-bottom, 0px)",background:"linear-gradient(180deg,#8474DA 0%,#6E5AC8 100%)",display:"flex",alignItems:"center",padding:"6px 8px",boxSizing:"border-box",zIndex:30,boxShadow:"0 -10px 26px -12px rgba(46,28,104,.5)"}}>
              <div style={{display:"flex",flex:1,justifyContent:"space-between",gap:2,padding:"0 2px",maxWidth:isTablet?680:430,margin:"0 auto"}}>
                {TABS.map(t=>{
                  const active=view===t.key;
                  const locked=t.proOnly&&!isPro&&!(!authed||isAnonymous);
                  return (
                    <button key={t.key} onClick={()=>{if(locked){setShowProModal(true);return;}navigateToView(t.key);}} style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,padding:"8px 2px",borderRadius:12,border:"none",background:active?"rgba(255,255,255,.18)":"transparent",cursor:"pointer",opacity:locked?.6:1,transition:"background .15s"}}>
                      <span style={{width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",opacity:.94}}>{React.cloneElement(NAV_ICON[t.key],{width:20,height:20})}</span>
                      <span style={{fontFamily:T.body,fontWeight:800,fontSize:9.5,lineHeight:1,color:"#fff",whiteSpace:"nowrap"}}>{t.tm}</span>
                    </button>
                  );
                })}
              </div>
            </nav>
          </>
        );
      })()}
    </div>
  );
}
