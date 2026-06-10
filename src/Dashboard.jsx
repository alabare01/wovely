import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { T, useBreakpoint } from "./theme.jsx";
import { PILL } from "./constants.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, getSession, supabaseAuth } from "./supabase.js";
import { listCollections, deleteCollection, partLabelFor, partLabelPlural } from "./utils/collections.js";

// ─── HELPERS ────────────────────────────────────────────────────────────────
const hoursSince = (dateStr) => {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  return (Date.now() - d.getTime()) / 3600000;
};
const timeAgo = (dateStr) => {
  if (!dateStr) return "";
  const h = hoursSince(dateStr);
  if (h < 1) return "Updated just now";
  if (h < 24) return `Updated ${Math.round(h)}h ago`;
  const d = Math.round(h / 24);
  return `Updated ${d} day${d !== 1 ? "s" : ""} ago`;
};

// ─── DESIGN TOKENS ──────────────────────────────────────────────────────────
const PF = "'Playfair Display',Georgia,serif";
const INTER = "Inter,sans-serif";
const NAVY = "#2D3A7C";
const INK = "#2D2D4E";
const ACCENT = "#9B7EC8";
const MUTED = "#6B6B8A";
const PILL_BG = "#F3EFF8";

// Glass card tokens
const GLASS = {
  bg: "rgba(255,255,255,0.82)",
  blur: "blur(16px)",
  radius: 20,
  border: "1px solid rgba(255,255,255,0.6)",
  shadow: "0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(155,126,200,0.13)",
};
const GLASS_LIGHT = { ...GLASS, bg: "rgba(255,255,255,0.75)", blur: "blur(12px)" };

// ─── RENAME MODAL ───────────────────────────────────────────────────────────
const RenameModal = ({pattern,onSave,onCancel}) => {
  const [val,setVal]=useState(pattern.title||"");
  return (
    <div style={{position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onCancel}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.5)",backdropFilter:"blur(3px)"}}/>
      <div onClick={e=>e.stopPropagation()} style={{position:"relative",background:"#fff",borderRadius:16,padding:"24px 22px 20px",width:"100%",maxWidth:360,boxShadow:"0 12px 40px rgba(0,0,0,.2)"}}>
        <div style={{fontFamily:PF,fontSize:18,fontWeight:700,color:INK,marginBottom:14}}>Rename pattern</div>
        <input value={val} onChange={e=>setVal(e.target.value)} autoFocus style={{width:"100%",padding:"10px 14px",border:"1.5px solid #EDE4F7",borderRadius:10,fontSize:14,fontFamily:INTER,color:INK,outline:"none",boxSizing:"border-box",marginBottom:16}} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor="#EDE4F7"}/>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={onCancel} style={{background:"none",border:"1px solid #EDE4F7",borderRadius:10,padding:"8px 18px",fontSize:13,fontWeight:600,color:MUTED,cursor:"pointer"}}>Cancel</button>
          <button onClick={()=>onSave(val.trim())} disabled={!val.trim()} style={{background:val.trim()?ACCENT:"#D5CBE8",border:"none",borderRadius:10,padding:"8px 18px",fontSize:13,fontWeight:600,color:"#fff",cursor:val.trim()?"pointer":"not-allowed"}}>Save</button>
        </div>
      </div>
    </div>
  );
};

// ─── PATTERN CARD (glass treatment) ─────────────────────────────────────────
const PatternCard = ({p,onClick,onPark,onUnpark,onDelete,onCoverChange,onRename,delay=0,pct,catFallbackPhoto,Photo,Bar,Stars}) => {
  const done=pct(p);
  const [menuOpen,setMenuOpen]=useState(false);
  const [renaming,setRenaming]=useState(false);
  const isParked=p.status==="parked";
  const cardPhoto=p.cover_image_url||(PILL.includes(p.photo)?catFallbackPhoto(p.cat):p.photo)||catFallbackPhoto(p.cat);
  const isPlaceholder=!p.cover_image_url&&PILL.includes(p.photo);
  const hasImage = !!cardPhoto && !isPlaceholder;
  return (
    <div className="card fu" onClick={onClick} style={{background:GLASS.bg,backdropFilter:GLASS.blur,WebkitBackdropFilter:GLASS.blur,borderRadius:GLASS.radius,overflow:"hidden",border:GLASS.border,cursor:"pointer",animationDelay:delay+"s",position:"relative",boxShadow:GLASS.shadow,transition:"transform 0.15s ease, box-shadow 0.15s ease"}} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 32px rgba(155,126,200,0.2)";}} onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow=GLASS.shadow;}}>
      {renaming&&<RenameModal pattern={p} onCancel={()=>setRenaming(false)} onSave={newTitle=>{setRenaming(false);onRename&&onRename(p,newTitle);}}/>}
      {(onPark||onDelete)&&<div style={{position:"absolute",top:8,right:8,zIndex:5}}>
        <button onClick={e=>{e.stopPropagation();setMenuOpen(!menuOpen);}} style={{background:"rgba(0,0,0,.45)",backdropFilter:"blur(4px)",border:"none",borderRadius:99,width:28,height:28,cursor:"pointer",color:"#fff",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>⋮</button>
        {menuOpen&&<div onClick={e=>e.stopPropagation()} style={{position:"absolute",right:0,top:32,background:"rgba(255,255,255,0.95)",backdropFilter:"blur(12px)",border:GLASS.border,borderRadius:10,boxShadow:GLASS.shadow,zIndex:10,minWidth:150,overflow:"hidden"}}>
          {onRename&&<div onClick={()=>{setMenuOpen(false);setRenaming(true);}} style={{padding:"10px 14px",fontSize:13,color:T.ink,cursor:"pointer",borderBottom:"1px solid #EDE4F7"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(237,228,247,0.4)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>Rename pattern</div>}
          {onCoverChange&&<div onClick={()=>{setMenuOpen(false);onCoverChange(p);}} style={{padding:"10px 14px",fontSize:13,color:T.ink,cursor:"pointer",borderBottom:"1px solid #EDE4F7"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(237,228,247,0.4)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>Change cover image</div>}
          {isParked
            ?<div onClick={()=>{setMenuOpen(false);onUnpark&&onUnpark(p);}} style={{padding:"10px 14px",fontSize:13,color:T.ink,cursor:"pointer",borderBottom:"1px solid #EDE4F7"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(237,228,247,0.4)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>Unpark</div>
            :<div onClick={()=>{setMenuOpen(false);onPark&&onPark(p);}} style={{padding:"10px 14px",fontSize:13,color:T.ink,cursor:"pointer",borderBottom:"1px solid #EDE4F7"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(237,228,247,0.4)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>Park for later</div>
          }
          <div onClick={()=>{setMenuOpen(false);onDelete&&onDelete(p);}} style={{padding:"10px 14px",fontSize:13,color:"#C05A5A",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(237,228,247,0.4)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>Delete pattern</div>
        </div>}
      </div>}
      <div style={{position:"relative",height:200,overflow:"hidden",borderRadius:`${GLASS.radius}px ${GLASS.radius}px 0 0`,background:"linear-gradient(135deg, #EDE4F7 0%, #F5F0FA 100%)"}}>
        {hasImage
          ? <Photo src={cardPhoto} alt={p.title} style={{width:"100%",height:"100%",objectFit:"contain",objectPosition:"center",display:"block"}}/>
          : <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{fontFamily:PF,fontSize:36,color:ACCENT,opacity:0.5}}>{(p.title||"?")[0]}</span>
            </div>
        }
        {isParked?<div style={{position:"absolute",top:10,left:10,background:"rgba(92,79,68,.8)",backdropFilter:"blur(4px)",color:"#fff",fontSize:9,fontWeight:600,padding:"3px 8px",borderRadius:99}}>Parked</div>
        :p.isStarter?<div style={{position:"absolute",top:10,left:10,background:"rgba(184,144,44,.9)",backdropFilter:"blur(4px)",color:"#fff",fontSize:9,fontWeight:600,padding:"3px 8px",borderRadius:99}}>Free Starter</div>
        :done===100?<div style={{position:"absolute",top:10,right:10,background:T.sage,color:"#fff",fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:99,letterSpacing:".07em"}}>DONE</div>
        :done>0&&done<100?<><div style={{position:"absolute",top:10,right:10,background:"rgba(28,23,20,.65)",backdropFilter:"blur(4px)",color:"#fff",fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:99}}>{done}%</div><div style={{position:"absolute",bottom:0,left:0,right:0}}><Bar val={done} color="rgba(255,255,255,.8)" h={3} bg="transparent"/></div></>
        :null}
        {!isParked&&!p.isStarter&&done===0&&!p.started&&p.rows&&p.rows.length>0&&<div style={{position:"absolute",top:10,right:10,background:"rgba(92,122,94,.85)",backdropFilter:"blur(4px)",color:"#fff",fontSize:9,fontWeight:600,padding:"3px 8px",borderRadius:99}}>Ready to build</div>}
        {!p.isStarter&&p.snapConfidence&&<div style={{position:"absolute",top:10,left:10,background:"rgba(155,126,200,.85)",backdropFilter:"blur(4px)",color:"#fff",fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:99}}>✨ {p.snapConfidence}%</div>}
        {isPlaceholder&&onCoverChange&&<button onClick={e=>{e.stopPropagation();onCoverChange(p);}} style={{position:"absolute",bottom:10,left:"50%",transform:"translateX(-50%)",background:"rgba(255,255,255,.15)",backdropFilter:"blur(4px)",border:`1.5px solid ${T.terra}`,borderRadius:10,padding:"6px 14px",fontSize:11,fontWeight:600,color:"#fff",cursor:"pointer",whiteSpace:"nowrap"}}>Set cover image</button>}
      </div>
      <div style={{padding:"14px 16px 16px"}}>
        {p.cat&&p.cat.toLowerCase()!=="uncategorized"&&<div style={{fontFamily:INTER,fontSize:10,fontWeight:600,color:ACCENT,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>{p.cat}</div>}
        <div style={{fontFamily:PF,fontSize:15,fontWeight:600,color:NAVY,lineHeight:1.3,margin:"0 0 6px",overflow:"hidden",textOverflow:"ellipsis",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",whiteSpace:"normal"}}>{p.title}</div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><Stars val={p.rating} ro/><span style={{fontFamily:INTER,fontSize:11,color:"#9B87B8"}}>{p.source}</span></div>
        {p.isStarter&&<div style={{fontSize:12,color:MUTED,opacity:.6,marginTop:6,fontStyle:"italic"}}>A gift from Wovely — yours to keep</div>}
      </div>
    </div>
  );
};

// ─── EMPTY SLOT CARDS ───────────────────────────────────────────────────────
const SLOT_SVGS = [
  `<svg viewBox="0 0 48 48" fill="none" stroke="#C4B5A0" stroke-width="1.5"><circle cx="24" cy="24" r="14"/><path d="M18 18c3-3 9-3 12 0"/><path d="M14 24c0-2 2-6 10-6s10 4 10 6"/><path d="M24 10v4M24 34v4"/></svg>`,
  `<svg viewBox="0 0 48 48" fill="none" stroke="#C4B5A0" stroke-width="1.5"><path d="M20 8l-4 30"/><path d="M16 20c0-6 12-6 12 0s-12 6-12 0"/><circle cx="30" cy="14" r="3"/></svg>`,
  `<svg viewBox="0 0 48 48" fill="none" stroke="#C4B5A0" stroke-width="1.5"><path d="M18 10l12 14-12 14"/><path d="M30 10l-12 14 12 14"/></svg>`,
  `<svg viewBox="0 0 48 48" fill="none" stroke="#C4B5A0" stroke-width="1.5"><path d="M24 6l10 6v12l-10 6-10-6V12z"/><path d="M24 18v12"/><path d="M14 12l10 6 10-6"/></svg>`,
  `<svg viewBox="0 0 48 48" fill="none" stroke="#C4B5A0" stroke-width="1.5"><path d="M24 8l4 10h10l-8 6 3 10-9-7-9 7 3-10-8-6h10z"/></svg>`,
];

const EmptySlotCard = ({onClick,slotIndex=0}) => (
  <div onClick={onClick} style={{background:"rgba(253,251,255,0.7)",backdropFilter:GLASS.blur,WebkitBackdropFilter:GLASS.blur,borderRadius:GLASS.radius,border:"2px dashed #D4C5ED",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:220,transition:"border-color .2s, background .2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.terra;e.currentTarget.style.background="rgba(243,239,248,0.8)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="#D4C5ED";e.currentTarget.style.background="rgba(253,251,255,0.7)";}}>
    <div style={{width:48,height:48,marginBottom:10}} dangerouslySetInnerHTML={{__html:SLOT_SVGS[slotIndex%SLOT_SVGS.length]}}/>
    <div style={{fontSize:13,color:T.ink2}}>Add a pattern</div>
  </div>
);

// Playfair italic accent span helper
const Em = ({ children }) => <span style={{ fontFamily: PF, fontStyle: "italic", color: ACCENT }}>{children}</span>;

// Info tooltip — hover on desktop, tap toggle on mobile
const InfoTooltip = ({ text, alignRight }) => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const dismiss = () => setVisible(false);
    document.addEventListener("touchstart", dismiss);
    return () => document.removeEventListener("touchstart", dismiss);
  }, [visible]);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: 8 }}>
      <span onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)} onTouchStart={e => { e.stopPropagation(); setVisible(v => !v); }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", background: "rgba(155,126,200,0.15)", color: ACCENT, fontSize: 10, fontFamily: INTER, fontWeight: 700, cursor: "default", userSelect: "none", flexShrink: 0, lineHeight: 1 }}>i</span>
      {visible && (
        <span style={{ position: "absolute", bottom: "calc(100% + 8px)", background: "rgba(45,58,124,0.88)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", color: "#fff", fontFamily: INTER, fontSize: 12, fontWeight: 400, lineHeight: 1.5, padding: "8px 12px", borderRadius: 10, maxWidth: 260, minWidth: 180, whiteSpace: "normal", wordBreak: "break-word", boxShadow: "0 4px 16px rgba(0,0,0,0.15)", zIndex: 100, pointerEvents: "none", ...(alignRight ? { right: 0, left: "auto", transform: "none" } : { left: "50%", transform: "translateX(-50%)" }) }}>
          {text}
          <span style={{ position: "absolute", top: "100%", borderWidth: 5, borderStyle: "solid", borderColor: "rgba(45,58,124,0.88) transparent transparent transparent", width: 0, height: 0, ...(alignRight ? { right: 12, left: "auto", transform: "none" } : { left: "50%", transform: "translateX(-50%)" }) }} />
        </span>
      )}
    </span>
  );
};

// ─── BEV CORNER (glass card, JS typewriter, personalized messages) ──────────
const BevCorner = ({ patterns, isMobile, isPro }) => {
  const CACHE_KEY = 'wovely_bev_ai_msg';
  const CACHE_TTL = 24 * 60 * 60 * 1000;
  const getCachedAiMsg = () => { try { const raw = localStorage.getItem(CACHE_KEY); if (!raw) return null; const { msg, ts } = JSON.parse(raw); if (Date.now() - ts > CACHE_TTL) return null; return msg; } catch { return null; } };
  const setCachedAiMsg = (msg) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ msg, ts: Date.now() })); } catch {} };

  const [msgIndex, setMsgIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const buildMsgs = () => {
    const hr = new Date().getHours();
    const pool = [];

    // TIME BASED
    if (hr >= 0 && hr < 6) pool.push(...["Bev doesn't sleep either. What are we making at this hour? 🌙", "Late night crafting. Bev respects the dedication deeply.", "The rest of the world is asleep. It's just you, Bev, and the yarn. 🧶", "Midnight crafting hours. Bev has no notes, only respect."]);
    else if (hr < 9) pool.push(...["Morning! Bev's already been up for hours. She's very serious about yarn. ☀️", "Early crafter energy detected. Bev approves. ☀️", "Starting the day with crochet. Bev says this is the correct way to live."]);
    else if (hr < 12) pool.push(...["Morning craft session. Bev has her coffee. She's ready. ☕", "Peak productivity hours. Bev suggests we use them wisely. 🧶", "Good morning. Bev has opinions about your WIP and she's ready to share them."]);
    else if (hr < 14) pool.push(...["Lunch break crafting. Bev calls this efficient. 🍵", "Midday check-in. Bev wants to know how the stitch count is going.", "You opened Wovely at lunch. Bev is not surprised. She would do the same."]);
    else if (hr < 17) pool.push(...["Afternoon slump? Bev recommends yarn as a cure. 🧶", "Mid-afternoon. Prime time for a few rows, according to Bev.", "Bev's afternoon energy is high. She thinks you should cast on something new."]);
    else if (hr < 21) pool.push(...["Evening crafting hour. Best hour of the day, according to Bev. 🌙", "Post-work crochet. Bev calls this the correct way to decompress.", "Evening mode activated. Bev has been waiting for this. 🧶"]);
    else pool.push(...["Night owl crafter. Bev respects this lifestyle entirely.", "Late evening yarn time. Bev says just one more row. (She always says this.)", "Crafting before bed. Bev thinks this is the secret to a good night's sleep. 🌙"]);

    // PATTERN COUNT
    const count = patterns.length;
    if (count === 0) pool.push(...["Your pattern library is empty. Bev is ready to help fix that. 🧶", "No patterns yet. Bev has a few ideas about where to start."]);
    else if (count <= 3) pool.push(...["A small but mighty collection. Bev sees potential here. 🧶", "Just getting started. Bev was here from day one and she remembers."]);
    else if (count <= 9) pool.push(...["Your collection is growing. Bev has been keeping track. 🧶", "A solid library forming. Bev approves of the direction."]);
    else if (count <= 19) pool.push(...["Double digits. Bev is genuinely impressed.", "Ten plus patterns. You're not a beginner anymore. Bev noticed. 🧶"]);
    else pool.push(...["Bev has lost count. In the best possible way. 🧶", "This collection is getting serious. Bev is here for it entirely."]);

    // UNSTARTED PATTERNS
    const blankPatterns = patterns.filter(p => !p.last_opened_at);
    if (blankPatterns.length > 0) pool.push(...[
      `${blankPatterns.length} pattern${blankPatterns.length > 1 ? 's' : ''} waiting to be started. Bev is not judging. She is simply aware. 👀`,
      "Some patterns in your library have never been opened. Bev finds this deeply relatable. 🧶",
      "You saved patterns you haven't touched yet. Bev calls this 'aspirational crafting.' She does it too."
    ]);

    // PAID
    if (isPro) pool.push(...["Craft crafter. Bev has high expectations and full confidence you'll meet them. 💜", "Full access unlocked. Bev thinks you made an excellent decision. 💜", "Wovely Craft. Bev's favorite tier, not that she plays favorites. (She does.) 💜"]);

    // GENERAL POOL
    pool.push(...[
      "Your craft room is ready. What are we making today? 🧶",
      "Bev has reviewed your library and has thoughts. They are mostly positive. 🧶",
      "Every great project starts with opening the app. Bev respects this first step.",
      "Bev believes in you and also in the power of a well-placed stitch marker.",
      "No wrong answers in crochet. Bev said this. Bev stands by it.",
      "The yarn doesn't work up itself. Bev is a firm believer in showing up. 🧶",
      "Bev has been thinking about your WIP. She has questions.",
      "Progress is progress, even if it's just swatching. Bev counted it.",
      "Bev's philosophy: one more row before bed. Every night. No exceptions.",
      "You came back. Bev noticed. She always notices. 🧶",
      "Crochet is just math you can wear. Bev majored in math. (She didn't. But she acts like it.)",
      "Bev has no notes on your yarn choices. High praise from Bev.",
      "Every stitch counts. Bev has the data to prove it.",
      "Bev is rooting for you, your WIP, and your stitch count. In that order.",
      "Your patterns are safe. Your progress is saved. Bev is vigilant. 🧶",
      "Bev has been here all day. She was just waiting for you to show up.",
      "Not all heroes carry hooks. But the best ones do. 💜",
      "Bev has opinions about gauge swatching. She will share them when the time is right.",
      "Whatever you're making, Bev thinks it's going to be incredible. She has a feeling.",
      "Big shoutout to turttlesong — our most active beta tester. Bev sees you. 💜"
    ]);

    if (pool.length === 0) pool.push("Your craft room is ready. What are we making today? 🧶");
    return pool;
  };

  const [msgs, setMsgs] = useState(() => buildMsgs());

  useEffect(() => {
    if (Math.random() > 0.2) return;
    const cached = getCachedAiMsg();
    if (cached) { setMsgs(prev => [cached, ...prev]); return; }
    const patternNames = patterns.slice(0, 5).map(p => p.title).filter(Boolean);
    const hr = new Date().getHours();
    const timeOfDay = hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening';
    fetch('/api/bev-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patternCount: patterns.length, patternNames, timeOfDay, isPro })
    })
    .then(r => r.ok ? r.json() : null)
    .then(data => { if (data?.message) { setCachedAiMsg(data.message); setMsgs(prev => [data.message, ...prev]); } })
    .catch(() => {});
  }, []);

  // Rotate messages
  useEffect(() => {
    if (msgs.length <= 1) return;
    const t = setInterval(() => setMsgIndex(i => (i + 1) % msgs.length), 8000);
    return () => clearInterval(t);
  }, [msgs.length]);

  // JS typewriter — character by character, wraps naturally
  useEffect(() => {
    const msg = msgs[msgIndex % msgs.length];
    if (!msg) return;
    setDisplayText("");
    setIsTyping(true);
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayText(msg.slice(0, i));
      if (i >= msg.length) { clearInterval(timer); setIsTyping(false); }
    }, 42);
    return () => clearInterval(timer);
  }, [msgIndex]);

  return (
    <div style={{
      gridColumn: "1 / -1",
      display: "flex", alignItems: "flex-start", gap: 12, width: "100%",
      padding: "20px 24px", overflow: "hidden",
      background: GLASS.bg, backdropFilter: GLASS.blur, WebkitBackdropFilter: GLASS.blur,
      borderRadius: GLASS.radius, border: GLASS.border, boxShadow: GLASS.shadow,
      marginBottom: 24,
    }}>
      <img src="/bev_neutral.png" alt="Bev" style={{
        width: isMobile ? 68 : 88, height: "auto", flexShrink: 0,
        filter: "drop-shadow(0 6px 20px rgba(155,126,200,0.4))",
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: INTER, fontSize: 15, color: INK, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", minHeight: "1.6em" }}>
          {displayText}
          {isTyping && <span style={{ display: "inline-block", width: 2, height: "1em", background: ACCENT, marginLeft: 1, verticalAlign: "middle" }} />}
        </p>
      </div>
    </div>
  );
};

// ─── ON THE HOOK ────────────────────────────────────────────────────────────
// Exported so the parent can render the "On the Hook" section header above
// the two-column grid (so both columns align at the card edge, not at the
// header text).
export const OnTheHookHeader = () => (
  <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
    <span style={{ fontFamily: PF, fontSize: 20, fontWeight: 600, color: NAVY }}>On the Hook</span>
    <InfoTooltip text="Your most recently touched pattern — pick up right where you left off." />
  </div>
);

const OnTheHook = ({ inProgress, openDetail, onAddPattern, pct, catFallbackPhoto, Photo, isMobile, collections = [], partsByCollection, hideHeader }) => {
  const navigate = useNavigate();
  const sectionLabel = hideHeader ? null : <OnTheHookHeader />;
  // If the hero is a collection part, the card surfaces the collection
  // identity (name + part label + position) instead of just the standalone
  // pattern title. The collection itself is found via the in-memory map
  // CollectionView already builds — no extra fetch.
  const heroForLookup = inProgress[0];
  const heroCollection = (heroForLookup?.is_collection_part && heroForLookup?.collection_id)
    ? (collections || []).find(c => c.id === heroForLookup.collection_id) || null
    : null;

  if (inProgress.length === 0) {
    return (
      <div>
        {sectionLabel}
        <div style={{
          border: "2px dashed #D4C5ED", borderRadius: GLASS.radius, padding: "40px 24px",
          textAlign: "center", background: "rgba(253,251,255,0.7)", backdropFilter: GLASS.blur, WebkitBackdropFilter: GLASS.blur, boxShadow: GLASS.shadow,
        }}>
          <div style={{ fontFamily: INTER, fontSize: 14, color: MUTED, marginBottom: 4 }}>Nothing on the hook yet.</div>
          <div style={{ fontFamily: PF, fontStyle: "italic", fontSize: 14, color: ACCENT, marginBottom: 16 }}>Ready to start something?</div>
          <button onClick={()=>onAddPattern("pdf")} style={{
            background: ACCENT, color: "#fff", border: "none", borderRadius: 14,
            padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: INTER,
          }}>Import a Pattern</button>
        </div>
      </div>
    );
  }

  const hero = inProgress[0];
  const rest = inProgress.slice(1);
  // Match library card src resolution exactly
  const heroCardPhoto = hero.cover_image_url || (PILL.includes(hero.photo) ? catFallbackPhoto(hero.cat) : hero.photo) || catFallbackPhoto(hero.cat);
  const heroIsPlaceholder = !hero.cover_image_url && PILL.includes(hero.photo);
  const heroHasImage = !!heroCardPhoto && !heroIsPlaceholder;
  const hasCoverPhoto = !!(hero.cover_image_url || hero.photo);
  const rows = Array.isArray(hero.rows) ? hero.rows : [];
  const doneRows = rows.filter(r => r && r.done).length;
  const totalRows = rows.length;

  return (
    <div>
      {sectionLabel}
      {/* Hero card — glass */}
      <div key={`${hero.id}-${hero.updated_at}`} onClick={() => openDetail(hero)} style={{
        background: GLASS.bg, backdropFilter: GLASS.blur, WebkitBackdropFilter: GLASS.blur,
        borderRadius: GLASS.radius, boxShadow: GLASS.shadow, border: GLASS.border,
        overflow: "hidden", cursor: "pointer", width: "100%", maxWidth: "100%", boxSizing: "border-box",
      }}>
        {/* TODO: PDF Cover Intelligence (future session)
            Currently the import pipeline saves the first page of a PDF as the cover image.
            For text-heavy PDFs this results in a poor hero image. Future improvement:
            scan PDF pages for the most image-rich page and use that as the cover instead
            of always page 1. See master doc: Bev's Read / Collections session. */}
        {/* Hero image — blurred backdrop treatment (matches detail page PatternHeader).
            Heights tightened so On the Hook + Collections fit above the fold. */}
        <div style={{ height: isMobile ? 140 : 160, overflow: "hidden", borderRadius: `${GLASS.radius}px ${GLASS.radius}px 0 0`, position: "relative", background: ACCENT }}>
          {/* Layer 1: blurred backdrop */}
          {heroHasImage && <img src={heroCardPhoto} alt="" style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", filter: "blur(20px) saturate(1.2) brightness(0.6)", transform: "scale(1.1)", pointerEvents: "none" }} />}
          {/* Layer 2: sharp centered image */}
          {heroHasImage
            ? <img src={heroCardPhoto} alt={hero.title} style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", height: "100%", width: "auto", objectFit: "contain", zIndex: 1 }} />
            : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
                <span style={{ fontFamily: PF, fontSize: 48, color: "#fff", opacity: 0.4 }}>{(hero.title || "?")[0]}</span>
              </div>
          }
          {/* Layer 3: dark gradient overlay */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(20,14,10,0.88) 0%, rgba(20,14,10,0.2) 50%, rgba(20,14,10,0.05) 100%)", zIndex: 2 }} />
        </div>
        <div style={{ padding: 16, boxSizing: "border-box", width: "100%" }}>
          {heroCollection ? (() => {
            // Hero is a collection part — lead with the collection name and
            // surface the part position. The standalone pattern title moves
            // to a tertiary line so the user still sees what they're on.
            const partLabel = partLabelFor(heroCollection);
            const allParts = (partsByCollection && partsByCollection.get(heroCollection.id)) || [];
            const sortedParts = [...allParts].sort((a, b) => (a.collection_order || 0) - (b.collection_order || 0));
            const heroIdx = sortedParts.findIndex(p => p.id === hero.id || p._supabaseId === hero.id);
            const heroPos = heroIdx >= 0 ? heroIdx + 1 : (hero.collection_order || 1);
            const knownTotal = (typeof heroCollection.expected_part_count === "number" && heroCollection.expected_part_count > sortedParts.length)
              ? heroCollection.expected_part_count
              : sortedParts.length;
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ background: heroCollection.collection_type === "mkal" ? ACCENT : "rgba(45,58,124,0.85)", color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 99, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {heroCollection.collection_type === "mkal" ? "MKAL" : "Collection"}
                  </span>
                  <span style={{ fontFamily: INTER, fontSize: 11, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                    {heroCollection.name} · {partLabel} {heroPos}{knownTotal > 1 ? ` of ${knownTotal}` : ""}
                  </span>
                </div>
                <div style={{ fontFamily: PF, fontSize: 16, fontWeight: 600, color: NAVY, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hero.title}</div>
              </>
            );
          })() : (
            <div style={{ fontFamily: PF, fontSize: 16, fontWeight: 600, color: NAVY, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hero.title}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: totalRows > 0 ? 10 : 0 }}>
            {hero.difficulty && <span style={{ fontFamily: INTER, fontSize: 10, background: PILL_BG, color: ACCENT, borderRadius: 20, padding: "3px 10px" }}>{hero.difficulty}</span>}
            <span style={{ fontFamily: INTER, fontSize: 11, color: MUTED }}>{timeAgo(hero.updated_at)}</span>
          </div>
          {totalRows > 0 && (
            <>
              <div style={{ height: 6, background: "#EDE4F7", borderRadius: 3, overflow: "hidden", margin: "0 0 6px" }}>
                <div style={{ width: (doneRows / totalRows * 100) + "%", height: "100%", background: ACCENT, borderRadius: 3, transition: "width .3s" }} />
              </div>
              <div style={{ fontFamily: INTER, fontSize: 12, color: MUTED, marginBottom: 12 }}>{doneRows} of {totalRows} rows</div>
            </>
          )}
          <button style={{
            display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start",
            width: "auto", background: ACCENT, color: "#fff", border: "none", borderRadius: 12,
            padding: "12px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            fontFamily: INTER, letterSpacing: "0.01em",
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
          }} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow="0 4px 16px rgba(155,126,200,0.35)";}} onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>Pick up where you left off →</button>
          {/* "Also in progress" scroller dropped from above-the-fold —
              On the Hook stays compact here. Everything else in progress
              still lives in the library grid below and at /builds. */}
        </div>
      </div>
    </div>
  );
};

// ─── BRAG SHELF (glass cards) ───────────────────────────────────────────────
const BragShelf = ({ patterns, pct, isMobile }) => {
  const [stitchCount, setStitchCount] = useState(null);

  useEffect(() => {
    const user = supabaseAuth.getUser();
    if (!user) return;
    const session = getSession();
    if (!session?.access_token) return;
    fetch(`${SUPABASE_URL}/rest/v1/stitch_results?user_id=eq.${user.id}&select=id`, {
      headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${session.access_token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(rows => setStitchCount(rows.length))
      .catch(() => setStitchCount(0));
  }, []);

  const rowsTracked = patterns.filter(p => !p.isStarter).reduce((sum, p) => {
    if (!Array.isArray(p.rows)) return sum;
    return sum + p.rows.filter(r => r && r.done === true).length;
  }, 0);

  const stats = [
    { value: patterns.filter(p => !p.isStarter).length, label: "Patterns Saved" },
    { value: rowsTracked, label: "Rows Tracked" },
    { value: stitchCount, label: "Stitches Found" },
  ];
  const skeleton = <div style={{ width: 40, height: 24, background: "#EDE4F7", borderRadius: 6, margin: "0 auto" }} />;

  // Always-horizontal compact stats row. Sits below On the Hook (left
  // column on desktop, second item on mobile) — it shouldn't compete
  // with Collections for above-fold real estate.
  return (
    <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
      {stats.map(s => (
        <div key={s.label} style={{
          flex: 1, minWidth: 0, minHeight: 56,
          background: GLASS.bg, backdropFilter: GLASS.blur, WebkitBackdropFilter: GLASS.blur,
          borderRadius: GLASS.radius, boxShadow: GLASS.shadow, border: GLASS.border,
          padding: "10px 12px", textAlign: "center",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
        }}>
          <div style={{ fontFamily: PF, fontSize: 20, color: ACCENT, fontWeight: 600, lineHeight: 1.1 }}>
            {s.value === null ? skeleton : s.value}
          </div>
          <div style={{ fontFamily: INTER, fontSize: 9, color: MUTED, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
};

// ─── COLLECTIONS PRESENCE (above-the-fold right column) ────────────────────
// Always-visible Collections surface that lives next to On the Hook so the
// feature is discoverable without scrolling. Four variants, picked at
// render time off `tier` + `isAnonymous`:
//   • Craft + has collections → list up to 3 + "Start a new collection"
//   • Craft + no collections   → Bev empty-state with "Start a Collection"
//   • Free / Pro               → lock teaser → TieredUpgradeModal
//   • Anonymous                → returns null; caller shouldn't render us

const LockIconSVG = ({ size = 16, color = ACCENT }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const CollectionPresenceRow = ({ c, parts, onOpen }) => {
  const partLabel = partLabelFor(c);
  const partLabelP = partLabelPlural(c);
  const isMkal = c.collection_type === "mkal";
  const importedCount = parts.length;
  const knownTotal = (typeof c.expected_part_count === "number" && c.expected_part_count > importedCount) ? c.expected_part_count : null;
  const countText = knownTotal ? `${importedCount} of ${knownTotal} ${partLabelP}` : `${importedCount} ${importedCount === 1 ? partLabel : partLabelP}`;
  const progress = aggregatePctFromParts(parts);
  const cover = c.cover_image_url || parts.find(p => p.cover_image_url)?.cover_image_url || parts.find(p => p.photo && p.photo !== "PILL")?.photo || null;
  return (
    <div onClick={onOpen} style={{
      display: "flex", alignItems: "center", gap: 10,
      // 48px row height: 8px top/bottom padding + 32px content
      padding: "8px", cursor: "pointer", borderRadius: 10,
      minHeight: 48, boxSizing: "border-box",
      transition: "background .15s",
    }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(155,126,200,0.08)"; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
      <div style={{ width: 32, height: 32, borderRadius: 6, overflow: "hidden", flexShrink: 0, background: "linear-gradient(135deg, #EDE4F7, #F5F0FA)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {cover
          ? <img src={cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: PF, fontSize: 13, fontWeight: 600, color: NAVY, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 1 }}>
          <span style={{ background: isMkal ? ACCENT : "rgba(45,58,124,0.85)", color: "#fff", fontSize: 8, fontWeight: 700, padding: "1px 6px", borderRadius: 99, letterSpacing: "0.06em", textTransform: "uppercase" }}>{isMkal ? "MKAL" : "General"}</span>
          <span style={{ fontFamily: INTER, fontSize: 11, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{countText}</span>
        </div>
      </div>
      <div style={{ fontFamily: INTER, fontSize: 11, fontWeight: 700, color: progress === 100 ? T.sage : ACCENT, flexShrink: 0, minWidth: 32, textAlign: "right" }}>
        {progress}%
      </div>
    </div>
  );
};

// Tiny 4-point sparkle SVG used as the Craft Services banner accent.
// Stays subtle next to the wordmark so the banner reads as branding,
// not as another active control.
const SparkleIcon = ({ size = 12, color = "#fff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0, opacity: 0.95 }}>
    <path d="M12 2 L13.5 9 L21 10.5 L13.5 12 L12 19 L10.5 12 L3 10.5 L10.5 9 Z" />
  </svg>
);

// Single branded container that holds the Your Collections summary AND
// the Start a Collection CTA. Locked variant for Free/Pro users keeps the
// same structure so they can see exactly what Craft unlocks.
const CraftServicesPanel = ({ tier, isAnonymous, collections = [], partsByCollection, onOpenCollection, onStartCollectionImport, onOpenUpgrade }) => {
  if (isAnonymous) return null;
  const isCraft = !!tier?.isCraft;
  const locked = !isCraft;

  // Section A — Your Collections. Same content for locked + unlocked
  // (empty state for Free/Pro reads "No collections yet" which is fine —
  // the locked overlay makes the gating intent obvious).
  const sorted = [...collections].sort((a, b) => {
    const aT = new Date(a.updated_at || a.created_at || 0).getTime();
    const bT = new Date(b.updated_at || b.created_at || 0).getTime();
    return bT - aT;
  });
  const top = sorted.slice(0, 3);
  const more = sorted.length - top.length;
  const scrollToLibrary = () => {
    const el = document.getElementById("your-library");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const sectionA = (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: collections.length === 0 ? 8 : 6 }}>
        <span style={{ fontFamily: PF, fontSize: 16, fontWeight: 600, color: NAVY }}>Your Collections</span>
        {collections.length > 0 && <span style={{ fontFamily: INTER, fontSize: 11, color: MUTED }}>{collections.length}</span>}
      </div>
      {collections.length === 0 ? (
        <div style={{ fontFamily: INTER, fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
          No collections yet.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {top.map(c => (
              <CollectionPresenceRow
                key={c.id}
                c={c}
                parts={partsByCollection?.get?.(c.id) || []}
                onOpen={() => locked ? onOpenUpgrade?.() : onOpenCollection?.(c)}
              />
            ))}
          </div>
          {more > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
              <button onClick={scrollToLibrary} style={{
                background: "transparent", border: "none", padding: 0, cursor: "pointer",
                fontFamily: INTER, fontSize: 12, fontWeight: 600, color: MUTED,
              }}>See all {collections.length} →</button>
            </div>
          )}
        </>
      )}
    </div>
  );

  const stack = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
  );

  // Section B — Start a Collection CTA. flex:1 so it absorbs extra
  // vertical space when the container is taller than its content
  // (which is the common case once the grid stretches to match the
  // left column). The button sits at the bottom of the section.
  const sectionB = (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, minHeight: 0 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          {stack}
          <span style={{ fontFamily: PF, fontSize: 16, fontWeight: 600, color: NAVY }}>Start a Collection</span>
        </div>
        <div style={{ fontFamily: INTER, fontSize: 13, color: MUTED, lineHeight: 1.5, marginBottom: 14 }}>
          Import an MKAL, MCAL, or multi-part pattern.
        </div>
      </div>
      <div>
        <button
          onClick={locked ? onOpenUpgrade : onStartCollectionImport}
          style={{
            background: ACCENT, color: "#fff", border: "none", borderRadius: 12,
            padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            fontFamily: INTER, boxShadow: "0 4px 16px rgba(155,126,200,0.3)",
          }}
        >{locked ? "See plans" : "Start a Collection"}</button>
      </div>
    </div>
  );

  return (
    <div style={{
      // Single glass container — both sections live inside it.
      background: GLASS.bg, backdropFilter: GLASS.blur, WebkitBackdropFilter: GLASS.blur,
      borderRadius: GLASS.radius, border: GLASS.border, boxShadow: GLASS.shadow,
      overflow: "hidden",
      display: "flex", flexDirection: "column",
      width: "100%", height: "100%", boxSizing: "border-box",
    }}>
      {/* Craft Services banner — soft lavender gradient with white text
          brands the entire right column. For Free/Pro it carries a lock
          icon + an upsell-flavored tagline so the upgrade ask reads
          immediately. */}
      <div style={{
        flexShrink: 0,
        background: "linear-gradient(135deg, #9B7EC8 0%, #7B5FB8 100%)",
        color: "#fff",
        padding: "10px 16px 12px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        opacity: locked ? 0.92 : 1,
      }}>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <SparkleIcon size={12} />
            <span style={{ fontFamily: PF, fontSize: 14, fontWeight: 600, letterSpacing: "0.01em" }}>Craft Services</span>
          </div>
          <div style={{ fontFamily: INTER, fontSize: 11, color: "rgba(255,255,255,0.85)", lineHeight: 1.3 }}>
            {locked ? "Unlock your full workspace" : "Your premium workspace"}
          </div>
        </div>
        {locked && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: "rgba(255,255,255,0.18)", flexShrink: 0 }} aria-label="Craft-only">
            <LockIconSVG size={12} color="#fff" />
          </div>
        )}
      </div>
      {/* Body — fades for locked users so the gating reads, but stays
          readable so they can see what Craft offers. Sections wrap in a
          flex column with a divider between them; Section B's flex:1
          pushes the button to the bottom of the container. */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", minHeight: 0,
        opacity: locked ? 0.55 : 1,
        pointerEvents: locked ? "none" : "auto",
      }}>
        {sectionA}
        <div style={{ borderTop: `1px solid ${T.border}` }} />
        {sectionB}
      </div>
    </div>
  );
};

// ─── COLLECTIONS — INLINE LIBRARY CARDS ─────────────────────────────────────
// Collections now sit in the same library grid as pattern cards, not in a
// separate section. The visual differentiation is a thin lavender top
// accent + the type pill — same outer shape so they grid cleanly.

const pctCheckable = (rows) => {
  const c = (rows||[]).filter(r => !r.isHeader && !r.isNoteOnly);
  if (!c.length) return 0;
  return Math.round(c.filter(r => r.done).length / c.length * 100);
};

// Aggregate progress across a set of collection-part patterns. Mirrors
// utils/collections.js aggregatePct but kept inline so Dashboard doesn't
// need a round trip through that helper just for the card grid.
const aggregatePctFromParts = (parts) => {
  let done = 0, total = 0;
  for (const p of (parts || [])) {
    const checkable = (p.rows || []).filter(r => !r.isHeader && !r.isNoteOnly);
    total += checkable.length;
    done += checkable.filter(r => r.done).length;
  }
  return total > 0 ? Math.round((done / total) * 100) : 0;
};

// Collection card rendered inline with PatternCards in the library grid.
// Visually peer to PatternCard — same outer dimensions / glass treatment —
// with a lavender top accent + type pill so it reads as a different kind
// of thing without breaking the grid rhythm.
const CollectionLibraryCard = ({c, parts, onOpen, onDelete, delay=0}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const partLabel = partLabelFor(c);
  const partLabelP = partLabelPlural(c);
  const isMkal = c.collection_type === "mkal";
  const importedCount = parts.length;
  const knownTotal = (typeof c.expected_part_count === "number" && c.expected_part_count > importedCount) ? c.expected_part_count : null;
  const countText = knownTotal ? `${importedCount} of ${knownTotal} ${partLabelP}` : `${importedCount} ${importedCount === 1 ? partLabel : partLabelP}`;
  const progress = aggregatePctFromParts(parts);
  const cover = c.cover_image_url || parts.find(p => p.cover_image_url)?.cover_image_url || parts.find(p => p.photo && p.photo !== "PILL")?.photo || null;
  return (
    <div className="card fu" onClick={onOpen} style={{
      background: GLASS.bg, backdropFilter: GLASS.blur, WebkitBackdropFilter: GLASS.blur,
      borderRadius: GLASS.radius, overflow: "hidden",
      border: GLASS.border, cursor: "pointer", animationDelay: delay + "s",
      position: "relative", boxShadow: GLASS.shadow,
      transition: "transform 0.15s ease, box-shadow 0.15s ease",
    }} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 32px rgba(155,126,200,0.2)";}} onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow=GLASS.shadow;}}>
      {/* Lavender top accent — the visual cue that this is a collection,
          not a single pattern. Subtle enough to not disrupt the grid. */}
      <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg, ${ACCENT}, #B9A3DC, ${ACCENT})`,zIndex:5}}/>
      {/* Three-dot menu — matches the pattern card menu pattern. Edit
          opens the detail (where the existing Edit button lives); Delete
          opens the confirm flow at the parent. */}
      <div style={{position:"absolute",top:8,right:8,zIndex:6}}>
        <button onClick={e=>{e.stopPropagation();setMenuOpen(!menuOpen);}} style={{background:"rgba(0,0,0,.45)",backdropFilter:"blur(4px)",border:"none",borderRadius:99,width:28,height:28,cursor:"pointer",color:"#fff",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>⋮</button>
        {menuOpen && (
          <div onClick={e=>e.stopPropagation()} style={{position:"absolute",right:0,top:32,background:"rgba(255,255,255,0.95)",backdropFilter:"blur(12px)",border:GLASS.border,borderRadius:10,boxShadow:GLASS.shadow,zIndex:10,minWidth:160,overflow:"hidden"}}>
            <div onClick={()=>{setMenuOpen(false);onOpen();}} style={{padding:"10px 14px",fontSize:13,color:INK,cursor:"pointer",borderBottom:"1px solid #EDE4F7"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(237,228,247,0.4)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>Edit collection</div>
            <div onClick={()=>{setMenuOpen(false);onDelete&&onDelete(c);}} style={{padding:"10px 14px",fontSize:13,color:"#C0544A",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(237,228,247,0.4)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>Delete collection</div>
          </div>
        )}
      </div>
      <div style={{position:"relative",height:200,overflow:"hidden",borderRadius:`${GLASS.radius}px ${GLASS.radius}px 0 0`,background:"linear-gradient(135deg, #EDE4F7 0%, #F5F0FA 100%)"}}>
        {cover
          ? <img src={cover} alt={c.name} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
          : <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{opacity:0.45}}>
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
            </div>
        }
        <div style={{position:"absolute",top:10,left:10,background:isMkal?ACCENT:"rgba(45,58,124,0.85)",backdropFilter:"blur(4px)",color:"#fff",fontSize:10,fontWeight:600,padding:"3px 10px",borderRadius:20,letterSpacing:"0.06em",textTransform:"uppercase"}}>
          {isMkal ? "MKAL" : "General"}
        </div>
        {progress === 100 ? (
          <div style={{position:"absolute",top:10,right:46,background:T.sage,color:"#fff",fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:99,letterSpacing:".07em"}}>DONE</div>
        ) : progress > 0 ? (
          <>
            <div style={{position:"absolute",top:10,right:46,background:"rgba(28,23,20,.65)",backdropFilter:"blur(4px)",color:"#fff",fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:99}}>{progress}%</div>
            <div style={{position:"absolute",bottom:0,left:0,right:0,height:3,background:"rgba(255,255,255,.2)"}}>
              <div style={{width:`${progress}%`,height:"100%",background:"rgba(255,255,255,.85)",transition:"width .3s"}}/>
            </div>
          </>
        ) : null}
      </div>
      <div style={{padding:"14px 16px 16px"}}>
        <div style={{fontFamily:INTER,fontSize:10,fontWeight:600,color:ACCENT,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>Collection</div>
        <div style={{fontFamily:PF,fontSize:14,fontWeight:700,color:NAVY,lineHeight:1.3,margin:"0 0 6px",overflow:"hidden",textOverflow:"ellipsis",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{c.name}</div>
        <div style={{fontFamily:INTER,fontSize:11,color:MUTED}}>{countText}</div>
      </div>
    </div>
  );
};

// Subtle "Start a Collection" prompt that sits in the library area when
// a Craft user has no collections yet. Hidden once they create one.
const StartCollectionPrompt = ({onStartCollection, isMobile}) => (
  <div onClick={onStartCollection} style={{
    background: GLASS.bg, backdropFilter: GLASS.blur, WebkitBackdropFilter: GLASS.blur,
    border: `1px dashed #D4C5ED`, borderRadius: GLASS.radius, boxShadow: GLASS.shadow,
    padding: isMobile ? 16 : "18px 22px", cursor: "pointer",
    display: "flex", alignItems: "center", gap: isMobile ? 12 : 16,
    transition: "border-color .15s, background .15s",
    marginBottom: 12,
  }} onMouseEnter={e=>{e.currentTarget.style.borderColor=ACCENT;e.currentTarget.style.background="rgba(243,239,248,0.9)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="#D4C5ED";e.currentTarget.style.background=GLASS.bg;}}>
    <div style={{width:isMobile?44:52,height:isMobile?44:52,borderRadius:"50%",background:"linear-gradient(135deg, rgba(155,126,200,0.18), rgba(155,126,200,0.08))",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
      <svg width={isMobile?22:26} height={isMobile?22:26} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
    </div>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontFamily:PF,fontSize:isMobile?15:17,fontWeight:600,color:NAVY,marginBottom:2}}>Start a Collection</div>
      <div style={{fontFamily:INTER,fontSize:isMobile?12:13,color:MUTED,lineHeight:1.5}}>Perfect for MKALs, designer bundles, and matching sets. Bev keeps the materials and progress in one place.</div>
    </div>
    <button onClick={(e)=>{e.stopPropagation();onStartCollection&&onStartCollection();}} style={{
      background: ACCENT, color: "#fff", border: "none", borderRadius: 12,
      padding: isMobile ? "8px 14px" : "9px 18px", fontSize: 13, fontWeight: 600,
      cursor: "pointer", fontFamily: INTER, flexShrink: 0,
      boxShadow: "0 4px 16px rgba(155,126,200,0.3)",
    }}>Start</button>
  </div>
);

// Old separate CollectionTile retained for reference / inline detail
// view. Library grid uses CollectionLibraryCard above; this one is no
// longer rendered in the dashboard.
const CollectionTile = ({c, onOpen, isMobile}) => {
  const [patterns, setPatterns] = useState([]);
  useEffect(() => {
    let cancelled = false;
    listPatternsInCollection(c.id).then(({data}) => { if(!cancelled) setPatterns(data || []); });
    return () => { cancelled = true; };
  }, [c.id]);
  const cover = c.cover_image_url || patterns.find(p => p.cover_image_url)?.cover_image_url || null;
  const isMkal = c.collection_type === "mkal";
  const count = patterns.length;
  const countLabel = isMkal
    ? `${count} ${count === 1 ? "clue" : "clues"}`
    : `${count} ${count === 1 ? "pattern" : "patterns"}`;
  return (
    <div onClick={onOpen} style={{
      background: GLASS.bg, backdropFilter: GLASS.blur, WebkitBackdropFilter: GLASS.blur,
      borderRadius: GLASS.radius, border: GLASS.border, boxShadow: GLASS.shadow,
      overflow: "hidden", cursor: "pointer",
      transition: "transform 0.15s ease, box-shadow 0.15s ease",
    }} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 32px rgba(155,126,200,0.2)";}} onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow=GLASS.shadow;}}>
      <div style={{height: 140, position: "relative", overflow: "hidden", borderRadius: `${GLASS.radius}px ${GLASS.radius}px 0 0`, background: "linear-gradient(135deg,#EDE4F7 0%,#F5F0FA 100%)"}}>
        {cover
          ? <img src={cover} alt={c.name} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
          : <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{opacity:0.45}}>
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
            </div>
        }
        <div style={{position:"absolute",top:10,left:10,background:"rgba(155,126,200,0.92)",backdropFilter:"blur(4px)",color:"#fff",fontSize:10,fontWeight:600,padding:"3px 10px",borderRadius:20,letterSpacing:"0.06em",textTransform:"uppercase"}}>
          {isMkal ? "MKAL" : "General"}
        </div>
      </div>
      <div style={{padding:"14px 16px 16px"}}>
        <div style={{fontFamily:PF,fontSize:14,fontWeight:700,color:NAVY,lineHeight:1.3,marginBottom:6,overflow:"hidden",textOverflow:"ellipsis",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{c.name}</div>
        <div style={{fontFamily:INTER,fontSize:11,color:MUTED}}>{countLabel}</div>
      </div>
    </div>
  );
};

const CollectionsSection = ({tier, isAnonymous, onOpenCollection, onCreateCollection, onOpenUpgrade, isMobile}) => {
  // Anonymous users don't see Collections at all — they can't be Craft tier
  // and the marketing surface for them is the Plans modal in the nav.
  if (isAnonymous) return null;
  const isCraft = tier?.isCraft;
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(isCraft);
  useEffect(() => {
    if (!isCraft) return;
    let cancelled = false;
    listCollections().then(({data}) => {
      if (cancelled) return;
      setCollections(data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [isCraft]);

  const header = (
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
      <span style={{fontFamily:PF,fontSize:20,fontWeight:600,color:NAVY}}>Collections</span>
      {!isCraft && <LockIcon size={16} color={ACCENT} />}
      <InfoTooltip text={isCraft ? "Group related patterns — MKALs, designer bundles, or pattern sets — into a single shared progress view." : "Craft members organize MKALs and bundled patterns here. Tap to see what's inside."} />
    </div>
  );

  // Free / Pro: glass teaser card. Soft, inviting, premium preview — not a
  // wall. Same glass treatment as the rest of My Wovely so it reads as a
  // section of the same page, not an ad.
  if (!isCraft) {
    return (
      <div style={{gridColumn:"1 / -1", marginTop: 32}}>
        {header}
        <div onClick={onOpenUpgrade} style={{
          background: GLASS.bg, backdropFilter: GLASS.blur, WebkitBackdropFilter: GLASS.blur,
          borderRadius: GLASS.radius, border: GLASS.border, boxShadow: GLASS.shadow,
          padding: isMobile ? 20 : "28px 32px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: isMobile ? 16 : 24,
          transition: "transform 0.15s ease, box-shadow 0.15s ease",
        }} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 32px rgba(155,126,200,0.2)";}} onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow=GLASS.shadow;}}>
          <div style={{width: isMobile?52:64, height: isMobile?52:64, borderRadius:"50%", background:"linear-gradient(135deg, rgba(155,126,200,0.18), rgba(155,126,200,0.08))", display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <LockIcon size={isMobile?24:28} color={ACCENT} />
          </div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontFamily:PF,fontSize:isMobile?17:19,fontWeight:600,color:NAVY,marginBottom:4}}>Collections</div>
            <div style={{fontFamily:INTER,fontSize:isMobile?13:14,color:MUTED,lineHeight:1.5,marginBottom:isMobile?12:14}}>Organize your MKALs, group project patterns, and track multi-part makes.</div>
            <button onClick={(e)=>{e.stopPropagation();onOpenUpgrade();}} style={{
              background: ACCENT, color: "#fff", border: "none", borderRadius: 14,
              padding: isMobile ? "10px 20px" : "11px 24px", fontSize: 13, fontWeight: 600,
              cursor: "pointer", fontFamily: INTER,
              boxShadow:"0 4px 16px rgba(155,126,200,0.3)",
            }}>See plans</button>
          </div>
        </div>
      </div>
    );
  }

  // Craft: render the user's collections. Empty state has its own
  // glass card with a primary CTA so it doesn't feel like dead space.
  return (
    <div style={{gridColumn:"1 / -1", marginTop: 32}}>
      {header}
      {loading ? (
        <div style={{textAlign:"center", padding:"40px 0"}}>
          <div className="spinner" style={{width:24,height:24,border:`3px solid ${T.border}`,borderTopColor:ACCENT,borderRadius:"50%",margin:"0 auto"}}/>
        </div>
      ) : collections.length === 0 ? (
        <div style={{
          background: GLASS.bg, backdropFilter: GLASS.blur, WebkitBackdropFilter: GLASS.blur,
          borderRadius: GLASS.radius, border: GLASS.border, boxShadow: GLASS.shadow,
          padding: "32px 24px", textAlign: "center",
        }}>
          <div style={{fontFamily:PF,fontSize:18,fontWeight:600,color:NAVY,marginBottom:6}}>Start your first collection</div>
          <div style={{fontFamily:INTER,fontSize:13,color:MUTED,lineHeight:1.55,marginBottom:18,maxWidth:420,margin:"0 auto 18px"}}>Perfect for MKALs, designer bundles, and matching sets. Bev keeps the materials and progress in one place.</div>
          <button onClick={onCreateCollection} style={{
            background: ACCENT, color: "#fff", border: "none", borderRadius: 14,
            padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer",
            fontFamily: INTER, boxShadow: "0 4px 16px rgba(155,126,200,0.3)",
          }}>Create a Collection</button>
        </div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(3,1fr)",gap:isMobile?14:20}}>
          {collections.map(c => (
            <CollectionTile key={c.id} c={c} onOpen={() => onOpenCollection?.(c)} isMobile={isMobile} />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── MAIN COLLECTION VIEW ───────────────────────────────────────────────────
const CollectionView = ({userPatterns,starterPatterns,cat,setCat,search,setSearch,openDetail,onAddPattern,isPro,tier,setView,isAnonymous,onOpenCollection,onCreateCollection,onStartCollectionImport,onOpenUpgrade,onCollectionDeletedLocal,onPark,onUnpark,onDelete,onCoverChange,onRename,pct,catFallbackPhoto,Photo,Bar,Stars,CATS,TIER_CONFIG}) => {
  const{isDesktop,isMobile}=useBreakpoint();
  const allPatterns = [...userPatterns,...starterPatterns];
  // Patterns that belong to a collection (clue-of-MKAL etc.) are surfaced
  // through their collection card, not as standalone library cards. This
  // matches the spec: (collection_id IS NULL OR is_collection_part IS NOT true).
  const visible=allPatterns.filter(p=>p.status!=="deleted" && !(p.collection_id && p.is_collection_part === true));
  // Collections list — only fetched for Craft tier users. Anonymous and
  // Free/Pro users don't see collection cards in the library; for them
  // the contextual upgrade prompt lives on the PatternDetail after a
  // multi-part import (see App.jsx detail banner).
  const isCraft = !!tier?.isCraft;
  const [collections, setCollections] = useState([]);
  const [collectionsLoaded, setCollectionsLoaded] = useState(false);
  const [deleteTargetCollection, setDeleteTargetCollection] = useState(null);
  useEffect(() => {
    if (!isCraft) { setCollectionsLoaded(true); return; }
    let cancelled = false;
    listCollections().then(({data}) => {
      if (cancelled) return;
      setCollections(data || []);
      setCollectionsLoaded(true);
    });
    return () => { cancelled = true; };
  }, [isCraft]);
  // Map collection_id → parts pulled from the user's loaded patterns. No
  // extra fetch — collection parts are already in userPatterns; we just
  // bucket them. Used for the inline collection cards' progress numbers.
  const partsByCollection = (() => {
    const map = new Map();
    for (const p of allPatterns) {
      if (p.status === "deleted") continue;
      if (p.collection_id && p.is_collection_part === true) {
        const arr = map.get(p.collection_id) || [];
        arr.push(p);
        map.set(p.collection_id, arr);
      }
    }
    return map;
  })();
  const handleDeleteCollection = async (c) => {
    const { error } = await deleteCollection(c.id);
    if (error) { console.warn("[Wovely] deleteCollection failed:", error); return; }
    setCollections(prev => prev.filter(x => x.id !== c.id));
    setDeleteTargetCollection(null);
    // Parent owns userPatterns — let it drop the deleted clue patterns from
    // local state so they don't linger in Your Library as orphans.
    onCollectionDeletedLocal?.(c.id);
  };
  const starterPats=visible.filter(p=>p.isStarter);
  const addedPats=visible.filter(p=>!p.isStarter);
  const filteredAll=[...addedPats,...starterPats].filter(p=>(cat==="All"||p.cat===cat)&&(!search||p.title.toLowerCase().includes(search.toLowerCase())));
  // inProgress is computed from ALL active patterns (not just `visible`)
  // so a collection clue the user is currently working on can still be
  // the On the Hook hero — On the Hook surfaces collection context when
  // the hero is a collection part.
  const inProgress=allPatterns.filter(p=>p.status!=="deleted").filter(p=>{const v=pct(p);return !p.isStarter&&p.status!=="parked"&&(p.status==="in_progress"||p.started||(v>0&&v<100))&&v<100;}).sort((a,b)=>new Date(b.updated_at||0)-new Date(a.updated_at||0));
  const [viewMode,setViewMode]=useState("grid");
  const emptySlots=isPro?0:Math.max(0,TIER_CONFIG.free.patternCap-addedPats.length);

  return (
    <div style={{ minHeight: "100vh", background: "transparent" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "16px 16px 160px" : "24px 32px 80px", boxSizing: "border-box", width: "100%" }}>
        {/* Greeting — full width on every layout. */}
        <p style={{ fontFamily: PF, fontStyle: "italic", fontSize: 16, color: "#9B87B8", marginBottom: 20, marginTop: 4 }}>
          Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, here's your space.
        </p>

        <BevCorner patterns={visible} isMobile={isMobile} isPro={isPro} />

        {/* "On the Hook" section header sits above the grid so both
            columns align at their card top edges, not at the header
            text. The OnTheHook component renders without its own
            header (hideHeader=true) to avoid duplication. */}
        <OnTheHookHeader />

        {/* Above-the-fold area. Desktop with Craft Services panel =
            3fr/2fr two-column, align-items: stretch so the right column
            matches the left column's height (OnTheHook card + stats row).
            Anonymous (or mobile) collapses to single column — On the
            Hook takes full width and Craft Services stacks below (or is
            hidden entirely for anonymous). */}
        {(() => {
          const showCraftServices = !isAnonymous;
          const useTwoCol = !isMobile && showCraftServices;
          const leftCol = (
            <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
              <OnTheHook hideHeader inProgress={inProgress} openDetail={openDetail} onAddPattern={onAddPattern} pct={pct} catFallbackPhoto={catFallbackPhoto} Photo={Photo} isMobile={isMobile} collections={collections} partsByCollection={partsByCollection} />
              <BragShelf patterns={visible} pct={pct} isMobile={isMobile} />
            </div>
          );
          const rightCol = showCraftServices ? (
            <div style={{ minWidth: 0, display: "flex" }}>
              <CraftServicesPanel
                tier={tier}
                isAnonymous={isAnonymous}
                collections={collections}
                partsByCollection={partsByCollection}
                onOpenCollection={onOpenCollection}
                onStartCollectionImport={onStartCollectionImport}
                onOpenUpgrade={onOpenUpgrade}
              />
            </div>
          ) : null;
          if (useTwoCol) {
            return (
              <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 20, alignItems: "stretch", marginTop: 4 }}>
                {leftCol}
                {rightCol}
              </div>
            );
          }
          // Mobile or anonymous-desktop: stack. Anonymous gets no right col at all.
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 4 }}>
              {leftCol}
              {rightCol}
            </div>
          );
        })()}

        <div>
          {/* Your Library — full width */}
          <div id="your-library" style={{ marginTop: 32 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}><span style={{ fontFamily: PF, fontSize: 20, fontWeight: 600, color: NAVY }}>Your Library</span><InfoTooltip text="Every pattern you've saved — search, filter, and dive in anytime." /></div>
            {/* Search bar — glass */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", background: GLASS.bg, backdropFilter: GLASS.blur, WebkitBackdropFilter: GLASS.blur, border: GLASS.border, borderRadius: 12, padding: "10px 14px", gap: 9, boxShadow: GLASS.shadow }}>
                <span style={{ color: MUTED, fontSize: 15 }}>🔍</span>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search your patterns…" style={{ border: "none", background: "transparent", flex: 1, fontSize: 14, color: INK, outline: "none", fontFamily: INTER }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 16, WebkitOverflowScrolling: "touch" }}>
              {CATS.map(c=><button key={c} onClick={()=>setCat(c)} style={{background:cat===c?ACCENT:PILL_BG,color:cat===c?"#fff":ACCENT,border:"none",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",transition:"all .15s",flexShrink:0,textTransform:"uppercase",letterSpacing:".05em",fontFamily:INTER}}>{c}</button>)}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div>{!isPro&&<div style={{fontSize:12,color:MUTED,fontWeight:500,fontFamily:INTER}}>{tier.userCount} of {TIER_CONFIG.free.patternCap} free slots used{tier.userCount===0?" · add your first":tier.atCap?" · upgrade for unlimited":""}</div>}</div>
              <div style={{display:"flex",gap:4}}>
                <button onClick={()=>setViewMode("grid")} style={{background:viewMode==="grid"?PILL_BG:"transparent",border:`1px solid ${viewMode==="grid"?"#EDE4F7":"transparent"}`,borderRadius:6,padding:"4px 6px",cursor:"pointer",fontSize:12,color:MUTED,lineHeight:1}}>▦</button>
                <button onClick={()=>setViewMode("list")} style={{background:viewMode==="list"?PILL_BG:"transparent",border:`1px solid ${viewMode==="list"?"#EDE4F7":"transparent"}`,borderRadius:6,padding:"4px 6px",cursor:"pointer",fontSize:12,color:MUTED,lineHeight:1}}>☰</button>
              </div>
            </div>
            {/* Empty-state prompt moved out of the library grid — it now
                lives in the CollectionsPresence card above the fold so
                a Craft user with no collections sees it on landing. */}
            {viewMode==="grid"?(() => {
              // Build the library items list. Collection cards (Craft only)
              // are intermixed with patterns and sorted by recency so the
              // user's actively-worked items float up regardless of type.
              // "Recency" for a collection = max updated_at of its parts,
              // falling back to the collection row's own updated_at.
              const patternItems = filteredAll.map(p => ({
                kind: "pattern",
                key: `p_${p.id}`,
                ts: new Date(p.updated_at || p.created_at || 0).getTime(),
                pattern: p,
              }));
              const collectionItems = isCraft
                ? (collections || []).filter(c => cat === "All" && (!search || c.name.toLowerCase().includes(search.toLowerCase()))).map(c => {
                    const parts = partsByCollection.get(c.id) || [];
                    const latestPartTs = parts.reduce((m, p) => Math.max(m, new Date(p.updated_at || 0).getTime()), 0);
                    const colTs = new Date(c.updated_at || c.created_at || 0).getTime();
                    return {
                      kind: "collection",
                      key: `c_${c.id}`,
                      ts: Math.max(latestPartTs, colTs),
                      collection: c,
                      parts,
                    };
                  })
                : [];
              const items = [...patternItems, ...collectionItems].sort((a, b) => b.ts - a.ts);
              return (
                <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(3,1fr)",gap:isMobile?14:20}}>
                  {items.map((item, i) => item.kind === "collection"
                    ? <CollectionLibraryCard key={item.key} c={item.collection} parts={item.parts} delay={i*.04} onOpen={() => onOpenCollection?.(item.collection)} onDelete={(c) => setDeleteTargetCollection(c)} />
                    : <PatternCard key={item.key} p={item.pattern} delay={i*.04} onClick={()=>openDetail(item.pattern)} onPark={onPark} onUnpark={onUnpark} onDelete={onDelete} onCoverChange={onCoverChange} onRename={onRename} pct={pct} catFallbackPhoto={catFallbackPhoto} Photo={Photo} Bar={Bar} Stars={Stars}/>
                  )}
                  {!isPro&&cat==="All"&&!search&&Array.from({length:emptySlots}).map((_,i)=><EmptySlotCard key={"slot_"+i} slotIndex={i} onClick={onAddPattern}/>)}
                </div>
              );
            })() : (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {filteredAll.length===0&&<div style={{textAlign:"center",padding:"40px 20px",color:MUTED,fontSize:13}}>No patterns yet. Add your first!</div>}
                {filteredAll.map((p,i)=>(
                  <div key={p.id} className="fu" onClick={()=>openDetail(p)} style={{display:"flex",gap:12,background:GLASS.bg,backdropFilter:GLASS.blur,WebkitBackdropFilter:GLASS.blur,border:GLASS.border,borderRadius:GLASS.radius,padding:10,cursor:"pointer",animationDelay:i*.04+"s",boxShadow:GLASS.shadow}}>
                    <div style={{width:56,height:56,borderRadius:10,overflow:"hidden",flexShrink:0,background:T.linen}}><Photo src={p.cover_image_url||p.photo||catFallbackPhoto(p.cat)} alt={p.title} style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"center top"}}/></div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:T.serif,fontSize:15,fontWeight:600,color:INK,lineHeight:1.3}}>{p.title}</div>
                      <div style={{fontSize:12,color:MUTED,marginTop:2}}>{p.cat&&p.cat.toLowerCase()!=="uncategorized"?p.cat:""}{pct(p)>0?" · "+pct(p)+"%":""}{p.isStarter?" · Free Starter":""}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {deleteTargetCollection && (
        // Library-grid delete confirmation. Glass card + #C0544A button —
        // matches the style guide and the in-detail-view confirmation.
        <div onClick={() => setDeleteTargetCollection(null)} style={{ position: "fixed", inset: 0, zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(28,23,20,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", fontFamily: INTER }}>
          <div onClick={e => e.stopPropagation()} className="fu" style={{ background: GLASS.bg, backdropFilter: GLASS.blur, WebkitBackdropFilter: GLASS.blur, border: GLASS.border, borderRadius: GLASS.radius, boxShadow: "0 20px 60px rgba(45,58,124,0.28)", padding: 24, width: "100%", maxWidth: 380 }}>
            <div style={{ fontFamily: PF, fontSize: 18, fontWeight: 700, color: INK, marginBottom: 8 }}>Delete this collection?</div>
            <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.55, marginBottom: 20 }}>This permanently deletes the collection and all of its clues. This can't be undone.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteTargetCollection(null)} style={{ background: T.linen, border: `1px solid ${T.border}`, borderRadius: 99, padding: "9px 18px", fontSize: 13, color: T.ink2, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
              <button onClick={() => handleDeleteCollection(deleteTargetCollection)} style={{ background: "#C0544A", color: "#fff", border: "none", borderRadius: 99, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Delete Collection</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { PatternCard };
export default CollectionView;
