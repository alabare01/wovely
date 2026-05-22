import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { initErrorReporter, setErrorReporterUser } from './utils/errorReporter.js';
import { useNavigate, useLocation, useParams, Routes, Route, Navigate } from "react-router-dom";
import posthog from "posthog-js";
import { T, useBreakpoint, Field } from "./theme.jsx";
import { SUPABASE_URL, SUPABASE_ANON_KEY, APP_ORIGIN, saveSession, getSession, supabaseAuth } from "./supabase.js";
import { PHOTOS, PILL, APP_VERSION } from "./constants.js";
import Calculators from "./Calculators.jsx";
import StitchCheck from "./StitchCheck.jsx";
import StitchResultPage from "./StitchResultPage.jsx";
import Auth from "./Auth.jsx";
import AuthWallModal from "./AuthWallModal.jsx";
import PatternHeader from "./PatternHeader.jsx";
import RowManager, { ensureRepeatBrackets } from "./RowManager.jsx";
import AddPatternModal, { uploadPatternFile, buildRowsFromComponents } from "./AddPatternModal.jsx";
import CollectionView, { PatternCard } from "./Dashboard.jsx";
import Detail, { CoverImagePicker, DeleteConfirmModal, ReadyToBuildPrompt, PatternCreatedOverlay } from "./PatternDetail.jsx";
import ImageImportModal from "./ImageImportModal.jsx";
import ImportPill, { setActiveImportJob } from "./components/ImportPill.jsx";
import PrivacyPolicy from "./PrivacyPolicy.jsx";
import TermsOfService from "./TermsOfService.jsx";
import FeedbackWidget from "./FeedbackWidget.jsx";
import WhatsNewModal, { triggerWhatsNew, useWovelySuperTap } from "./WhatsNewModal.jsx";
import Founders from "./Founders.jsx";
import UpgradeNudge from "./components/UpgradeNudge.jsx";
import {
  TIER_FREE, TIER_PRO, TIER_CRAFT,
  isPaidTier, isCraftTier, tierLabel, normalizeTier,
  tierFromLegacyIsPro, readCachedTier, writeCachedTier, clearCachedTier,
} from "./utils/tierUtils.js";
import { canAccess, requiredTier } from "./utils/featureGates.js";

if (typeof document !== "undefined" && !document.getElementById("sb-font")) {
  const l = document.createElement("link");
  l.id = "sb-font"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,700;1,500&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap";
  document.head.appendChild(l);
}

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
const VIEW_TO_PATH = {collection:"/",detail:"/",wip:"/builds",browse:"/browse",stash:"/stash",calculator:"/tools","stitch-check":"/stitch-check",shopping:"/shopping",profile:"/profile"};
const PATH_TO_VIEW = {"/":"collection","/hive":"collection","/builds":"wip","/browse":"browse","/stash":"stash","/tools":"calculator","/stitch-check":"stitch-check","/shopping":"shopping","/profile":"profile","/hive-vision":"hive-vision","/privacy":"privacy","/terms":"terms"};
const viewFromPath = (pathname) => {
  if(pathname.startsWith("/pattern/")) return "detail";
  if(pathname.startsWith("/hive/")) return "detail";
  return PATH_TO_VIEW[pathname] || "collection";
};
const patternIdFromPath = (pathname) => {
  const m = pathname.match(/^\/(pattern|hive)\/(.+)$/);
  return m ? decodeURIComponent(m[2]) : null;
};

// PHOTOS, PILL imported from ./constants.js

// Supabase auth imported from ./supabase.js

// APP_VERSION imported from ./constants.js
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

// Three-tier pricing. patternCap is the only cap that varies between tiers
// today; per-feature gating lives in src/utils/featureGates.js. Pro and
// Craft both get unlimited patterns — Craft adds Collections (and future
// Craft-only features) on top.
const TIER_CONFIG = {
  free:  { patternCap: 5,        priceLabel: "Free" },
  pro:   { patternCap: Infinity, priceMonthly: 4.99, priceLabel: "$4.99/mo" },
  craft: { patternCap: Infinity, priceMonthly: 8.99, priceLabel: "$8.99/mo" },
};

// useTier returns gating info for the active session. Pass the user's tier
// string ('free' | 'pro' | 'craft'); isPro is derived for back-compat with
// call sites that still want a boolean.
const useTier = (tier, userCount, starterCount=0) => {
  const realCount = userCount - starterCount;
  const paid = isPaidTier(tier);
  const cap = TIER_CONFIG[tier]?.patternCap ?? TIER_CONFIG.free.patternCap;
  const atCap  = !paid && realCount >= cap;
  const canAdd = paid  || realCount  < cap;
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
    body { font-family: "Inter", -apple-system, sans-serif; }
    input, textarea, button, select { font-family: "Inter", -apple-system, sans-serif; }
    @keyframes fadeUp    { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
    @keyframes slideUp   { from{opacity:0;transform:translateY(40px)} to{opacity:1;transform:translateY(0)} }
    @keyframes slideInLeft  { from{transform:translateX(-100%);opacity:0} to{transform:translateX(0);opacity:1} }
    @keyframes slideOutLeft { from{transform:translateX(0);opacity:1} to{transform:translateX(-100%);opacity:0} }
    @keyframes dimIn  { from{opacity:0} to{opacity:1} }
    @keyframes dimOut { from{opacity:1} to{opacity:0} }
    @keyframes fabPulse { 0%,100%{box-shadow:0 6px 24px rgba(155,126,200,.45)} 50%{box-shadow:0 6px 32px rgba(155,126,200,.7)} }
    @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
    @keyframes progressShimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
    @keyframes pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.15);opacity:.7} }
    @keyframes confidencePop { 0%{transform:scale(0.8);opacity:0} 60%{transform:scale(1.05)} 100%{transform:scale(1);opacity:1} }
    .fu { animation:fadeUp .4s ease both; }
    .su { animation:slideUp .35s cubic-bezier(.22,.68,0,1.05) both; }
    .nav-open  { animation:slideInLeft  .3s cubic-bezier(.22,.68,0,1.05) both; }
    .nav-close { animation:slideOutLeft .24s ease both; }
    .dim-in  { animation:dimIn  .25s ease both; }
    .dim-out { animation:dimOut .2s  ease both; }
    .spinner { animation:spin .8s linear infinite; }
    .conf-pop { animation:confidencePop .5s cubic-bezier(.22,.68,0,1.05) both; }
    .card { transition:transform .18s,box-shadow .18s; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
    .card:hover { transform:translateY(-1px) !important; box-shadow:0 4px 16px rgba(155,126,200,0.12) !important; }
    .tap { transition:opacity .15s; cursor:pointer; }
    .tap:hover { opacity:.85; }
    .method-card { transition:all .15s; }
    .method-card:hover { background:#EDE4F7 !important; border-color:#9B7EC8 !important; transform:translateY(-1px); }
    .progress-bar-fill { background:linear-gradient(90deg,#9B7EC8 0%,#B9A3DC 50%,#9B7EC8 100%); background-size:200% 100%; animation:progressShimmer 1.5s ease infinite; }
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
    @media(hover:hover) { .nav-item:hover { background:rgba(255,255,255,0.1) !important; } .site-row:hover { background:#F8F6FF !important; } }
  `}</style>
);

const pct = p => { const checkable=(p.rows||[]).filter(r=>!r.isHeader&&!r.isNoteOnly); return checkable.length ? Math.round(checkable.filter(r=>r.done).length/checkable.length*100) : 0; };

const DEFAULT_STARTERS = [];
const makeStarterPatterns = () => DEFAULT_STARTERS.map(p=>({...p,rows:p.rows.map(r=>({...r}))}));

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
    danger:{background:"#C05A5A",color:"#fff",border:"none"},
    gold:{background:"linear-gradient(135deg,#C9A84C,#8B6914)",color:"#fff",border:"none"},
  };
  return <button onClick={onClick} disabled={disabled} className="tap" style={{...styles[variant],borderRadius:12,padding:small?"8px 16px":"14px 20px",fontSize:small?13:15,fontWeight:600,cursor:disabled?"not-allowed":"pointer",width:full?"100%":"auto",opacity:disabled?.6:1,boxShadow:variant==="primary"?"0 4px 16px rgba(155,126,200,.3)":variant==="sage"?"0 4px 16px rgba(92,122,94,.3)":variant==="gold"?"0 4px 16px rgba(184,144,44,.35)":"none",...sx}}>{children}</button>;
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
            ctx.fillStyle="#9B7EC8"; ctx.font="bold 22px Inter, sans-serif"; ctx.textAlign="center";
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
    key: 'pro',
    name: 'Pro',
    priceMain: '$4.99',
    priceSub: '/month',
    blurb: 'For serious crafters.',
    features: [
      { label: 'Unlimited patterns', sub: 'No cap. Save every pattern you make' },
      { label: 'Big patterns welcome', sub: 'Full support for complex multi-component imports' },
      { label: 'BevCheck quality scoring', sub: 'Catch off-counts and broken rounds before you start' },
    ],
  },
  {
    key: 'craft',
    name: 'Craft',
    priceMain: '$8.99',
    priceSub: '/month',
    blurb: 'For makers who want it all.',
    features: [
      { label: 'Everything in Pro', sub: 'Unlimited patterns, big imports, BevCheck' },
      { label: 'Collections', sub: 'Organize pattern books and MKALs (3 per month)' },
      { label: 'More Craft features coming', sub: 'First in line as Craft grows' },
    ],
  },
];

const TieredUpgradeModal = ({ onClose, currentTier, reason }) => {
  const { isDesktop } = useBreakpoint();
  const [checkingOut, setCheckingOut] = useState(null); // tier key in flight
  const safeTier = normalizeTier(currentTier);
  // Pro is the natural step up from Free, so it's the recommended pick when
  // a Free user opens the modal. A Pro user only has Craft as a step up.
  // Craft users see no recommendation arrow — all CTAs become Current Plan.
  const recommendedKey = safeTier === TIER_FREE ? TIER_PRO : safeTier === TIER_PRO ? TIER_CRAFT : null;

  const handleCheckout = async (tierKey) => {
    posthog.capture("upgrade_clicked", { tier: tierKey, reason: reason || 'general' });
    setCheckingOut(tierKey);
    try {
      const user = supabaseAuth.getUser();
      const s = getSession();
      if (!user || !s) throw new Error("Not authenticated");
      const uid = (()=>{try{const p=JSON.parse(atob(s.access_token.split(".")[1]));return p.sub;}catch{return null;}})();
      const res = await fetch("/api/stripe-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid || user.id, email: user.email, tier: tierKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      window.location.href = data.url;
    } catch (err) {
      console.error("[Wovely] Checkout error:", err);
      setCheckingOut(null);
    }
  };

  const reasonHeader = reason === 'paywall' ? "Your pattern box is full" : "Pick the plan that fits your craft";
  const reasonSub = reason === 'paywall'
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

        <div style={{
          flex:1,
          overflowY:"auto",
          padding:isDesktop?"20px 28px 28px":"18px 18px 36px",
          display:"grid",
          gridTemplateColumns: isDesktop ? "1fr 1fr 1fr" : "1fr",
          gap: isDesktop ? 16 : 14,
        }}>
          {UPGRADE_TIER_DEFS.map(def => {
            const isCurrent = safeTier === def.key;
            const isRecommended = recommendedKey === def.key;
            const isCheckingOut = checkingOut === def.key;
            const cardStyle = {
              background: "rgba(255,255,255,0.82)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              border: isRecommended ? `1.5px solid ${T.terra}` : "1px solid rgba(255,255,255,0.45)",
              borderRadius: 16,
              boxShadow: isRecommended ? "0 8px 32px rgba(155,126,200,0.18)" : "0 4px 24px rgba(45,58,124,0.08)",
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
                  <div style={{position:"absolute",top:12,right:12,background:T.terra,color:"#fff",fontSize:10,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",padding:"3px 10px",borderRadius:99}}>Recommended</div>
                )}
                <div>
                  <div style={{fontFamily:T.serif,fontSize:22,fontWeight:700,color:T.ink,lineHeight:1.1,marginBottom:4}}>{def.name}</div>
                  <div style={{fontSize:12,color:T.ink3,lineHeight:1.5}}>{def.blurb}</div>
                </div>
                <div style={{display:"flex",alignItems:"baseline",gap:4}}>
                  <span style={{fontFamily:T.serif,fontSize:28,fontWeight:700,color:T.ink}}>{def.priceMain}</span>
                  <span style={{fontSize:12,color:T.ink3}}>{def.priceSub}</span>
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
                    // Free is never an upgrade target from a paid tier in
                    // this modal — manage-subscription handles downgrades.
                    <div style={{width:"100%",textAlign:"center",fontSize:12,color:T.ink3,padding:"11px 16px",border:`1px dashed ${T.border}`,borderRadius:99}}>Always available</div>
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
                        boxShadow: isRecommended ? "0 4px 16px rgba(155,126,200,.3)" : "none",
                        opacity: isCheckingOut ? 0.7 : 1,
                      }}
                    >{isCheckingOut ? "Opening checkout..." : `Upgrade to ${def.name}`}</button>
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


const SidebarNav = ({view,onNavigate,count,isPro,tier,isAnonymous,onAddPattern,onSignOut,onUpgrade,onOpenAuthWall,userPatterns=[],allPatterns=[]}) => {
  const starterC=DEFAULT_STARTERS.length;const addedC=userPatterns.filter(p=>!p.isStarter&&p.status!=="deleted"&&p.status!=="parked").length;
  const wipCount=allPatterns.filter(p=>!p.isStarter&&(p.status==="in_progress"||p.started)).filter(p=>pct(p)<100).length;
  // For anonymous users, surface Pro items without the padlock/"Pro feature" visual — the gate fires
  // on click. Showing the lock pre-gate suggests "sign up and you still can't have this" which kills conversion.
  const bevCheckSub = isAnonymous ? "Validate any pattern" : (isPro ? "Validate any pattern" : "Pro feature");
  const ITEMS=[{key:"collection",label:"My Wovely",sub:starterC+" starter"+(starterC!==1?"s":"")+" · "+addedC+" added",icon:"🧶"},{key:"browse",label:"Find Patterns",sub:"Find & browse patterns",icon:"🌐"},{key:"stash",label:"Stash & Notions",sub:"Manage your yarn",icon:"🎀"},{key:"calculator",label:"The Workbench",sub:"Gauge, yardage & more",icon:"🧮"},{key:"stitch-check",label:"BevCheck",sub:bevCheckSub,icon:"🛡️",proOnly:true},{key:"shopping",label:"Supply Run",sub:"Auto-generated",icon:"🛒"}];
  const planLabel = isPro ? "My plan" : "See plans";
  const planSub = isAnonymous ? "Sign up to compare plans" : (isPro ? `You're on ${tierLabel(tier)}` : "Compare Free, Pro, Craft");
  const handlePlansClick = () => { if (isAnonymous) { onOpenAuthWall(); return; } onUpgrade(); };
  return (
    <div style={{width:260,background:"#9B7EC8",height:"100vh",position:"sticky",top:0,display:"flex",flexDirection:"column",flexShrink:0}}>
      <div onClick={()=>onNavigate("collection")} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"24px 16px 20px",gap:8,cursor:"pointer",transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=".85"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
        <div style={{width:72,height:72,borderRadius:"50%",background:"rgba(255,255,255,0.95)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 16px rgba(0,0,0,0.15)",marginBottom:4}}><img src="/bev_neutral.png" alt="Bev" style={{width:58,height:58,borderRadius:"50%",objectFit:"cover"}}/></div>
        <span style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:"#fff",letterSpacing:"-0.01em",lineHeight:1}}>Wovely</span>
        <span style={{fontFamily:"Inter,sans-serif",fontSize:11,color:"rgba(255,255,255,0.55)",letterSpacing:"0.04em",lineHeight:1}}>Your crochet space</span>
      </div>
      <div style={{padding:"0 16px 8px"}}><button onClick={onAddPattern} style={{width:"100%",background:"rgba(255,255,255,.2)",color:"#fff",border:"none",borderRadius:9999,padding:"12px",fontSize:14,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.3)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.2)"}><span style={{fontSize:18}}>+</span> Add Pattern</button></div>
      <div style={{flex:1,overflowY:"auto",padding:"8px 0"}}>
        {ITEMS.map(item=>{const active=view===item.key;const locked=item.proOnly&&!isPro&&!isAnonymous;const dis=!!item.disabled;return(
          <div key={item.key} className="nav-item" onClick={()=>{if(dis)return;if(locked){onUpgrade();return;}onNavigate(item.key);}} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 20px",background:active&&!dis?"rgba(255,255,255,0.25)":"transparent",cursor:dis?"not-allowed":"pointer",transition:"background .12s",opacity:dis?.4:locked?.55:1}}>
            <span style={{fontSize:18,width:24,textAlign:"center"}}>{item.icon}</span>
            <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:"#fff"}}>{item.label}</div><div style={{fontSize:11,color:"rgba(255,255,255,0.65)",marginTop:1}}>{item.sub}</div></div>
            {dis&&<span style={{background:"rgba(255,255,255,.2)",borderRadius:99,padding:"2px 8px",fontSize:9,fontWeight:700,color:"rgba(255,255,255,.8)"}}>Soon</span>}
            {locked&&!dis&&<span style={{fontSize:12,color:"rgba(255,255,255,0.65)"}}>🔒</span>}
            {active&&!locked&&!dis&&<div style={{width:6,height:6,borderRadius:99,background:"#fff"}}/>}
          </div>
        );})}
      </div>
      <div style={{padding:"0 0 8px"}}>
        {/* Plans — always-visible entry to TieredUpgradeModal. Free + anonymous
            see "See plans" with the sparkle; paid users see "My plan" with
            their tier. Click opens the modal directly (it's not a route). */}
        <div className="nav-item" onClick={handlePlansClick} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 20px",cursor:"pointer",transition:"background .12s"}}>
          <span style={{fontSize:18,width:24,textAlign:"center"}}>✨</span>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:600,color:"#fff"}}>{planLabel}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.65)",marginTop:1}}>{planSub}</div>
          </div>
          {!isPro&&!isAnonymous&&<span style={{background:"rgba(255,255,255,0.22)",color:"#fff",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99}}>New</span>}
        </div>
        {(()=>{const active=view==="profile";return(
          <div className="nav-item" onClick={()=>onNavigate("profile")} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 20px",background:active?"rgba(255,255,255,0.25)":"transparent",cursor:"pointer",transition:"background .12s"}}>
            <span style={{fontSize:18,width:24,textAlign:"center"}}>👤</span>
            <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:"#fff"}}>Profile & Settings</div><div style={{fontSize:11,color:"rgba(255,255,255,0.65)",marginTop:1}}>{isAnonymous?"Sign in to save":"Your account"}</div></div>
            {active&&<div style={{width:6,height:6,borderRadius:99,background:"#fff"}}/>}
          </div>
        );})()}
      </div>
      <div style={{padding:"0 16px 24px"}}>
        {isPro?<div onClick={onUpgrade} style={{background:"rgba(255,255,255,.15)",borderRadius:12,padding:"12px 14px",display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}><span style={{fontSize:16}}>✨</span><div style={{flex:1}}><div style={{fontSize:12,fontWeight:700,color:"#fff"}}>Wovely {tierLabel(tier)}</div><div style={{fontSize:11,color:"rgba(255,255,255,.7)"}}>{tier==='craft'?"Every feature active":"Tap to manage or upgrade"}</div></div></div>
        :<div style={{background:"rgba(255,255,255,.15)",borderRadius:12,padding:"14px"}}><div style={{fontSize:12,fontWeight:700,color:"#fff",marginBottom:3}}>✨ Upgrade your plan</div><div style={{fontSize:11,color:"rgba(255,255,255,.75)",lineHeight:1.5,marginBottom:10}}>{isAnonymous?"Sign up free to save patterns. Pick a paid plan anytime.":"Unlimited patterns, big-pattern imports, BevCheck quality scoring."}</div>{isAnonymous?<div onClick={onOpenAuthWall} style={{background:"rgba(255,255,255,.2)",borderRadius:9999,padding:"8px",textAlign:"center",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer"}}>Get started free</div>:<div onClick={onUpgrade} style={{background:"rgba(255,255,255,.2)",borderRadius:9999,padding:"8px",textAlign:"center",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer"}}>See plans</div>}</div>}
        {isAnonymous?<button onClick={onOpenAuthWall} style={{width:"100%",background:"rgba(255,255,255,.15)",border:"none",borderRadius:9999,padding:"8px",fontSize:12,color:"#fff",cursor:"pointer",marginTop:10,fontWeight:500}}>Sign in / Create account</button>:(onSignOut&&<button onClick={onSignOut} style={{width:"100%",background:"rgba(255,255,255,.15)",border:"none",borderRadius:9999,padding:"8px",fontSize:12,color:"#fff",cursor:"pointer",marginTop:10,fontWeight:500}}>Sign out</button>)}
        <div style={{textAlign:"center",marginTop:12,fontSize:11}}>
          <span onClick={()=>onNavigate("privacy")} style={{color:"rgba(255,255,255,.5)",cursor:"pointer"}}>Privacy</span>
          <span style={{margin:"0 6px",color:"rgba(255,255,255,.3)"}}>|</span>
          <span onClick={()=>onNavigate("terms")} style={{color:"rgba(255,255,255,.5)",cursor:"pointer"}}>Terms</span>
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
  const bevCheckSub = isAnonymous ? "Validate any pattern" : (isPro ? "Validate any pattern" : "Pro feature");
  const ITEMS=[{key:"collection",label:"My Wovely",sub:count+" patterns",icon:"🧶"},{key:"browse",label:"Find Patterns",sub:"Find & browse patterns",icon:"🌐"},{key:"stash",label:"Stash & Notions",sub:"Manage your yarn",icon:"🎀"},{key:"calculator",label:"The Workbench",sub:"Gauge, yardage & more",icon:"🧮"},{key:"stitch-check",label:"BevCheck",sub:bevCheckSub,icon:"🛡️",proOnly:true},{key:"shopping",label:"Supply Run",sub:"Auto-generated needs",icon:"🛒"}];
  const planLabel = isPro ? "My plan" : "See plans";
  const planSub = isAnonymous ? "Sign up to compare plans" : (isPro ? `You're on ${tierLabel(tier)}` : "Compare Free, Pro, Craft");
  const handlePlansClick = () => { if (isAnonymous) { onOpenAuthWall?.(); dismiss(); return; } onUpgrade(); dismiss(); };
  return (
    <div style={{position:"fixed",inset:0,zIndex:100}}>
      <div className={closing?"dim-out":"dim-in"} onClick={dismiss} style={{position:"absolute",inset:0,background:"rgba(28,23,20,.52)",backdropFilter:"blur(3px)"}}/>
      <div className={closing?"nav-close":"nav-open"} style={{position:"absolute",top:0,left:0,bottom:0,width:"80%",maxWidth:320,background:"#9B7EC8",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"6px 0 40px rgba(28,23,20,.2)"}}>
        <div onClick={()=>go("collection")} style={{display:"flex",alignItems:"center",gap:10,padding:"14px 16px 10px",cursor:"pointer",transition:"opacity .15s",flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.opacity=".85"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
          <div style={{width:40,height:40,borderRadius:"50%",background:"rgba(255,255,255,0.95)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 10px rgba(0,0,0,0.15)",flexShrink:0}}><img src="/bev_neutral.png" alt="Bev" style={{width:32,height:32,borderRadius:"50%",objectFit:"cover"}}/></div>
          <div><span style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700,color:"#fff",letterSpacing:"-0.01em",lineHeight:1,display:"block"}}>Wovely</span><span style={{fontFamily:"Inter,sans-serif",fontSize:10,color:"rgba(255,255,255,0.5)",letterSpacing:"0.04em",lineHeight:1,display:"block",marginTop:2}}>Your crochet space</span></div>
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {ITEMS.map(item=>{const active=view===item.key;const locked=item.proOnly&&!isPro&&!isAnonymous;const dis=!!item.disabled;return(
            <div key={item.key} className="nav-item" onClick={()=>{if(dis)return;if(locked){onUpgrade();dismiss();return;}go(item.key);}} style={{display:"flex",alignItems:"center",gap:13,padding:"12px 20px",background:active&&!dis?"rgba(255,255,255,0.25)":"transparent",cursor:dis?"not-allowed":"pointer",transition:"background .12s",opacity:dis?.4:locked?.55:1}}>
              <span style={{fontSize:20,width:26,textAlign:"center"}}>{item.icon}</span>
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
            <span style={{fontSize:20,width:26,textAlign:"center"}}>✨</span>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:600,color:"#fff"}}>{planLabel}</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.65)",marginTop:1}}>{planSub}</div>
            </div>
            {!isPro&&!isAnonymous&&<span style={{background:"rgba(255,255,255,0.22)",color:"#fff",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99}}>New</span>}
          </div>
          {/* Profile & Settings — inline nav row */}
          {(()=>{const active=view==="profile";return(
            <div className="nav-item" onClick={()=>go("profile")} style={{display:"flex",alignItems:"center",gap:13,padding:"12px 20px",background:active?"rgba(255,255,255,0.25)":"transparent",cursor:"pointer",transition:"background .12s"}}>
              <span style={{fontSize:20,width:26,textAlign:"center"}}>👤</span>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{fontSize:14,fontWeight:600,color:"#fff"}}>Profile & Settings</div>{isPro&&<span style={{background:"rgba(155,126,200,0.6)",color:"#fff",fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:4}}>{tierLabel(tier).toUpperCase()}</span>}</div>
                {isAnonymous&&<div style={{fontSize:11,color:"rgba(255,255,255,0.65)",marginTop:1}}>Sign in to save</div>}
              </div>
              {active&&<div style={{width:6,height:6,borderRadius:99,background:"#fff"}}/>}
            </div>
          );})()}
          {/* Sign in / Sign out — inline nav row, de-emphasized */}
          {isAnonymous?<div className="nav-item" onClick={()=>{onOpenAuthWall&&onOpenAuthWall();dismiss();}} style={{display:"flex",alignItems:"center",gap:13,padding:"12px 20px",cursor:"pointer",transition:"background .12s"}}>
            <span style={{fontSize:20,width:26,textAlign:"center"}}>🔑</span>
            <div style={{fontSize:14,fontWeight:600,color:"#fff"}}>Sign in / Create account</div>
          </div>:(onSignOut&&<div className="nav-item" onClick={()=>{onSignOut();dismiss();}} style={{display:"flex",alignItems:"center",gap:13,padding:"12px 20px",cursor:"pointer",transition:"background .12s"}}>
            <span style={{fontSize:20,width:26,textAlign:"center"}}>👋</span>
            <div style={{fontSize:14,fontWeight:500,color:"rgba(255,255,255,0.7)"}}>Sign out</div>
          </div>)}
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


// PRO_FEATURES + ProInfoModal removed — both upgrade flows now route
// through TieredUpgradeModal above. Callers pass `reason='paywall'` for
// the cap-hit framing or `reason='general'` for the generic CTA.

const ProfileSettingsView = ({isPro,tier,authed,gateAction,onOpenProModal,onGoHome}) => {
  const profileNav=useNavigate();
  const [username,setUsername]=useState(""),[displayName,setDisplayName]=useState(""),[bio,setBio]=useState("");
  const [socialInstagram,setSocialInstagram]=useState(""),[socialPinterest,setSocialPinterest]=useState(""),[socialRavelry,setSocialRavelry]=useState("");
  const [profileSaving,setProfileSaving]=useState(false),[profileMsg,setProfileMsg]=useState(null),[profileLoaded,setProfileLoaded]=useState(false);
  const [saveBtnText,setSaveBtnText]=useState("Save Profile");
  const [welcomeDismissed,setWelcomeDismissed]=useState(()=>localStorage.getItem("yh_welcome_dismissed")==="true");
  const [curPass,setCurPass]=useState(""),[newPass,setNewPass]=useState(""),[passSaving,setPassSaving]=useState(false),[passMsg,setPassMsg]=useState(null);
  const{isDesktop}=useBreakpoint();
  const user = supabaseAuth.getUser();
  const session = getSession();

  const profilePct = Math.round((displayName.trim()?33:0)+(username.trim()?33:0)+(bio.trim()?34:0));

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

  const SECTION = {background:T.card,borderRadius:16,padding:isDesktop?"28px 32px":"24px 20px",boxShadow:T.shadowLg};
  const SC_LABEL = {fontSize:10,fontVariant:"small-caps",color:T.ink3,textTransform:"lowercase",letterSpacing:".14em",fontWeight:500};
  const SECTION_TITLE = {fontFamily:T.serif,fontSize:18,fontWeight:700,color:"#2D3A7C",marginBottom:20};
  const DIVIDER = <div style={{height:16}}/>;
  const Msg = ({msg}) => msg ? <div style={{background:msg.type==="ok"?"rgba(92,122,94,.1)":T.terraLt,borderRadius:12,padding:"10px 14px",fontSize:12,color:msg.type==="ok"?T.sage:T.terra,lineHeight:1.5,marginBottom:8}}>{msg.text}</div> : null;

  return (
    <div style={{padding:isDesktop?"24px 0 80px":"16px 18px 100px",maxWidth:560}}>
      <button onClick={onGoHome} style={{background:"none",border:"none",color:T.ink3,cursor:"pointer",fontSize:13,fontWeight:500,padding:0,marginBottom:16,display:"flex",alignItems:"center",gap:4}}>← My Wovely</button>

      {!welcomeDismissed&&(
        <div style={{borderRadius:16,overflow:"hidden",marginBottom:20,position:"relative",height:220}}>
          <img src="https://res.cloudinary.com/dmaupzhcx/image/upload/c_fill,w_1200,h_440,g_center/v1774116735/yarnhive_bg_v2.jpg" alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:"center"}}/>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to right, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.05) 100%)"}}/>
          <button onClick={()=>{setWelcomeDismissed(true);localStorage.setItem("yh_welcome_dismissed","true");}} style={{position:"absolute",top:12,right:16,background:"transparent",border:"none",color:"#fff",fontSize:20,cursor:"pointer",lineHeight:1,zIndex:2}}>×</button>
          <div style={{position:"relative",zIndex:1,height:"100%",display:"flex",flexDirection:"column",justifyContent:"center",paddingLeft:32}}>
            <div style={{fontFamily:T.serif,fontSize:32,fontWeight:700,color:"#fff",marginBottom:8,lineHeight:1.2}}>Welcome to Wovely. 🧶</div>
            <div style={{fontSize:15,color:"rgba(255,255,255,0.88)",marginBottom:20}}>Your collection is ready. Time to make something.</div>
            <div><button onClick={()=>{setWelcomeDismissed(true);localStorage.setItem("yh_welcome_dismissed","true");onGoHome();}} style={{background:"#9B7EC8",color:"#fff",border:"none",borderRadius:10,padding:"12px 24px",fontSize:15,fontWeight:600,cursor:"pointer"}}>Go to My Wovely →</button></div>
          </div>
        </div>
      )}

      {/* Profile completion bar */}
      <div style={{marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{fontSize:11,color:T.ink3,fontWeight:500}}>Profile completion</div>
          <div style={{fontSize:11,color:profilePct===100?T.sage:T.terra,fontWeight:600}}>{profilePct}%</div>
        </div>
        <div style={{height:4,background:T.linen,borderRadius:99,overflow:"hidden"}}>
          <div style={{height:"100%",width:profilePct+"%",background:profilePct===100?T.sage:T.terra,borderRadius:99,transition:"width .3s ease"}}/>
        </div>
      </div>

      <div style={SECTION}>
        <div style={SECTION_TITLE}>Your Profile</div>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{width:100,height:100,borderRadius:"50%",background:T.linen,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:34,fontWeight:700,color:T.terra,border:`3px solid ${T.terra}`,boxShadow:"0 0 0 6px rgba(155,126,200,.1)"}}>{(displayName||"Y").charAt(0).toUpperCase()}{(username||"H").charAt(0).toUpperCase()}</div>
          <div style={{fontSize:16,fontWeight:600,color:T.ink,marginTop:12}}>{displayName||"Your Name"}</div>
          <div style={{fontSize:13,color:T.ink3,marginTop:2}}>{username?"@"+username:"Set your username"}</div>
        </div>
        <Field label="Display name" placeholder="e.g. Sarah" value={displayName} onChange={e=>setDisplayName(e.target.value)}/>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,fontVariant:"small-caps",color:T.ink3,textTransform:"lowercase",letterSpacing:".14em",marginBottom:6,fontWeight:500}}>username</div>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:0,top:"50%",transform:"translateY(-50%)",color:T.ink3,fontSize:15,pointerEvents:"none"}}>@</span>
            <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="yourhandle" style={{width:"100%",padding:"13px 16px 13px 18px",background:"transparent",border:"none",borderBottom:`1.5px solid ${T.border}`,borderRadius:0,color:T.ink,fontSize:15,outline:"none",transition:"border-color .2s"}} onFocus={e=>e.target.style.borderBottomColor=T.terra} onBlur={e=>e.target.style.borderBottomColor=T.border}/>
          </div>
        </div>
        <Field label="Bio" placeholder="Tell us about your craft..." value={bio} onChange={e=>setBio(e.target.value)} rows={3}/>
        <div style={{borderTop:`1px solid ${T.border}`,paddingTop:20,marginTop:12}}>
          <div style={{fontSize:10,fontVariant:"small-caps",color:T.ink3,textTransform:"lowercase",letterSpacing:".14em",fontWeight:500,marginBottom:14}}>social connections</div>
          <Field label="Instagram handle" placeholder="@yourhandle" value={socialInstagram} onChange={e=>setSocialInstagram(e.target.value)}/>
          <Field label="Pinterest handle" placeholder="@yourhandle" value={socialPinterest} onChange={e=>setSocialPinterest(e.target.value)}/>
          <Field label="Ravelry username" placeholder="yourhandle" value={socialRavelry} onChange={e=>setSocialRavelry(e.target.value)}/>
        </div>
        <Msg msg={profileMsg}/>
        <button onClick={()=>gateAction?.({ intent: "profile_edit", title: "Create a free account to save your profile", subtitle: "Your name, handle, and socials stay with you across devices." }, handleProfileSave)} disabled={profileSaving} style={{background:T.terra,color:"#fff",border:"none",borderRadius:99,padding:"12px 28px",fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(155,126,200,.3)",opacity:profileSaving?.6:1}}>{profileSaving?"Saving…":saveBtnText}</button>
      </div>

      {DIVIDER}

      <div style={SECTION}>
        <div style={SECTION_TITLE}>Account</div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,fontVariant:"small-caps",color:T.ink3,textTransform:"lowercase",letterSpacing:".14em",marginBottom:6,fontWeight:500}}>email</div>
          <div style={{padding:"13px 0",borderBottom:`1.5px solid ${T.border}`,color:T.ink2,fontSize:15}}>{user?.email||"—"}</div>
        </div>
        <div style={{borderTop:`1px solid ${T.border}`,paddingTop:20}}>
          <div style={{fontSize:10,fontVariant:"small-caps",color:T.ink3,textTransform:"lowercase",letterSpacing:".14em",fontWeight:500,marginBottom:14}}>change password</div>
          <Field label="Current password" placeholder="••••••••" value={curPass} onChange={e=>setCurPass(e.target.value)} type="password"/>
          <Field label="New password" placeholder="••••••••" value={newPass} onChange={e=>setNewPass(e.target.value)} type="password"/>
          <Msg msg={passMsg}/>
          <button onClick={()=>gateAction?.({ intent: "change_password", title: "Create a free account first", subtitle: "Sign up to set a password." }, handleChangePassword)} disabled={passSaving} style={{background:T.terra,color:"#fff",border:"none",borderRadius:99,padding:"10px 24px",fontSize:13,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(155,126,200,.3)",opacity:passSaving?.6:1}}>{passSaving?"Saving…":"Update Password"}</button>
        </div>
      </div>

      {DIVIDER}

      {isPro
        ? <div style={{...SECTION,background:`linear-gradient(135deg,#2D3A7C,${tier==='craft'?T.terra:'#1A2456'})`,border:"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:18}}>✨</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:700,color:"#fff"}}>Wovely {tierLabel(tier)}</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,.7)",marginTop:2}}>{tier==='craft'?"Every feature active, including Collections":"Unlimited patterns, big imports, BevCheck"}</div>
              </div>
              {tier==='pro' && <div onClick={onOpenProModal} style={{background:"rgba(255,255,255,.2)",borderRadius:10,padding:"6px 12px",fontSize:11,fontWeight:700,color:"#fff",cursor:"pointer",flexShrink:0}}>Upgrade to Craft</div>}
            </div>
          </div>
        : <div style={{...SECTION,background:`linear-gradient(135deg,#2D3A7C,${T.terra})`,border:"none"}}>
            <div style={{fontSize:14,fontWeight:700,color:"#fff",marginBottom:4}}>✨ Upgrade your plan</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.75)",lineHeight:1.5,marginBottom:12}}>Pro members get unlimited patterns, big-pattern support, and BevCheck. Craft members add Collections on top.</div>
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
            <div style={{fontSize:14,color:T.ink}}>{isPro ? `Wovely ${tierLabel(tier)}` : 'Free plan'}</div>
            <div style={{...SC_LABEL,marginTop:4}}>{isPro ? 'Tap to manage or compare plans' : 'See what Pro and Craft include'}</div>
          </div>
          <div style={{fontSize:13,fontWeight:600,color:T.terra,whiteSpace:"nowrap"}}>{isPro ? 'Manage plan ›' : 'See plans ›'}</div>
        </div>
      </div>

      <div style={SECTION}>
        <div style={SECTION_TITLE}>Preferences</div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div><div style={{fontSize:14,color:T.ink2}}>Dark mode</div><div style={{...SC_LABEL,marginTop:4}}>coming soon</div></div>
          <div style={{width:44,height:26,borderRadius:13,background:T.linen,opacity:.5,position:"relative",cursor:"not-allowed"}}><div style={{width:22,height:22,borderRadius:11,background:"#fff",position:"absolute",top:2,left:2,boxShadow:"0 1px 3px rgba(0,0,0,.15)"}}/></div>
        </div>
      </div>

      <div style={{textAlign:"center",padding:"20px 0 8px",fontSize:12,color:"#6B6B8A"}}>
        <span onClick={()=>profileNav("/privacy")} style={{color:"#6B6B8A",cursor:"pointer"}} onMouseEnter={e=>e.target.style.color="#9B7EC8"} onMouseLeave={e=>e.target.style.color="#6B6B8A"}>Privacy Policy</span>
        <span style={{margin:"0 8px",opacity:.5}}>|</span>
        <span onClick={()=>profileNav("/terms")} style={{color:"#6B6B8A",cursor:"pointer"}} onMouseEnter={e=>e.target.style.color="#9B7EC8"} onMouseLeave={e=>e.target.style.color="#6B6B8A"}>Terms of Service</span>
      </div>
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
      <div style={{background:"rgba(255,255,255,0.82)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderRadius:20,border:"1px solid rgba(255,255,255,0.6)",padding:isDesktop?"32px":"24px 20px",marginBottom:32,boxShadow:"0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(155,126,200,0.13)",maxWidth:700}}>
        <div style={{fontFamily:"'Playfair Display',Georgia,serif",fontSize:20,fontWeight:700,color:"#2D2D4E",marginBottom:8,borderLeft:"3px solid #9B7EC8",paddingLeft:10}}>Import a Pattern</div>
        <div style={{fontSize:14,color:"#6B6B8A",lineHeight:1.7,marginBottom:20}}>Find a pattern on any crochet site, copy the URL from your browser, and paste it below to import it directly into Wovely.</div>
        <div style={{display:"flex",gap:10,flexDirection:isMobile?"column":"row"}}>
          <div style={{flex:1,display:"flex",alignItems:"center",background:T.linen,border:`1.5px solid ${T.border}`,borderRadius:12,padding:"12px 16px",gap:10}}>
            <span style={{color:T.ink3,flexShrink:0}}>🔗</span>
            <input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doImport()} placeholder="https://allfreecrochet.com/..." style={{border:"none",background:"transparent",flex:1,fontSize:14,color:T.ink,outline:"none",minWidth:0}}/>
          </div>
          <button onClick={doImport} disabled={!url.trim()} style={{background:"#9B7EC8",color:"#fff",border:"none",borderRadius:12,padding:"12px 24px",fontSize:14,fontWeight:600,cursor:!url.trim()?"not-allowed":"pointer",opacity:!url.trim()?.6:1,whiteSpace:"nowrap",flexShrink:0}}>Import Pattern →</button>
        </div>
        <div style={{background:"#FFF8E7",border:"1px solid #F0C040",borderRadius:8,padding:"8px 12px",marginTop:12,fontSize:12,color:"#856404",lineHeight:1.5,fontFamily:"Inter,sans-serif"}}>⚠️ Patterns behind a paywall or login wall can't be imported by URL. Download the PDF and use our PDF import instead.</div>
      </div>

      {/* Section 2 — Partner Sites Grid */}
      <div style={{marginBottom:32}}>
        <div style={{fontFamily:"'Playfair Display',Georgia,serif",fontSize:18,fontWeight:700,color:"#2D2D4E",marginBottom:6,borderLeft:"3px solid #9B7EC8",paddingLeft:10}}>Browse Partner Sites</div>
        <div style={{fontSize:14,color:"#6B6B8A",lineHeight:1.7,marginBottom:20}}>Open any site below to browse their patterns. When you find one you love, copy the URL and paste it above.</div>
        <div style={{display:"grid",gridTemplateColumns:isDesktop?"repeat(3,1fr)":isTablet?"repeat(2,1fr)":"1fr",gap:16}}>
          {SITES.map(s=>(
            <div key={s.name} style={{background:"rgba(255,255,255,0.82)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderRadius:20,border:"1px solid rgba(255,255,255,0.6)",boxShadow:"0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(155,126,200,0.13)",overflow:"hidden",transition:"transform .15s,box-shadow .15s"}} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 32px rgba(155,126,200,0.2)";}} onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(155,126,200,0.13)";}}>
              <div style={{background:"linear-gradient(135deg, #EDE4F7 0%, #F8F6FF 100%)",height:72,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
                <div style={{fontFamily:T.serif,fontSize:17,fontWeight:600,color:"#2D2D4E"}}>{s.name}</div>
                <div style={{position:"absolute",top:10,right:10}}><div style={{background:s.free?"#5C9E7A":"#2D3A7C",borderRadius:9999,padding:"2px 8px",fontSize:9,fontWeight:700,color:"#fff"}}>{s.free?"FREE":"FREE + PAID"}</div></div>
              </div>
              <div style={{padding:"14px 18px 18px"}}>
                <div style={{fontSize:13,color:"#6B6B8A",lineHeight:1.5,marginBottom:10}}>{s.desc}</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:14}}>{s.tags.map(t=><div key={t} style={{background:"#EDE4F7",borderRadius:9999,padding:"2px 8px",fontSize:10,fontWeight:600,color:"#9B7EC8"}}>{t}</div>)}</div>
                <a href={s.url} target="_blank" rel="noopener noreferrer" style={{display:"block",width:"100%",background:"#9B7EC8",color:"#fff",border:"none",borderRadius:9999,padding:"10px",fontSize:13,fontWeight:600,cursor:"pointer",textAlign:"center",textDecoration:"none",boxSizing:"border-box"}}>Visit {s.name} →</a>
                <div style={{fontSize:11,color:"#9B9B9B",textAlign:"center",marginTop:6}}>Opens in new tab</div>
              </div>
            </div>
          ))}
          <div style={{background:"#F8F6FF",borderRadius:16,border:"1.5px dashed #EDE4F7",display:"flex",alignItems:"center",justifyContent:"center",minHeight:200}}>
            <div style={{textAlign:"center",padding:20}}><div style={{fontSize:24,marginBottom:8,opacity:.4}}>🌐</div><div style={{fontSize:13,color:"#9B9B9B",fontWeight:500}}>More sites coming soon</div></div>
          </div>
        </div>
      </div>

      {/* Section 3 — Coming Soon Banner */}
      <div style={{background:"#EDE4F7",borderRadius:16,padding:isDesktop?"28px 32px":"24px 20px",display:"flex",flexDirection:isMobile?"column":"row",alignItems:isMobile?"flex-start":"center",gap:isMobile?20:32}}>
        <div style={{flex:1}}>
          <div style={{marginBottom:10}}><img src="/bev_neutral.png" alt="Bev" style={{width:48,height:48,objectFit:"contain"}} onError={e=>{e.target.style.display="none";e.target.parentElement.innerHTML="🐍";}}/></div>
          <div style={{fontFamily:"'Playfair Display',Georgia,serif",fontSize:18,fontWeight:700,color:"#2D2D4E",marginBottom:8}}>Seamless browsing is coming.</div>
          <div style={{fontSize:14,color:"#6B6B8A",lineHeight:1.7}}>The Wovely app will let you browse any crochet site and save patterns with a single tap — no copying, no pasting.</div>
        </div>
        <div style={{display:"flex",gap:12,flexDirection:isMobile?"column":"row",alignItems:"center",flexShrink:0}}>
          <div style={{background:"#1C1C1E",borderRadius:12,padding:"12px 20px",display:"flex",alignItems:"center",gap:10,opacity:.7,cursor:"default",minWidth:120}}>
            <svg width="20" height="24" viewBox="0 0 384 512" fill="#fff"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>
            <div><div style={{fontSize:13,fontWeight:600,color:"#fff",fontFamily:"Inter,sans-serif",lineHeight:1.2}}>App Store</div><div style={{fontSize:10,color:"rgba(255,255,255,.6)",fontFamily:"Inter,sans-serif"}}>Coming Soon</div></div>
          </div>
          <div style={{background:"#1C1C1E",borderRadius:12,padding:"12px 20px",display:"flex",alignItems:"center",gap:10,opacity:.7,cursor:"default",minWidth:120}}>
            <svg width="18" height="20" viewBox="0 0 512 512" fill="#fff"><path d="M93.6 28.3l187.2 107.5L93.6 483.7c-5.1-4.4-8.2-10.8-8.2-18V46.3c0-7.2 3.1-13.6 8.2-18zm22.7-17L330 135.8 282.4 256 116.3 11.3zm0 473.4L282.4 256l47.6 120.2-213.7 124.5zM345.6 256l80.8-46.4c14.3-8.2 14.3-28.9 0-37.2L345.6 126l-52.8 130 52.8 130z"/></svg>
            <div><div style={{fontSize:13,fontWeight:600,color:"#fff",fontFamily:"Inter,sans-serif",lineHeight:1.2}}>Google Play</div><div style={{fontSize:10,color:"rgba(255,255,255,.6)",fontFamily:"Inter,sans-serif"}}>Coming Soon</div></div>
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
  const CARD = {background:"rgba(255,255,255,0.82)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderRadius:20,border:"1px solid rgba(255,255,255,0.6)",padding:24,boxShadow:"0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(155,126,200,0.13)"};

  if(stash.length===0&&!adding) return (
    <div style={{padding:isD?"24px 24px 100px":"0 18px 100px",maxWidth:960,margin:"0 auto"}}>
      <div style={{...CARD,textAlign:"center",padding:"60px 32px"}}>
        <div style={{fontSize:48,marginBottom:16}}>🧶</div>
        <div style={{fontFamily:T.serif,fontSize:22,fontWeight:700,color:T.ink,marginBottom:8}}>Your stash lives here</div>
        <div style={{fontSize:14,color:T.ink3,lineHeight:1.6,marginBottom:24,maxWidth:320,margin:"0 auto 24px"}}>Add your first yarn to get started — track every skein so you always know what you have before you buy.</div>
        <button onClick={gateOpenAdd} style={{background:T.terra,color:"#fff",border:"none",borderRadius:99,padding:"14px 32px",fontSize:15,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(155,126,200,.3)"}}>+ Add Your First Yarn</button>
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
      <button onClick={()=>{ if(adding){setAdding(false);return;} gateOpenAdd(); }} style={{width:"100%",background:adding?"transparent":T.terra,color:adding?T.ink3:"#fff",border:adding?`1.5px solid ${T.border}`:"none",borderRadius:99,padding:"14px",fontSize:15,fontWeight:600,cursor:"pointer",boxShadow:adding?"none":"0 4px 16px rgba(155,126,200,.3)",marginBottom:20}}>{adding?"Cancel":"+ Add Yarn to Stash"}</button>
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
          <button onClick={gateAddYarn} disabled={!brand||!name} style={{width:"100%",background:T.terra,color:"#fff",border:"none",borderRadius:99,padding:"14px",fontSize:15,fontWeight:600,cursor:(!brand||!name)?"not-allowed":"pointer",opacity:(!brand||!name)?.5:1,boxShadow:"0 4px 16px rgba(155,126,200,.3)"}}>Add to Stash</button>
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
  const CARD = {background:"rgba(255,255,255,0.82)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderRadius:20,border:"1px solid rgba(255,255,255,0.6)",padding:24,boxShadow:"0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(155,126,200,0.13)"};

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
          <button onClick={gateAddItem} style={{background:T.terra,color:"#fff",border:"none",borderRadius:99,padding:"12px 24px",fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(155,126,200,.3)"}}>Add</button>
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
        <button onClick={gateAddItem} style={{background:T.terra,color:"#fff",border:"none",borderRadius:99,padding:"12px 24px",fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(155,126,200,.3)"}}>Add</button>
      </div>
    </div>
  );
};


const STARTER_PHOTO_MAP = {Blankets:PHOTOS.blanket,Amigurumi:PHOTOS.granny,Wearables:PHOTOS.cardigan,Accessories:PHOTOS.tote,Home:PHOTOS.pillow};

const LegalFooter = () => {
  const legalNav=useNavigate();
  return (
    <div style={{textAlign:"center",padding:"24px 16px 32px",fontSize:12,color:"#6B6B8A"}}>
      <span onClick={()=>legalNav("/privacy")} style={{color:"#6B6B8A",cursor:"pointer"}} onMouseEnter={e=>e.target.style.color="#9B7EC8"} onMouseLeave={e=>e.target.style.color="#6B6B8A"}>Privacy Policy</span>
      <span style={{margin:"0 8px",opacity:.5}}>|</span>
      <span onClick={()=>legalNav("/terms")} style={{color:"#6B6B8A",cursor:"pointer"}} onMouseEnter={e=>e.target.style.color="#9B7EC8"} onMouseLeave={e=>e.target.style.color="#6B6B8A"}>Terms of Service</span>
    </div>
  );
};

const WelcomeToast = ({visible}) => (
  <div style={{position:"fixed",top:16,right:16,zIndex:900,background:T.terra,color:"#fff",borderRadius:14,padding:"12px 24px",fontSize:14,fontWeight:600,boxShadow:"0 8px 32px rgba(155,126,200,.4)",display:"flex",alignItems:"center",gap:8,opacity:visible?1:0,transform:visible?"translateX(0)":"translateX(20px)",transition:"opacity .4s ease, transform .4s ease",pointerEvents:"none"}}>
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
      <div style={{position:"relative",zIndex:1,width:"100%",maxWidth:480,maxHeight:"80vh",display:"flex",flexDirection:"column",background:"rgba(250,247,243,0.96)",borderRadius:28,boxShadow:"0 20px 60px rgba(155,126,200,.15), 0 0 0 1px rgba(255,255,255,0.45) inset",border:"1px solid rgba(255,255,255,0.38)"}}>
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
          {error&&<div style={{background:T.terraLt,border:"1px solid rgba(155,126,200,.2)",borderRadius:10,padding:"10px 14px",fontSize:12,color:T.terra,lineHeight:1.5,marginBottom:8}}>{error}</div>}
          <button onClick={handleSave} disabled={saving} style={{width:"100%",background:T.terra,color:"#fff",border:"none",borderRadius:14,padding:"15px",fontSize:15,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(155,126,200,.3)",marginTop:4,opacity:saving?.6:1}}>{saving?"Setting up…":"Set up my profile"}</button>
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
        <div style={{background:"linear-gradient(135deg, #2D2235 0%, #1C1724 100%)",borderRadius:20,padding:isDesktop?"32px 36px":"24px 22px",marginBottom:40,border:"1px solid rgba(139,107,174,.25)",boxShadow:"0 8px 32px rgba(44,34,53,.25)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
            <div style={{background:"rgba(139,107,174,.2)",borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:700,color:"#C4AAE0",letterSpacing:".06em",textTransform:"uppercase"}}>Coming Soon</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.35)"}}>On the roadmap</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isDesktop?"1fr 1fr":"1fr",gap:10}}>
            {COMING_SOON.map((item,i) => (
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",background:"rgba(255,255,255,.04)",borderRadius:12,border:"1px solid rgba(255,255,255,.06)"}}>
                <span style={{color:"#8B6BAE",fontSize:14,marginTop:1,flexShrink:0}}>◇</span>
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
              <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:18,overflow:"hidden",boxShadow:entry.major?"0 4px 24px rgba(155,126,200,.1)":T.shadow}}>
                <div style={{padding:isDesktop?"22px 28px 18px":"18px 20px 14px",borderBottom:`1px solid ${T.border}`,background:entry.major?"linear-gradient(135deg, #FAF0EC 0%, "+T.card+" 100%)":T.card}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                    <span style={{fontFamily:"'Inter', monospace",fontSize:isDesktop?22:18,fontWeight:700,color:T.ink,letterSpacing:"-0.02em"}}>{entry.version}</span>
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
    <div style={{minHeight:"100vh",background:"#FFFFFF",fontFamily:'"Inter",-apple-system,sans-serif'}}>
      <style>{`
        .md-doc h1,.md-doc h2,.md-doc h3{font-family:"Playfair Display",Georgia,serif;color:#2D2D4E;margin:1.5em 0 .5em;}
        .md-doc h1{font-size:32px;border-bottom:2px solid #EDE4F7;padding-bottom:12px;}
        .md-doc h2{font-size:24px;color:#9B7EC8;}
        .md-doc h3{font-size:18px;}
        .md-doc p{line-height:1.8;color:#6B6B8A;margin:.8em 0;}
        .md-doc ul,.md-doc ol{padding-left:24px;color:#6B6B8A;line-height:1.8;}
        .md-doc table{width:100%;border-collapse:collapse;margin:1em 0;}
        .md-doc th,.md-doc td{border:1px solid #EDE4F7;padding:10px 14px;text-align:left;font-size:14px;}
        .md-doc th{background:#F8F6FF;font-weight:600;color:#2D2D4E;}
        .md-doc code{background:#F8F6FF;padding:2px 6px;border-radius:4px;font-size:13px;font-family:monospace;}
        .md-doc pre{background:#F8F6FF;padding:16px;border-radius:10px;overflow-x:auto;margin:1em 0;}
        .md-doc pre code{background:none;padding:0;}
        .md-doc a{color:#9B7EC8;text-decoration:underline;}
        .md-doc blockquote{border-left:4px solid #9B7EC8;margin:1em 0;padding:8px 16px;background:#EDE4F7;border-radius:0 8px 8px 0;}
      `}</style>
      <CSS/>
      <div style={{maxWidth:900,margin:"0 auto",padding:"40px 24px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div>
            <div style={{fontFamily:'"Playfair Display",Georgia,serif',fontSize:28,fontWeight:700,color:"#2D2D4E"}}>Wovely Admin</div>
            <div style={{fontSize:13,color:"#6B6B8A",marginTop:4}}>{doc?`Version ${doc.version} · Updated ${new Date(doc.updated_at).toLocaleDateString()}`:""}</div>
          </div>
          <button onClick={()=>{sessionStorage.removeItem("yh_master_pw");setDoc(null);setAuthed(false);setPw("");}} style={{background:"#F8F6FF",border:"1px solid #EDE4F7",borderRadius:8,padding:"8px 16px",fontSize:13,color:"#5C4F44",cursor:"pointer"}}>Lock</button>
        </div>
        <TabBar/>
        {activeTab==="master-doc" && doc && (
          <>
            {doc.change_summary&&<div style={{background:"#EDE4F7",borderRadius:10,padding:"12px 16px",marginBottom:24,fontSize:13,color:"#9B7EC8",lineHeight:1.6}}>Latest changes: {doc.change_summary}</div>}
            <div className="md-doc" dangerouslySetInnerHTML={{__html:renderMarkdown(doc.content)}}/>
          </>
        )}
        {activeTab==="changelog" && <ChangelogTab/>}
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#FFFFFF",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:'"Inter",-apple-system,sans-serif'}}>
      <div style={{width:"100%",maxWidth:380,padding:"40px 32px",background:"#FFFFFF",borderRadius:20,border:"1px solid #EDE4F7",boxShadow:"0 8px 32px rgba(155,126,200,.08)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:40,marginBottom:12}}>🧶</div>
          <div style={{fontFamily:'"Playfair Display",Georgia,serif',fontSize:22,fontWeight:700,color:"#2D2D4E"}}>Wovely Admin</div>
          <div style={{fontSize:13,color:"#6B6B8A",marginTop:6}}>Enter password to view</div>
        </div>
        <input value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&fetchDoc(pw)} type="password" placeholder="Password" style={{width:"100%",padding:"13px 16px",background:"#F8F6FF",border:"1.5px solid #EDE4F7",borderRadius:12,color:"#2D2D4E",fontSize:15,marginBottom:12,outline:"none"}}/>
        {error&&<div style={{fontSize:12,color:"#9B7EC8",marginBottom:10}}>{error}</div>}
        <button onClick={()=>fetchDoc(pw)} disabled={loading||!pw} style={{width:"100%",background:"#9B7EC8",color:"#fff",border:"none",borderRadius:12,padding:"14px",fontSize:15,fontWeight:600,cursor:"pointer",opacity:loading?.6:1}}>{loading?"Loading…":"Unlock"}</button>
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
  "Coming Soon": "#8B6BAE",
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
        <div style={{background:"linear-gradient(135deg, #2D2235 0%, #1C1724 100%)",borderRadius:20,padding:isDesktop?"32px 36px":"24px 22px",marginBottom:40,border:"1px solid rgba(139,107,174,.25)",boxShadow:"0 8px 32px rgba(44,34,53,.25)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
            <div style={{background:"rgba(139,107,174,.2)",borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:700,color:"#C4AAE0",letterSpacing:".06em",textTransform:"uppercase"}}>Coming Soon</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.35)"}}>On the roadmap</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isDesktop?"1fr 1fr":"1fr",gap:10}}>
            {COMING_SOON.map((item,i) => (
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",background:"rgba(255,255,255,.04)",borderRadius:12,border:"1px solid rgba(255,255,255,.06)"}}>
                <span style={{color:"#8B6BAE",fontSize:14,marginTop:1,flexShrink:0}}>◇</span>
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
              <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:18,overflow:"hidden",boxShadow:entry.major?"0 4px 24px rgba(155,126,200,.1)":T.shadow}}>
                {/* Version header */}
                <div style={{padding:isDesktop?"22px 28px 18px":"18px 20px 14px",borderBottom:`1px solid ${T.border}`,background:entry.major?"linear-gradient(135deg, #FAF0EC 0%, "+T.card+" 100%)":T.card}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                    <span style={{fontFamily:"'Inter', monospace",fontSize:isDesktop?22:18,fontWeight:700,color:T.ink,letterSpacing:"-0.02em"}}>{entry.version}</span>
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
            <button onClick={()=>navigate("/")} style={{background:T.terra,color:"#fff",border:"none",borderRadius:12,padding:"12px 28px",fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(155,126,200,.3)"}}>Open Wovely</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function Wovely() {
  const navigate = useNavigate();
  const location = useLocation();
  // Instant session restore: if a local session exists, assume authed immediately
  // to avoid login screen flicker. The async validate() will correct if expired.
  const _hasLocalSession = !!getSession()?.access_token && !!supabaseAuth.getUser();
  // Tier is the source of truth. isPro is derived for legacy call sites
  // (true for pro+craft). Initial state reads the cached tier (falls back
  // to legacy yh_is_pro flag for sessions that pre-date migration 008).
  const [authed,setAuthed]=useState(_hasLocalSession);
  const [tier,setTierState]=useState(()=>_hasLocalSession?readCachedTier():TIER_FREE);
  const isPro=isPaidTier(tier);
  const setTier=(t)=>{const n=normalizeTier(t);setTierState(n);writeCachedTier(n);};
  // Back-compat shim — call sites that still call setIsPro(boolean) get
  // mapped to a tier change. Used by the sign-out + onboarding-back paths.
  const setIsPro=(p)=>setTier(p?TIER_CRAFT:TIER_FREE);
  const [authChecked,setAuthChecked]=useState(false);
  const [userPatterns,setUserPatterns]=useState([]);
  const [patternsFetched,setPatternsFetched]=useState(false);
  const [starterPatterns,setStarterPatterns]=useState(()=>makeStarterPatterns());
  // Derive view from URL path instead of state
  const view = viewFromPath(location.pathname);
  const [selected,setSelected]=useState(null),[navOpen,setNavOpen]=useState(false),[addOpen,setAddOpen]=useState(false),[imageImportOpen,setImageImportOpen]=useState(false),[addMenuOpen,setAddMenuOpen]=useState(false),[menuAnchor,setMenuAnchor]=useState(null),[showPaywall,setShowPaywall]=useState(false),[cat,setCat]=useState("All"),[search,setSearch]=useState("");
  const [showWelcomeBanner,setShowWelcomeBanner]=useState(false);
  const [showWelcomeToast,setShowWelcomeToast]=useState(false);
  const [showProModal,setShowProModal]=useState(false);
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
  const [coverPickerTarget,setCoverPickerTarget]=useState(null);
  const [pendingImportUrl,setPendingImportUrl]=useState(null);
  // Handoff from ImportPill (queue completed) → review modal. { fileType, extractedData } or null.
  const [pendingExtractedHandoff,setPendingExtractedHandoff]=useState(null);
  // Anonymous mode: set when user clicks "Try it free" on landing. Persists in sessionStorage so
  // refresh/nav within the tab keeps them in the app shell instead of bouncing to the landing.
  const [anonymousMode,setAnonymousMode]=useState(()=>{try{return sessionStorage.getItem("wovely_anonymous_mode")==="1";}catch{return false;}});
  const enterAnonymousMode=useCallback(()=>{try{sessionStorage.setItem("wovely_anonymous_mode","1");}catch{}setAnonymousMode(true);try{posthog.capture("anonymous_mode_entered");}catch{}},[]);
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

  // Shared handler for AuthWallModal success. Flips auth state, clears anon mode, identifies the
  // user in PostHog, prefetches tier so Pro/Craft-gated resumes don't flash, THEN invokes the
  // context's onSuccess (which runs the gate's setTimeout → proceedCallback). Must be async so the
  // tier prefetch completes before the resumed action reads it from state.
  const handleAuthWallSuccess = async (user) => {
    setAuthed(true);
    document.cookie = "wovely_authed=1;path=/;max-age=31536000";
    try { sessionStorage.removeItem("wovely_anonymous_mode"); } catch {}
    setAnonymousMode(false);
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
  };

  // Initialize client-side error reporting once on mount
  useEffect(() => {
    initErrorReporter();
  }, []);

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
                const pr = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${uid}&select=has_completed_onboarding,tier,is_pro`, {
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
      setUpgradeToast("success");
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

  const handleSignOut = async () => { posthog.reset(); await supabaseAuth.signOut(); setAuthed(false); setTier(TIER_FREE); setUserPatterns([]); clearCachedTier(); try { sessionStorage.removeItem("wovely_redirect_intent"); sessionStorage.removeItem("wovely_anonymous_mode"); } catch {} setAnonymousMode(false); document.cookie="wovely_authed=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/"; navigate("/"); };

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
          const pr = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${uid}&select=tier,is_pro,has_completed_onboarding`, {
            headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${s.access_token}`},
          });
          if (pr.ok) {
            const rows = await pr.json();
            if (rows[0]) {
              setTier(rows[0].tier || tierFromLegacyIsPro(rows[0].is_pro === true));
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

  // Secret founders dashboard — no auth required
  if(location.pathname==="/founders") return <Founders/>;
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
      return <><CSS/><Auth onEnter={handleSignIn} onEnterAsNew={handleNewSignup} onTryAnonymous={enterAnonymousMode}/><LegalFooter/></>;
    }
  }
  // Unknown routes redirect to /
  const knownPaths=["/","/hive","/builds","/browse","/stash","/tools","/stitch-check","/shopping","/profile","/hive-vision","/master-doc","/privacy","/terms"];
  if(!knownPaths.some(p=>location.pathname===p||location.pathname.startsWith("/pattern/")||location.pathname.startsWith("/hive/"))) return <Navigate to="/" replace/>;
  const detailOnSave=u=>{
    const withTimestamp={...u,updated_at:new Date().toISOString()};
    setUserPatterns(prev=>prev.map(p=>p.id===u.id?withTimestamp:p));setStarterPatterns(prev=>prev.map(p=>p.id===u.id?withTimestamp:p));setSelected(withTimestamp);
    const user=supabaseAuth.getUser();const session=getSession();
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
  const handleAddPattern=async(p)=>{
    // Saving a pattern means we're done with the import_job that produced it —
    // clear sessionStorage so ImportPill doesn't re-render the same job after
    // the modal closes and walk the user through a duplicate import.
    setActiveImportJob(null);
    posthog.capture("pattern_uploaded",{file_type:p.source_file_type||"unknown"});
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
    // "Review Issue →" flow: skip overlay, go directly to detail with scrollToRow
    if(p._reviewRowNumber!==undefined){
      setPendingScrollToRow(p._reviewRowNumber);
      setAddOpen(false);
      setTimeout(()=>{startAndOpenPattern(localPattern);},100);
    } else {
      setCreatedPattern(localPattern);
    }
    // Persist to Supabase
    if(user&&session){
      try{
        const res=await fetch(`${SUPABASE_URL}/rest/v1/patterns`,{
          method:"POST",
          headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${session.access_token}`,"Content-Type":"application/json","Prefer":"return=representation"},
          body:JSON.stringify({user_id:user.id,title:dedupTitle,cat:p.cat||"",source:p.source||"",source_url:p.source_url||"",notes:p.notes||"",pattern_notes:p.pattern_notes||null,difficulty:p.difficulty||"",yarn_weight:p.weight||"",hook_size:p.hook||"",gauge:p.gauge||{},tags:p.tags||[],is_ai_generated:!!p.is_ai_generated,is_starter:!!p.isStarter,image_url:p.image_url||"",photo:p.photo||"",cover_image_url:p.cover_image_url||null,row_count:(p.rows||[]).length,materials:p.materials||[],rows:p.rows||[],rating:p.rating||0,yardage:p.yardage||0,skeins:p.skeins||0,skein_yards:p.skeinYards||200,dimensions:p.dimensions||{},weight:p.weight||"",hook:p.hook||"",source_file_url:p.source_file_url||null,source_file_name:p.source_file_name||null,source_file_type:p.source_file_type||null,extracted_by_ai:!!p.extracted_by_ai,components:p.components||null,validation_flags:p.validation_flags||null,validation_report:p.validation_report||null}),
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
          }
        }else{const errText=await res.text();console.error("[Wovely] Pattern save failed:",res.status,errText);}
      }catch(e){console.error("[Wovely] Pattern save error:",e);}
    }
  };
  const openAddModal=(method)=>{
    gateAction(
      { intent: "import_pattern", title: "Create a free account to save patterns", subtitle: "Your imports and progress stay with you across devices." },
      () => { if(tierGate.atCap){setShowPaywall(true);return;} setPendingImportUrl(null); setPendingMethod(method||null); setAddOpen(true); }
    );
  };
  const handleImportUrl=(u)=>{
    gateAction(
      { intent: "import_pattern_url", title: "Create a free account to save patterns", subtitle: "Your imports and progress stay with you across devices." },
      () => { if(tierGate.atCap){setShowPaywall(true);return;} setPendingImportUrl(u); setPendingMethod("url"); setAddOpen(true); }
    );
  };
  const openImageImport=()=>{
    gateAction(
      { intent: "import_pattern_image", title: "Create a free account to save patterns", subtitle: "Your imports and progress stay with you across devices." },
      () => { if(tierGate.atCap){setShowPaywall(true);return;} setImageImportOpen(true); }
    );
  };
  // ImportPill callbacks. Completed: open the review modal with extracted data.
  // Failed: open a fresh import modal (no auto-requeue per spec).
  // Resume (S1.5.3): pill is tapped *during* processing → reopen the full
  // loading modal against the same job_id so polling continues seamlessly.
  const handlePillReview=({jobId,fileType,extractedData,coverImageUrl,validationReport})=>{
    setPendingResumeJobId(null);
    setPendingExtractedHandoff({ fileType, extractedData, coverImageUrl: coverImageUrl || null, validationReport: validationReport || null });
    if (fileType === 'pdf') { setPendingMethod('pdf'); setAddOpen(true); }
    else if (fileType === 'image') { setImageImportOpen(true); }
  };
  const handlePillTryAgain=({jobId,fileType})=>{
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
    { requiresPro: true, intent: intent || "unlock_pro", title: "Create a free account to unlock Pro", subtitle: "Sign up free, then upgrade to Pro anytime." },
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
  const TITLE_MAP={collection:null,wip:"On the Hook",browse:"Find Patterns",stash:"Stash & Notions",calculator:"The Workbench",shopping:"Supply Run",profile:"Profile & Settings",privacy:"Privacy Policy",terms:"Terms of Service"};

  if(isDesktop) return (
    <div style={{display:"flex",minHeight:"100vh",width:"100%",background:"transparent",fontFamily:T.sans,position:"relative"}}>
      <CSS/>
      <WhatsNewModal/>
      <AuthWallModal isOpen={authWallOpen} onClose={()=>{setAuthWallOpen(false);setAuthWallContext(null);}} onSuccess={handleAuthWallSuccess} title={authWallContext?.title} subtitle={authWallContext?.subtitle} intent={authWallContext?.intent}/>
      {!addOpen&&!imageImportOpen&&<ImportPill onTapReview={handlePillReview} onTapTryAgain={handlePillTryAgain} onTapResume={handlePillResume}/>}
      {showOnboarding&&<OnboardingScreen onComplete={()=>{setShowOnboarding(false);setJustCompletedOnboarding(true);localStorage.removeItem("yh_welcome_dismissed");navigate("/profile");}} onBackToAuth={async()=>{setShowOnboarding(false);await supabaseAuth.signOut();setAuthed(false);setTier(TIER_FREE);clearCachedTier();setUserPatterns([]);}}/>}
      {showPaywall&&<TieredUpgradeModal currentTier={tier} reason="paywall" onClose={()=>setShowPaywall(false)}/>}
      {showProModal&&<TieredUpgradeModal currentTier={tier} reason="general" onClose={()=>setShowProModal(false)}/>}
      {addOpen&&<AddPatternModal onClose={()=>{setAddOpen(false);setPendingImportUrl(null);setPendingMethod(null);setPendingExtractedHandoff(null);setPendingResumeJobId(null);}} onSave={handleAddPattern} isPro={isPro} patternCount={userPatterns.length} Btn={Btn} Photo={Photo} Bar={Bar} WireframeViewer={WireframeViewer} onUpgrade={()=>openProGate("bevcheck_preview")} initialMethod={pendingImportUrl?"url":pendingMethod||undefined} initialUrl={pendingImportUrl||undefined} initialExtracted={pendingExtractedHandoff?.fileType==='pdf'?pendingExtractedHandoff.extractedData:null} initialCoverUrl={pendingExtractedHandoff?.fileType==='pdf'?pendingExtractedHandoff.coverImageUrl:null} initialValidationReport={pendingExtractedHandoff?.fileType==='pdf'?pendingExtractedHandoff.validationReport:null} initialPollingJobId={pendingResumeJobId?.fileType==='pdf'?pendingResumeJobId.jobId:null}/>}
      {imageImportOpen&&<ImageImportModal onClose={()=>{setImageImportOpen(false);setPendingExtractedHandoff(null);setPendingResumeJobId(null);}} onPatternSaved={handleAddPattern} userId={supabaseAuth.getUser()?.id} isPro={isPro} onUpgrade={()=>openProGate("bevcheck_preview")} initialExtracted={pendingExtractedHandoff?.fileType==='image'?pendingExtractedHandoff.extractedData:null} initialCoverUrl={pendingExtractedHandoff?.fileType==='image'?pendingExtractedHandoff.coverImageUrl:null} initialValidationReport={pendingExtractedHandoff?.fileType==='image'?pendingExtractedHandoff.validationReport:null} initialPollingJobId={pendingResumeJobId?.fileType==='image'?pendingResumeJobId.jobId:null}/>}
      {addMenuOpen&&menuAnchor&&<><div onClick={()=>{setAddMenuOpen(false);setMenuAnchor(null);}} style={{position:"fixed",inset:0,zIndex:49}}/><div style={{position:"fixed",top:menuAnchor.top,left:menuAnchor.left,zIndex:50,background:"#fff",border:`1px solid ${T.border}`,borderRadius:14,boxShadow:"0 8px 32px rgba(45,45,78,.12)",minWidth:220,padding:"6px 0",fontFamily:"Inter,sans-serif"}}>{[{icon:"📄",label:"Add PDF",action:()=>{setAddMenuOpen(false);setMenuAnchor(null);openAddModal("pdf");}},{icon:"📸",label:"Add from photos",action:()=>{setAddMenuOpen(false);setMenuAnchor(null);openImageImport();}},{icon:"🔗",label:"Paste a URL",action:()=>{setAddMenuOpen(false);setMenuAnchor(null);openAddModal("url");}},{icon:"🌐",label:"Explore free patterns",action:()=>{setAddMenuOpen(false);setMenuAnchor(null);navigateToView("browse");}}].map(item=>(<div key={item.label} onClick={item.action} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",cursor:"pointer",fontSize:13,fontWeight:500,color:T.ink,transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=T.linen} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><span style={{fontSize:16,width:22,textAlign:"center"}}>{item.icon}</span>{item.label}</div>))}</div></>}
      {createdPattern&&<PatternCreatedOverlay pattern={createdPattern} onStartBuilding={()=>{const p=createdPattern;setCreatedPattern(null);startAndOpenPattern(p);}} onGoToHive={()=>{setCreatedPattern(null);navigateToView("collection");}}/>}
      {readyPromptPattern&&<ReadyToBuildPrompt pattern={readyPromptPattern} onStartBuilding={()=>{const p=readyPromptPattern;setReadyPromptPattern(null);startAndOpenPattern(p);}} onViewDetails={()=>{const p=readyPromptPattern;setReadyPromptPattern(null);setSelected(p);navigateToView("detail",p._supabaseId||p.id);}} onDismiss={()=>setReadyPromptPattern(null)}/>}
      {deleteTarget&&<DeleteConfirmModal pattern={deleteTarget} isPro={isPro} onCancel={()=>setDeleteTarget(null)} onDelete={confirmDelete} onPark={parkInsteadOfDelete} onGoPro={()=>{setDeleteTarget(null);setShowProModal(true);}}/>}
      {coverPickerTarget&&<CoverImagePicker pattern={coverPickerTarget} onConfirm={handleCoverConfirm} onClose={()=>setCoverPickerTarget(null)} pdfThumbUrl={pdfThumbUrl} CAT_IMG={CAT_IMG} ALL_CAT_ENTRIES={ALL_CAT_ENTRIES}/>}
      <WelcomeToast visible={showWelcomeToast}/>
      {upgradeToast&&<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:999,background:upgradeToast==="success"?"#5B9B6B":"#6B6B8A",color:"#fff",borderRadius:14,padding:"12px 24px",fontSize:14,fontWeight:600,boxShadow:"0 8px 32px rgba(0,0,0,.2)",animation:"modalPop .3s ease both",textAlign:"center"}}>{upgradeToast==="success"?"Welcome to Wovely Pro!":"No worries — you can upgrade anytime"}</div>}
      <SidebarNav view={view} onNavigate={navigateToView} count={userPatterns.length} isPro={isPro} tier={tier} isAnonymous={!authed} onAddPattern={(e)=>{if(tierGate.atCap){setShowPaywall(true);return;}if(addMenuOpen){setAddMenuOpen(false);setMenuAnchor(null);return;}const r=e?.currentTarget?.getBoundingClientRect();if(r)setMenuAnchor({top:r.bottom+8,left:r.left});setAddMenuOpen(true);}} onSignOut={handleSignOut} onUpgrade={()=>openProGate("locked_nav")} onOpenAuthWall={()=>gateAction({ intent: "nav_sign_in", title: "Create a free account", subtitle: "Takes 10 seconds. No credit card." }, ()=>{})} userPatterns={userPatterns} allPatterns={allPatterns}/>
      <div style={{flex:1,minWidth:0,overflowY:"auto",display:"flex",flexDirection:"column",background:"transparent"}}>
        <WelcomeBanner visible={showWelcomeBanner}/>
        <div style={{background:"#FFFFFF",borderBottom:"1px solid #EDE4F7",padding:"0 32px",height:64,display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:20,flexShrink:0}}>
          <div onClick={isAdam?handleLogoTap:undefined} style={{fontFamily:T.serif,fontSize:28,fontWeight:700,color:T.ink,cursor:isAdam?"pointer":"default"}}>{TITLE_MAP[view]!==null?TITLE_MAP[view]:""}</div>
          <div style={{display:"flex",alignItems:"center",gap:12,position:"relative"}}>
            <FeedbackWidget user={supabaseAuth.getUser()}/>
            {isPro&&<div style={{background:T.terraLt,borderRadius:9999,padding:"4px 10px",fontSize:11,fontWeight:600,color:T.terra}}>✨ Pro</div>}
            <button onClick={(e)=>{if(tierGate.atCap){setShowPaywall(true);return;}if(addMenuOpen){setAddMenuOpen(false);setMenuAnchor(null);return;}const r=e.currentTarget.getBoundingClientRect();setMenuAnchor({top:r.bottom+8,left:r.right-220});setAddMenuOpen(true);}} style={{background:T.terra,color:"#fff",border:"none",borderRadius:9999,padding:"10px 24px",fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(155,126,200,.3)",display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>+</span> Add Pattern</button>
          </div>
        </div>
        <div style={{flex:1,padding:"0 32px",minHeight:"100vh"}}>
          {view==="collection"&&<CollectionView userPatterns={userPatterns} starterPatterns={starterPatterns} cat={cat} setCat={setCat} search={search} setSearch={setSearch} openDetail={openDetail} onAddPattern={openAddModal} isPro={isPro} tier={tierGate} onNavigate={navigateToView} onPark={handleParkPattern} onUnpark={handleUnparkPattern} onDelete={handleDeletePattern} onCoverChange={handleCoverChange} onRename={handleRenamePattern} pct={pct} catFallbackPhoto={catFallbackPhoto} Photo={Photo} Bar={Bar} Stars={Stars} CATS={CATS} TIER_CONFIG={TIER_CONFIG}/>}
          {view==="wip"&&<div style={{padding:"24px 0 80px"}}><button onClick={()=>navigateToView("collection")} style={{background:"none",border:"none",color:T.terra,cursor:"pointer",fontSize:13,fontWeight:600,padding:0,marginBottom:20,display:"flex",alignItems:"center",gap:6}}>← Back</button>{inProgress.length===0?<div style={{textAlign:"center",padding:"80px 20px"}}><div style={{fontSize:48,marginBottom:14}}>🪡</div><div style={{fontFamily:T.serif,fontSize:20,fontWeight:600,color:"#2D2D4E",marginBottom:8}}>Your builds in progress</div><div style={{fontSize:14,color:"#6B6B8A",lineHeight:1.6}}>They'll show up here once you start crocheting a pattern.</div></div>:<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:20}}>{inProgress.map((p,i)=><PatternCard key={p.id} p={p} delay={i*.06} onClick={()=>openDetail(p)} pct={pct} catFallbackPhoto={catFallbackPhoto} Photo={Photo} Bar={Bar} Stars={Stars}/>)}</div>}</div>}
          {view==="detail"&&selected&&<div style={{margin:"0 -40px"}}><Detail p={selected} onBack={()=>{setPendingScrollToRow(null);detailOnBack();}} onSave={detailOnSave} pct={pct} estYards={estYards} estSkeins={estSkeins} pdfThumbUrl={pdfThumbUrl} CSS={CSS} Bar={Bar} Photo={Photo} Stars={Stars} WireframeViewer={WireframeViewer} Btn={Btn} scrollToRow={pendingScrollToRow}/></div>}
          {view==="browse"&&<BrowseSitesView onImportUrl={handleImportUrl}/>}
          {view==="stash"&&<div style={{paddingTop:24}}><YarnStash gateAction={gateAction}/></div>}
          {view==="calculator"&&<div style={{paddingTop:24}}><Calculators/></div>}
          {view==="stitch-check"&&<div style={{paddingTop:24}}><StitchCheck gateAction={gateAction}/></div>}
          {view==="shopping"&&<div style={{paddingTop:24}}><ShoppingList gateAction={gateAction}/></div>}
          {view==="profile"&&<ProfileSettingsView isPro={isPro} tier={tier} authed={authed} gateAction={gateAction} onOpenProModal={()=>openProGate("profile_upgrade_pill")} onGoHome={()=>navigate("/")}/>}
          {view==="privacy"&&<PrivacyPolicy/>}
          {view==="terms"&&<TermsOfService/>}
          {location.pathname.startsWith("/stitch/")&&<div style={{paddingTop:24}}><StitchResultPage/></div>}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{fontFamily:T.sans,background:"transparent",minHeight:"100vh",maxWidth:isTablet?680:430,margin:"0 auto",display:"flex",flexDirection:"column",position:"relative"}}>
      <CSS/>
      <WhatsNewModal/>
      <AuthWallModal isOpen={authWallOpen} onClose={()=>{setAuthWallOpen(false);setAuthWallContext(null);}} onSuccess={handleAuthWallSuccess} title={authWallContext?.title} subtitle={authWallContext?.subtitle} intent={authWallContext?.intent}/>
      {!addOpen&&!imageImportOpen&&<ImportPill onTapReview={handlePillReview} onTapTryAgain={handlePillTryAgain} onTapResume={handlePillResume}/>}
      {showOnboarding&&<OnboardingScreen onComplete={()=>{setShowOnboarding(false);setJustCompletedOnboarding(true);localStorage.removeItem("yh_welcome_dismissed");navigate("/profile");}} onBackToAuth={async()=>{setShowOnboarding(false);await supabaseAuth.signOut();setAuthed(false);setTier(TIER_FREE);clearCachedTier();setUserPatterns([]);}}/>}
      <WelcomeToast visible={showWelcomeToast}/>
      {upgradeToast&&<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:999,background:upgradeToast==="success"?"#5B9B6B":"#6B6B8A",color:"#fff",borderRadius:14,padding:"12px 24px",fontSize:14,fontWeight:600,boxShadow:"0 8px 32px rgba(0,0,0,.2)",animation:"modalPop .3s ease both",textAlign:"center"}}>{upgradeToast==="success"?"Welcome to Wovely Pro!":"No worries — you can upgrade anytime"}</div>}
      <NavPanel open={navOpen} onClose={()=>setNavOpen(false)} view={view} onNavigate={navigateToView} count={userPatterns.length} isPro={isPro} tier={tier} isAnonymous={!authed} onSignOut={handleSignOut} onUpgrade={()=>openProGate("locked_nav")} onOpenAuthWall={()=>gateAction({ intent: "nav_sign_in", title: "Create a free account", subtitle: "Takes 10 seconds. No credit card." }, ()=>{})}/>
      {showPaywall&&<TieredUpgradeModal currentTier={tier} reason="paywall" onClose={()=>setShowPaywall(false)}/>}
      {showProModal&&<TieredUpgradeModal currentTier={tier} reason="general" onClose={()=>setShowProModal(false)}/>}
      {addOpen&&<AddPatternModal onClose={()=>{setAddOpen(false);setPendingImportUrl(null);setPendingMethod(null);setPendingExtractedHandoff(null);setPendingResumeJobId(null);}} onSave={handleAddPattern} isPro={isPro} patternCount={userPatterns.length} Btn={Btn} Photo={Photo} Bar={Bar} WireframeViewer={WireframeViewer} onUpgrade={()=>openProGate("bevcheck_preview")} initialMethod={pendingImportUrl?"url":pendingMethod||undefined} initialUrl={pendingImportUrl||undefined} initialExtracted={pendingExtractedHandoff?.fileType==='pdf'?pendingExtractedHandoff.extractedData:null} initialCoverUrl={pendingExtractedHandoff?.fileType==='pdf'?pendingExtractedHandoff.coverImageUrl:null} initialValidationReport={pendingExtractedHandoff?.fileType==='pdf'?pendingExtractedHandoff.validationReport:null} initialPollingJobId={pendingResumeJobId?.fileType==='pdf'?pendingResumeJobId.jobId:null}/>}
      {imageImportOpen&&<ImageImportModal onClose={()=>{setImageImportOpen(false);setPendingExtractedHandoff(null);setPendingResumeJobId(null);}} onPatternSaved={handleAddPattern} userId={supabaseAuth.getUser()?.id} isPro={isPro} onUpgrade={()=>openProGate("bevcheck_preview")} initialExtracted={pendingExtractedHandoff?.fileType==='image'?pendingExtractedHandoff.extractedData:null} initialCoverUrl={pendingExtractedHandoff?.fileType==='image'?pendingExtractedHandoff.coverImageUrl:null} initialValidationReport={pendingExtractedHandoff?.fileType==='image'?pendingExtractedHandoff.validationReport:null} initialPollingJobId={pendingResumeJobId?.fileType==='image'?pendingResumeJobId.jobId:null}/>}
      {createdPattern&&<PatternCreatedOverlay pattern={createdPattern} onStartBuilding={()=>{const p=createdPattern;setCreatedPattern(null);startAndOpenPattern(p);}} onGoToHive={()=>{setCreatedPattern(null);navigateToView("collection");}}/>}
      {readyPromptPattern&&<ReadyToBuildPrompt pattern={readyPromptPattern} onStartBuilding={()=>{const p=readyPromptPattern;setReadyPromptPattern(null);startAndOpenPattern(p);}} onViewDetails={()=>{const p=readyPromptPattern;setReadyPromptPattern(null);setSelected(p);navigateToView("detail",p._supabaseId||p.id);}} onDismiss={()=>setReadyPromptPattern(null)}/>}
      {deleteTarget&&<DeleteConfirmModal pattern={deleteTarget} isPro={isPro} onCancel={()=>setDeleteTarget(null)} onDelete={confirmDelete} onPark={parkInsteadOfDelete} onGoPro={()=>{setDeleteTarget(null);setShowProModal(true);}}/>}
      {showWelcomeBanner&&<WelcomeBanner onDismiss={()=>setShowWelcomeBanner(false)}/>}
      <div style={{background:"#FFFFFF",borderBottom:"1px solid #EDE4F7",padding:"0 18px",height:56,display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:20,flexShrink:0}}>
        <button onClick={()=>setNavOpen(true)} style={{background:"none",border:"none",cursor:"pointer",padding:"8px 8px 8px 0",display:"flex",flexDirection:"column",gap:5}}><div style={{width:22,height:1.5,background:T.ink,borderRadius:99}}/><div style={{width:15,height:1.5,background:T.ink,borderRadius:99}}/><div style={{width:22,height:1.5,background:T.ink,borderRadius:99}}/></button>
        <div onClick={isAdam?handleLogoTap:undefined} style={{fontFamily:T.serif,fontSize:20,fontWeight:700,color:T.ink,cursor:isAdam?"pointer":"default"}}>{TITLE_MAP[view]!==null?TITLE_MAP[view]:""}</div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <FeedbackWidget user={supabaseAuth.getUser()}/>
          <button onClick={()=>{if(tierGate.atCap){setShowPaywall(true);return;}setAddMenuOpen(v=>!v);}} style={{background:T.terra,border:"none",borderRadius:9999,width:34,height:34,cursor:"pointer",color:"#fff",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 10px rgba(155,126,200,.4)"}}>+</button>
        </div>
      </div>
      {addMenuOpen&&<><div onClick={()=>setAddMenuOpen(false)} style={{position:"fixed",inset:0,zIndex:49,background:"rgba(28,23,20,.4)"}}/><div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:50,background:"#fff",borderRadius:"20px 20px 0 0",padding:"12px 0 24px",boxShadow:"0 -8px 32px rgba(45,45,78,.12)",fontFamily:"Inter,sans-serif"}}><div style={{width:36,height:3,background:T.border,borderRadius:99,margin:"0 auto 16px"}}/>{[{icon:"📄",label:"Add PDF",sub:"Upload & extract",action:()=>{setAddMenuOpen(false);openAddModal("pdf");}},{icon:"📸",label:"Add from photos",sub:"Screenshots, scans, photos",action:()=>{setAddMenuOpen(false);openImageImport();}},{icon:"🔗",label:"Paste a URL",sub:"Any pattern link",action:()=>{setAddMenuOpen(false);openAddModal("url");}},{icon:"🌐",label:"Explore free patterns",sub:"AllFreeCrochet, Drops & more",action:()=>{setAddMenuOpen(false);navigateToView("browse");}}].map(item=>(<div key={item.label} onClick={item.action} style={{display:"flex",alignItems:"center",gap:14,padding:"12px 22px",cursor:"pointer"}}><span style={{fontSize:22,width:28,textAlign:"center"}}>{item.icon}</span><div><div style={{fontSize:14,fontWeight:600,color:T.ink}}>{item.label}</div><div style={{fontSize:12,color:T.ink3}}>{item.sub}</div></div></div>))}</div></>}
      <div style={{flex:1,overflowY:"auto",paddingBottom:100,minHeight:"100vh"}}>
        {view==="collection"&&<CollectionView userPatterns={userPatterns} starterPatterns={starterPatterns} cat={cat} setCat={setCat} search={search} setSearch={setSearch} openDetail={openDetail} onAddPattern={()=>{if(tierGate.atCap){setShowPaywall(true);return;}setAddMenuOpen(v=>!v);}} isPro={isPro} tier={tierGate} onNavigate={navigateToView} onPark={handleParkPattern} onUnpark={handleUnparkPattern} onDelete={handleDeletePattern} onCoverChange={handleCoverChange} onRename={handleRenamePattern} pct={pct} catFallbackPhoto={catFallbackPhoto} Photo={Photo} Bar={Bar} Stars={Stars} CATS={CATS} TIER_CONFIG={TIER_CONFIG}/>}
        {view==="wip"&&<div style={{padding:"16px 18px 80px"}}>{inProgress.length===0?<div style={{textAlign:"center",padding:"60px 20px"}}><div style={{fontSize:48,marginBottom:14}}>🪡</div><div style={{fontFamily:T.serif,fontSize:18,fontWeight:600,color:"#2D2D4E",marginBottom:8}}>Your builds in progress</div><div style={{fontSize:14,color:"#6B6B8A",lineHeight:1.6}}>They'll show up here once you start crocheting a pattern.</div></div>:<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>{inProgress.map((p,i)=><PatternCard key={p.id} p={p} delay={i*.06} onClick={()=>openDetail(p)} pct={pct} catFallbackPhoto={catFallbackPhoto} Photo={Photo} Bar={Bar} Stars={Stars}/>)}</div>}</div>}
        {view==="detail"&&selected&&<Detail p={selected} onBack={()=>{setPendingScrollToRow(null);detailOnBack();}} onSave={detailOnSave} pct={pct} estYards={estYards} estSkeins={estSkeins} pdfThumbUrl={pdfThumbUrl} CSS={CSS} Bar={Bar} Photo={Photo} Stars={Stars} WireframeViewer={WireframeViewer} Btn={Btn} scrollToRow={pendingScrollToRow}/>}
        {view==="browse"&&<BrowseSitesView onImportUrl={handleImportUrl}/>}
        {view==="stash"&&<div style={{paddingTop:18}}><YarnStash gateAction={gateAction}/></div>}
        {view==="calculator"&&<div style={{paddingTop:18}}><Calculators/></div>}
        {view==="stitch-check"&&<div style={{paddingTop:18}}><StitchCheck gateAction={gateAction}/></div>}
        {view==="shopping"&&<div style={{paddingTop:18}}><ShoppingList gateAction={gateAction}/></div>}
        {view==="profile"&&<ProfileSettingsView isPro={isPro} tier={tier} authed={authed} gateAction={gateAction} onOpenProModal={()=>openProGate("profile_upgrade_pill")} onGoHome={()=>navigate("/")}/>}
        {view==="privacy"&&<PrivacyPolicy/>}
        {view==="terms"&&<TermsOfService/>}
        {location.pathname.startsWith("/stitch/")&&<div style={{paddingTop:18}}><StitchResultPage/></div>}
      </div>
      {!addOpen&&!imageImportOpen&&!addMenuOpen&&<button onClick={()=>{if(tierGate.atCap){setShowPaywall(true);return;}setAddMenuOpen(v=>!v);}} style={{position:"fixed",right:0,top:"50%",transform:"translateY(-50%)",zIndex:40,display:"flex",alignItems:"center",justifyContent:"center",writingMode:"vertical-rl",textOrientation:"mixed",background:"#9B7EC8",color:"#fff",fontFamily:"'Inter',sans-serif",fontSize:13,fontWeight:600,letterSpacing:"0.05em",padding:"16px 10px",borderRadius:"12px 0 0 12px",cursor:"pointer",boxShadow:"-3px 0 16px rgba(155,126,200,0.25)",userSelect:"none",border:"none",outline:"none"}}>+ Add Pattern</button>}
    </div>
  );
}
