import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { T, useBreakpoint, Field } from "./theme.jsx";
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseAuth, getSession } from "./supabase.js";
import { PILL } from "./constants.js";
import PatternHeader from "./PatternHeader.jsx";
import RowManager, { ensureRepeatBrackets } from "./RowManager.jsx";
import { uploadPatternFile } from "./AddPatternModal.jsx";
import { listPatternsInCollection, partLabelFor } from "./utils/collections.js";
import { canAccessChartImages } from "./utils/featureGates.js";
import { fetchPatternImages, getPatternImageCount, renderAndUploadPendingImages, imageTypeLabel } from "./utils/patternImages.js";

const YarnSummaryCard = ({label, myKey, myVal, fallback, onSave}) => {
  const display = myVal || fallback;
  const isOverridden = !!myVal;
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(display);
  const [hover, setHover] = useState(false);
  const inputRef = useRef(null);

  useEffect(()=>{ if(editing && inputRef.current) inputRef.current.focus(); },[editing]);

  const commit = () => {
    const trimmed = val.trim();
    if(trimmed && trimmed !== fallback) onSave(myKey, trimmed);
    else onSave(myKey, null);
    setEditing(false);
  };
  const cancel = () => { setVal(display); setEditing(false); };
  const onKey = e => { if(e.key==="Enter") commit(); if(e.key==="Escape") cancel(); };

  if(editing) return (
    <div style={{background:"#fff",borderRadius:9,padding:"9px 11px",border:`1.5px solid ${T.terra}`}}>
      <div style={{fontSize:10,color:T.ink3,marginBottom:4}}>{label}</div>
      <input ref={inputRef} value={val} onChange={e=>setVal(e.target.value)} onBlur={commit} onKeyDown={onKey}
        style={{width:"100%",fontSize:16,fontWeight:700,fontFamily:T.serif,color:T.ink,border:"none",outline:"none",background:"transparent",padding:0}}/>
      {fallback&&<div style={{fontSize:9,color:T.ink3,marginTop:4,opacity:.7}}>Pattern suggests: {fallback}</div>}
    </div>
  );

  return (
    <div onClick={()=>{setVal(display);setEditing(true);}} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      style={{background:"rgba(255,255,255,.8)",borderRadius:9,padding:"9px 11px",cursor:"pointer",position:"relative",transition:"border-color .15s",border:hover?`1.5px solid ${T.terra}`:"1.5px solid transparent"}}>
      <div style={{fontSize:10,color:T.ink3,marginBottom:2}}>{label}</div>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <div style={{fontSize:16,fontWeight:700,fontFamily:T.serif,color:isOverridden?T.terra:T.ink,flex:1}}>{display}</div>
        <span style={{fontSize:12,opacity:hover?.7:.25,transition:"opacity .15s",flexShrink:0}}>✏️</span>
      </div>
      {isOverridden&&fallback&&<div style={{fontSize:9,color:T.ink3,marginTop:2,opacity:.7}}>Pattern suggests: {fallback}</div>}
      {!isOverridden&&<div style={{fontSize:9,color:T.ink3,marginTop:2,opacity:.5}}>Tap to log what you're using</div>}
    </div>
  );
};

const CoverImagePicker = ({pattern, onConfirm, onClose, pdfThumbUrl, CAT_IMG, ALL_CAT_ENTRIES}) => {
  const [tab,setTab]=useState("import");
  const [selected,setSelected]=useState(null);
  const [uploading,setUploading]=useState(false);
  const [importFailed,setImportFailed]=useState(false);
  const [importUrl,setImportUrl]=useState(null);
  const fileRef=useRef(null);

  const hasImport = !!(pattern.source_file_url || pattern.source_url);
  const isManual = !pattern.source_file_url && !pattern.source_url;

  // Auto-detect import cover on mount
  useEffect(()=>{
    if(isManual){setTab("photo");return;}
    if(pattern.source_file_url && pattern.source_file_url.endsWith(".pdf")){
      const thumb = pdfThumbUrl(pattern.source_file_url);
      if(thumb){
        const img=new Image();
        img.onload=()=>{setImportUrl(thumb);setSelected(thumb);};
        img.onerror=()=>setImportFailed(true);
        img.src=thumb;
      } else setImportFailed(true);
    } else if(pattern.photo && !PILL.includes(pattern.photo)){
      setImportUrl(pattern.photo);setSelected(pattern.photo);
    } else {
      setImportFailed(true);
    }
  },[]);

  const handleFileSelect = async(e) => {
    const file=e.target.files?.[0];if(!file)return;
    setUploading(true);
    const formData=new FormData();
    formData.append("file",file);
    formData.append("upload_preset","yarnhive_patterns");
    formData.append("transformation","c_fill,g_auto,ar_16:9");
    try{
      const res=await fetch("https://api.cloudinary.com/v1_1/dmaupzhcx/image/upload",{method:"POST",body:formData});
      if(res.ok){const data=await res.json();setSelected(data.secure_url);setTab("photo");}
    }catch{}
    setUploading(false);
  };

  const cat = pattern.cat || "Uncategorized";

  const TABS = [];
  if(hasImport) TABS.push({id:"import",label:"Use Import"});
  TABS.push({id:"photo",label:"Take a Photo"});
  TABS.push({id:"library",label:"Our Library"});

  return (
    <div style={{position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.sans}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(0,0,0,.6)"}}/>
      <div style={{position:"relative",zIndex:1,width:"100%",maxWidth:440,maxHeight:"85vh",background:T.modal,borderRadius:20,overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.3)",margin:16}}>
        {/* Header */}
        <div style={{padding:"18px 20px 0",flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontFamily:T.serif,fontSize:18,fontWeight:700,color:T.ink}}>Set Cover Image</div>
            <button onClick={onClose} style={{background:T.linen,border:"none",borderRadius:99,width:30,height:30,cursor:"pointer",fontSize:16,color:T.ink3,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
          {/* Tabs */}
          <div style={{display:"flex",gap:0,borderBottom:`1px solid ${T.border}`}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",borderBottom:tab===t.id?`2px solid ${T.terra}`:"2px solid transparent",padding:"10px 16px",fontSize:12,fontWeight:tab===t.id?700:500,color:tab===t.id?T.ink:T.ink3,cursor:"pointer"}}>{t.label}</button>
            ))}
          </div>
        </div>
        {/* Content */}
        <div style={{flex:1,overflow:"auto",padding:20}}>
          {tab==="import"&&(
            importFailed
              ?<div style={{textAlign:"center",padding:"24px 0"}}>
                <div style={{fontSize:13,color:T.ink3,lineHeight:1.6}}>We couldn't extract a cover from your file. Choose below.</div>
                <button onClick={()=>setTab("photo")} style={{background:T.terra,color:"#fff",border:"none",borderRadius:10,padding:"10px 20px",fontSize:13,fontWeight:600,cursor:"pointer",marginTop:16}}>Take a Photo</button>
              </div>
              :importUrl
                ?<div style={{textAlign:"center"}}>
                  <div style={{borderRadius:12,overflow:"hidden",border:selected===importUrl?`3px solid ${T.terra}`:`1px solid ${T.border}`,cursor:"pointer",display:"inline-block",position:"relative"}} onClick={()=>setSelected(importUrl)}>
                    <img src={importUrl} alt="Import cover" style={{width:"100%",maxWidth:300,display:"block",borderRadius:9}}/>
                    {selected===importUrl&&<div style={{position:"absolute",top:8,right:8,background:T.terra,color:"#fff",borderRadius:99,width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700}}>✓</div>}
                  </div>
                  <div style={{fontSize:11,color:T.ink3,marginTop:10}}>Extracted from your imported file</div>
                </div>
                :<div style={{textAlign:"center",padding:"24px 0"}}><div className="spinner" style={{width:24,height:24,border:`3px solid ${T.border}`,borderTopColor:T.terra,borderRadius:"50%",margin:"0 auto"}}/><div style={{fontSize:12,color:T.ink3,marginTop:10}}>Extracting cover...</div></div>
          )}
          {tab==="photo"&&(
            <div style={{textAlign:"center",padding:"16px 0"}}>
              <div style={{fontSize:13,color:T.ink3,lineHeight:1.6,marginBottom:16}}>Show off your work — use a photo of your finished object or your pattern cover</div>
              {selected&&!PILL.includes(selected)&&selected!==importUrl&&!Object.values(CAT_IMG).includes(selected)
                ?<div style={{marginBottom:16}}>
                  <div style={{borderRadius:12,overflow:"hidden",border:`3px solid ${T.terra}`,display:"inline-block",position:"relative"}}>
                    <img src={selected} alt="Your photo" style={{width:"100%",maxWidth:300,display:"block",borderRadius:9}}/>
                    <div style={{position:"absolute",top:8,right:8,background:T.terra,color:"#fff",borderRadius:99,width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700}}>✓</div>
                  </div>
                </div>
                :null}
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelect} style={{display:"none"}}/>
              <button onClick={()=>fileRef.current?.click()} disabled={uploading} style={{background:T.linen,border:`1.5px dashed ${T.terra}`,borderRadius:12,padding:"20px",cursor:"pointer",width:"100%",opacity:uploading?.6:1}}>
                <div style={{fontSize:24,marginBottom:6}}>{uploading?"⏳":"📷"}</div>
                <div style={{fontSize:13,color:T.terra,fontWeight:600}}>{uploading?"Uploading...":"Choose Photo or Take One"}</div>
              </button>
            </div>
          )}
          {tab==="library"&&(
            <div>
              <div style={{fontSize:12,color:T.ink3,marginBottom:12}}>Choose a category image</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                {ALL_CAT_ENTRIES.map(([cat,url])=>(
                  <div key={cat} onClick={()=>setSelected(url)} style={{borderRadius:10,overflow:"hidden",cursor:"pointer",border:selected===url?`3px solid ${T.terra}`:`1px solid ${T.border}`,position:"relative",aspectRatio:"1"}}>
                    <img src={url} alt={cat} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
                    <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(to top,rgba(0,0,0,.6),transparent)",padding:"16px 6px 4px"}}>
                      <span style={{color:"#fff",fontSize:9,fontWeight:600,letterSpacing:".06em"}}>{cat.toUpperCase()}</span>
                    </div>
                    {selected===url&&<div style={{position:"absolute",top:6,right:6,background:T.terra,color:"#fff",borderRadius:99,width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700}}>✓</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* Confirm button */}
        <div style={{padding:"12px 20px 20px",flexShrink:0,borderTop:`1px solid ${T.border}`}}>
          <button onClick={()=>{if(selected)onConfirm(selected);}} disabled={!selected} style={{width:"100%",background:selected?T.terra:"#ccc",color:"#fff",border:"none",borderRadius:12,padding:"14px",fontSize:15,fontWeight:600,cursor:selected?"pointer":"not-allowed",opacity:selected?1:.6,boxShadow:selected?"0 4px 16px rgba(155,126,200,.3)":"none"}}>Use this image</button>
        </div>
      </div>
    </div>
  );
};

const DeleteConfirmModal = ({pattern,isPro,onCancel,onDelete,onPark,onGoPro}) => (
  <div style={{position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:T.sans}}>
    <div onClick={onCancel} style={{position:"absolute",inset:0,background:"rgba(0,0,0,.4)"}}/>
    <div className="fu" style={{position:"relative",zIndex:1,width:"100%",maxWidth:380,background:T.modal,borderRadius:20,padding:"32px 28px",boxShadow:"0 16px 48px rgba(155,126,200,.18)"}}>
      <div style={{fontFamily:T.serif,fontSize:18,fontWeight:700,color:T.ink,marginBottom:8}}>Delete this pattern?</div>
      <div style={{fontSize:13,color:T.ink3,lineHeight:1.6,marginBottom:20}}>{isPro?"This pattern will be permanently removed.":"This pattern will be removed from your library. It will still count toward your pattern limit."}</div>
      {!isPro&&<>
        <button onClick={onPark} style={{width:"100%",background:T.sageLt,color:T.sage,border:`1px solid ${T.sage}`,borderRadius:12,padding:"12px",fontSize:13,fontWeight:600,cursor:"pointer",marginBottom:6}}>Park it instead</button>
        <div style={{fontSize:11,color:T.ink3,marginBottom:12,lineHeight:1.5,textAlign:"center"}}>Parking saves your progress and frees up your active view.<br/><span onClick={onGoPro} style={{color:T.terra,cursor:"pointer",fontWeight:600}}>Go Pro for unlimited patterns →</span></div>
      </>}
      <button onClick={onDelete} style={{width:"100%",background:"#C0544A",color:"#fff",border:"none",borderRadius:12,padding:"12px",fontSize:13,fontWeight:600,cursor:"pointer",marginBottom:6}}>Delete</button>
      <button onClick={onCancel} style={{width:"100%",background:T.linen,color:T.ink2,border:`1px solid ${T.border}`,borderRadius:12,padding:"11px",fontSize:13,fontWeight:500,cursor:"pointer"}}>Cancel</button>
    </div>
  </div>
);

const ScaleModal = ({pattern,onClose,Btn}) => {
  const orig=pattern.dimensions||{width:50,height:60},origGauge=pattern.gauge||{stitches:12,rows:16,size:4};
  const [newW,setNewW]=useState(String(orig.width)),[newH,setNewH]=useState(String(orig.height)),[gSt,setGSt]=useState(String(origGauge.stitches)),[gRo,setGRo]=useState(String(origGauge.rows));
  const scaleW=parseFloat(newW)/orig.width||1,scaleH=parseFloat(newH)/orig.height||1;
  const scaledYardage=Math.ceil((pattern.yardage||1000)*scaleW*scaleH),scaledSkeins=Math.ceil(scaledYardage/(pattern.skeinYards||200));
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(28,23,20,.6)",display:"flex",alignItems:"flex-end"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:"20px 20px 0 0",width:"100%",maxHeight:"85vh",overflow:"auto",padding:"24px 22px 40px"}}>
        <div style={{width:36,height:3,background:T.border,borderRadius:99,margin:"0 auto 20px"}}/>
        <div style={{fontFamily:T.serif,fontSize:22,color:T.ink,marginBottom:4}}>Pattern Scaling</div>
        <div style={{fontSize:13,color:T.ink3,marginBottom:20}}>Adjust dimensions to automatically recalculate stitch counts and yardage.</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
          {[["New Width (in)",newW,setNewW],["New Height (in)",newH,setNewH]].map(([label,val,set])=>(
            <div key={label}><div style={{fontSize:11,color:T.ink3,textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>{label}</div><input value={val} onChange={e=>set(e.target.value)} type="number" style={{width:"100%",padding:"12px",background:T.linen,border:`1.5px solid ${T.border}`,borderRadius:10,fontSize:16,fontWeight:600,color:T.ink,textAlign:"center",outline:"none"}} onFocus={e=>e.target.style.borderColor=T.terra} onBlur={e=>e.target.style.borderColor=T.border}/></div>
          ))}
        </div>
        <div style={{background:T.linen,borderRadius:14,padding:"16px",marginBottom:20}}>
          <div style={{fontFamily:T.serif,fontSize:14,color:T.ink,marginBottom:12}}>Gauge (per 4 inches)</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {[["Stitches",gSt,setGSt],["Rows",gRo,setGRo]].map(([label,val,set])=>(
              <div key={label}><div style={{fontSize:11,color:T.ink3,marginBottom:4}}>{label}</div><input value={val} onChange={e=>set(e.target.value)} type="number" style={{width:"100%",padding:"10px",background:"rgba(250,247,243,0.96)",border:`1px solid ${T.border}`,borderRadius:8,fontSize:15,fontWeight:600,color:T.ink,textAlign:"center",outline:"none"}}/></div>
            ))}
          </div>
        </div>
        <div style={{background:`linear-gradient(135deg,${T.terraLt},${T.card})`,borderRadius:14,padding:"16px",marginBottom:20,border:`1px solid ${T.border}`}}>
          <div style={{fontFamily:T.serif,fontSize:14,color:T.ink,marginBottom:12}}>Scaled Results</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["Starting stitches",Math.round((parseFloat(gSt)||12)/4*parseFloat(newW)||0)],["Total rows",Math.round((parseFloat(gRo)||16)/4*parseFloat(newH)||0)],["Yardage needed","~"+scaledYardage+" yds"],["Skeins needed",scaledSkeins+" skeins"],["Scale W",(scaleW*100).toFixed(0)+"%"],["Scale H",(scaleH*100).toFixed(0)+"%"]].map(([label,val])=>(
              <div key={label} style={{background:"rgba(255,255,255,.8)",borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:10,color:T.ink3,marginBottom:2}}>{label}</div><div style={{fontSize:18,fontWeight:700,fontFamily:T.serif,color:T.terra}}>{val}</div></div>
            ))}
          </div>
        </div>
        <div style={{fontSize:12,color:T.ink3,textAlign:"center",marginBottom:16,lineHeight:1.6}}>Original: {orig.width}" x {orig.height}" · {pattern.yardage||1000} yards</div>
        <Btn onClick={onClose} variant="secondary">Close</Btn>
      </div>
    </div>
  );
};

const ShareCardModal = ({pattern,onClose,pct,Btn}) => {
  const done=pct(pattern),isComplete=done===100;
  const [caption,setCaption]=useState(isComplete?"Just finished \""+pattern.title+"\"! 🧶 So happy with how this turned out.":"Working on \""+pattern.title+"\" — "+done+"% done! 🪡 Making progress!");
  const [shared,setShared]=useState(false);
  const shareText=caption+"\n\nMade with Wovely 📱 #crochet #wovely #crochetlife";
  const doShare=async(platformId)=>{
    if(platformId==="native"){if(navigator.share){try{await navigator.share({title:pattern.title,text:shareText,url:"https://wovely.app"});setShared(true);}catch(e){}}else{navigator.clipboard?.writeText(shareText);setShared(true);}}
    else{const e=encodeURIComponent(shareText),u=encodeURIComponent("https://wovely.app");const urls={twitter:"https://twitter.com/intent/tweet?text="+e,facebook:"https://www.facebook.com/sharer/sharer.php?u="+u+"&quote="+e,pinterest:"https://pinterest.com/pin/create/button/?description="+e+"&url="+u,instagram:"https://www.instagram.com/"};window.open(urls[platformId],"_blank","noopener,noreferrer,width=600,height=500");setShared(true);}
  };
  return (
    <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"flex-end"}} onClick={onClose}>
      <div className="dim-in" style={{position:"absolute",inset:0,background:"rgba(28,23,20,.65)",backdropFilter:"blur(4px)"}}/>
      <div className="su" onClick={e=>e.stopPropagation()} style={{position:"relative",background:T.surface,borderRadius:"24px 24px 0 0",width:"100%",padding:"24px 22px 48px",zIndex:1}}>
        <div style={{width:36,height:3,background:T.border,borderRadius:99,margin:"0 auto 20px"}}/>
        <div style={{background:`linear-gradient(135deg,${T.terra},#6B2A10)`,borderRadius:18,padding:"20px",marginBottom:16,position:"relative",overflow:"hidden"}}>
          <div style={{position:"relative"}}>
            <div style={{fontSize:11,color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>{isComplete?"🎉 Finished Object":"🪡 Build in Progress — "+done+"%"}</div>
            <div style={{fontFamily:T.serif,fontSize:22,fontWeight:700,color:"#fff",marginBottom:4,lineHeight:1.2}}>{pattern.title}</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.65)",marginBottom:12}}>{[pattern.hook&&"Hook "+pattern.hook,pattern.weight,pattern.cat].filter(Boolean).join(" · ")}</div>
            {!isComplete&&<div style={{background:"rgba(255,255,255,.15)",borderRadius:99,height:6,overflow:"hidden",marginBottom:10}}><div style={{width:done+"%",height:"100%",background:"#fff",borderRadius:99}}/></div>}
            {isComplete&&<div style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(255,255,255,.2)",borderRadius:99,padding:"5px 12px",fontSize:12,color:"#fff",fontWeight:600}}>✓ Complete</div>}
            <div style={{marginTop:12,fontSize:10,color:"rgba(255,255,255,.4)",letterSpacing:".08em"}}>WOVELY · wovely.app</div>
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:T.ink3,textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>Your caption</div>
          <textarea value={caption} onChange={e=>setCaption(e.target.value)} rows={3} style={{width:"100%",padding:"12px 14px",background:T.linen,border:`1.5px solid ${T.border}`,borderRadius:12,fontSize:13,color:T.ink,resize:"none",outline:"none",lineHeight:1.6,fontFamily:T.sans}} onFocus={e=>e.target.style.borderColor=T.terra} onBlur={e=>e.target.style.borderColor=T.border}/>
        </div>
        {shared?<div style={{textAlign:"center",padding:"16px 0"}}><div style={{fontSize:28,marginBottom:8}}>🎉</div><div style={{fontFamily:T.serif,fontSize:18,color:T.ink,marginBottom:4}}>Shared!</div><div style={{fontSize:13,color:T.ink3,marginBottom:16}}>Your progress is out in the world.</div><Btn onClick={onClose} variant="secondary">Done</Btn></div>
        :<><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>{[{id:"instagram",label:"Instagram",icon:"📸"},{id:"pinterest",label:"Pinterest",icon:"📌"},{id:"facebook",label:"Facebook",icon:"👥"},{id:"twitter",label:"X / Twitter",icon:"✖️"}].map(pl=><button key={pl.id} onClick={()=>doShare(pl.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"11px 14px",background:T.linen,border:`1.5px solid ${T.border}`,borderRadius:12,cursor:"pointer",fontSize:13,fontWeight:500,color:T.ink}}><span style={{fontSize:16}}>{pl.icon}</span>{pl.label}</button>)}</div>
        <Btn onClick={()=>doShare("native")}>📤 Share via...</Btn><div style={{marginTop:8}}><Btn variant="ghost" onClick={onClose}>Cancel</Btn></div></>}
      </div>
    </div>
  );
};

// Image-type pill used on each chart card and inside the lightbox header.
const ChartTypePill = ({ type }) => (
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

// Fullscreen image viewer with prev/next + swipe navigation. Pinch-zoom is
// handled natively by the browser via touch-action: pinch-zoom on the image —
// no custom transform math, no gesture state. Tap outside the image or hit
// the close button to dismiss.
const ChartLightbox = ({ images, startIndex, onClose }) => {
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

// Standard glass card per CLAUDE.md. Same treatment Dashboard uses.
const GLASS_CARD = {
  background: "rgba(255,255,255,0.82)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.45)",
  borderRadius: 16,
  boxShadow: "0 4px 24px rgba(45,58,124,0.08)",
};

// Bev-in-spinning-ring loading affordance per CLAUDE.md ("static Bev inside
// spinning ring"). Stays small so it fits inline with copy.
const BevInlineSpinner = ({ size = 24 }) => (
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

const ChartsAndImagesSection = ({ pattern, tier, isAnonymous, onShowUpgrade }) => {
  const patternId = pattern._supabaseId || pattern.id;
  const sourceFileUrl = pattern.source_file_url || null;
  const isCraft = canAccessChartImages(tier, isAnonymous);
  const { isDesktop } = useBreakpoint();

  // Locked (Pro/Free/Anon) path uses count-only query — keeps the locked card
  // out of the data path when there's nothing to advertise.
  const [lockedCount, setLockedCount] = useState(null);
  // Unlocked (Craft) path loads full rows and tracks the render-in-progress
  // state so the inline "Bev is extracting" copy can settle when done.
  const [images, setImages] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(null);

  useEffect(() => {
    if (!patternId) return;
    let cancelled = false;
    (async () => {
      if (!isCraft) {
        const { data } = await getPatternImageCount(patternId);
        if (!cancelled) setLockedCount(typeof data === "number" ? data : 0);
        return;
      }
      const { data } = await fetchPatternImages(patternId);
      if (cancelled) return;
      const rows = Array.isArray(data) ? data : [];
      setImages(rows);
      const hasPending = rows.some(r => !r.cloudinary_url);
      if (hasPending && sourceFileUrl) {
        setRendering(true);
        try {
          const updated = await renderAndUploadPendingImages({
            images: rows,
            sourceFileUrl,
            onProgress: (row) => {
              if (cancelled || !row) return;
              setImages(prev => (prev || []).map(p => p.id === row.id ? { ...p, cloudinary_url: row.cloudinary_url } : p));
            },
          });
          if (!cancelled) setImages(updated);
        } finally {
          if (!cancelled) setRendering(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [patternId, isCraft, sourceFileUrl]);

  // Locked render: hide entirely when there's nothing to upsell.
  if (!isCraft) {
    if (!lockedCount || lockedCount <= 0) return null;
    const charts = (lockedCount === 1) ? "1 chart or image" : `${lockedCount} charts and images`;
    return (
      <div style={{ ...GLASS_CARD, padding: "18px 18px", marginTop: 24, opacity: 0.95 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 16, color: "#2D2D4E", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ opacity: 0.6 }}>🔒</span>
              <span>Charts &amp; Images</span>
            </div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "#6B6B8A", lineHeight: 1.55 }}>
              Bev found {charts} in this pattern. Upgrade to Craft to see them on every page.
            </div>
          </div>
          <button
            onClick={onShowUpgrade}
            style={{
              background: "#9B7EC8", color: "#fff", border: "none",
              borderRadius: 99, padding: "8px 14px",
              fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
            }}
          >See plans</button>
        </div>
      </div>
    );
  }

  // Unlocked render. Three loading states:
  //   images === null   → first fetch in flight, render nothing
  //   images === []     → no classifications yet (extract-images still running,
  //                        or pattern has no PDF source) → show Bev spinner copy
  //                        only when source_file_url exists, otherwise omit.
  //   images.length > 0 → grid, with per-tile spinner for rows still rendering.
  if (images === null) return null;
  if (images.length === 0) {
    if (!sourceFileUrl) return null;
    return (
      <div style={{ ...GLASS_CARD, padding: "18px 18px", marginTop: 24, display: "flex", alignItems: "center", gap: 12 }}>
        <BevInlineSpinner size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 15, color: "#2D2D4E" }}>Charts &amp; Images</div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#6B6B8A", marginTop: 2 }}>Bev is looking through your pattern for charts and reference images…</div>
        </div>
      </div>
    );
  }

  const cols = isDesktop ? 3 : 2;
  return (
    <>
      <style>{`@keyframes wovelyChartsRing{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}`}</style>
      <div style={{ ...GLASS_CARD, padding: "18px 18px", marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 16, color: "#2D2D4E", flex: 1 }}>Charts &amp; Images</div>
          {rendering && <BevInlineSpinner size={20} />}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => img.cloudinary_url && setLightboxIdx(i)}
              disabled={!img.cloudinary_url}
              style={{
                background: "transparent", border: "none", padding: 0,
                cursor: img.cloudinary_url ? "pointer" : "default",
                textAlign: "left", fontFamily: "Inter, sans-serif",
              }}
              aria-label={img.caption || imageTypeLabel(img.image_type)}
            >
              <div style={{
                position: "relative", width: "100%", aspectRatio: "1",
                background: "#EDE4F7", borderRadius: 12, overflow: "hidden",
                border: "1px solid rgba(45,58,124,0.06)",
              }}>
                {img.cloudinary_url ? (
                  <img
                    src={img.cloudinary_url}
                    alt={img.caption || imageTypeLabel(img.image_type)}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    loading="lazy"
                  />
                ) : (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <BevInlineSpinner size={28} />
                  </div>
                )}
                <div style={{ position: "absolute", top: 8, left: 8 }}>
                  <ChartTypePill type={img.image_type} />
                </div>
              </div>
              {(img.caption || img.component_name) && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#2D2D4E", lineHeight: 1.4 }}>
                  {img.component_name && <div style={{ fontWeight: 600 }}>{img.component_name}</div>}
                  {img.caption && <div style={{ color: "#6B6B8A", marginTop: 2 }}>{img.caption}</div>}
                </div>
              )}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: "#6B6B8A", fontFamily: "Inter, sans-serif", textAlign: "center" }}>
          Tap any image to view full
        </div>
      </div>
      {lightboxIdx != null && (
        <ChartLightbox
          images={images.filter(i => i.cloudinary_url)}
          startIndex={Math.min(lightboxIdx, images.filter(i => i.cloudinary_url).length - 1)}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </>
  );
};

const Detail = ({p,onBack,onSave,pct,estYards,estSkeins,pdfThumbUrl,CSS,Bar,Photo,Stars,WireframeViewer,Btn,scrollToRow:initialScrollToRow,isAnonymous=false,onSignUp,collectionUpgrade,onCollectionUpgrade,onCollectionUpgradeDismiss,tier,onShowUpgrade}) => {
  const VALID_TABS=["materials","rows","notes"];
  const navigate = useNavigate();
  // Collection context — only populated when this pattern belongs to a
  // collection (is_collection_part + collection_id set). The fetch lives
  // here rather than in App.jsx so PatternDetail is self-contained for the
  // breadcrumb + clue-to-clue navigation it owns.
  const [collectionMeta, setCollectionMeta] = useState(null); // { id, name, siblings: [...] }
  useEffect(() => {
    if (!p.collection_id || !p.is_collection_part) { setCollectionMeta(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const s = getSession();
        if (!s?.access_token) return;
        // Two parallel reads — the collection row for the name/vernacular
        // + the sibling pattern list for the prev/next nav. Both are tiny.
        const [colRes, sibRes] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/collections?id=eq.${p.collection_id}&select=id,name,collection_type,part_label,expected_part_count`, {
            headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${s.access_token}` },
          }),
          listPatternsInCollection(p.collection_id),
        ]);
        if (cancelled) return;
        const colRows = colRes.ok ? await colRes.json() : [];
        const siblings = (sibRes?.data || []).filter(x => x.is_collection_part);
        if (colRows[0]) {
          setCollectionMeta({
            id: colRows[0].id,
            name: colRows[0].name || "Collection",
            type: colRows[0].collection_type || "general",
            partLabel: partLabelFor(colRows[0]),
            expectedPartCount: typeof colRows[0].expected_part_count === "number" ? colRows[0].expected_part_count : null,
            siblings,
          });
        }
      } catch (e) { console.warn("[Wovely] Collection context fetch failed:", e?.message); }
    })();
    return () => { cancelled = true; };
  }, [p.collection_id, p.is_collection_part, p.id, p._supabaseId]);

  // Resolve where this pattern sits within the collection. siblings are
  // already ordered by collection_order asc by the data layer.
  const currentPid = p._supabaseId || p.id;
  const siblings = collectionMeta?.siblings || [];
  const sibIndex = siblings.findIndex(s => String(s.id) === String(currentPid));
  const prevSibling = sibIndex > 0 ? siblings[sibIndex - 1] : null;
  const nextSibling = sibIndex >= 0 && sibIndex < siblings.length - 1 ? siblings[sibIndex + 1] : null;
  const isMkalCollection = collectionMeta?.type === "mkal";

  const collectionBack = collectionMeta
    ? () => navigate("/collections/" + collectionMeta.id)
    : null;
  const handleBack = collectionBack || onBack;

  const goToSibling = (sib) => {
    if (!sib) return;
    const sid = sib._supabaseId || sib.id;
    navigate("/pattern/" + encodeURIComponent(sid));
  };
  // No next clue imported yet — drop the user on the collection detail
  // view, which shows the "Import next clue" placeholder slot.
  const goToNextSlot = () => {
    if (collectionMeta?.id) navigate("/collections/" + collectionMeta.id);
  };
  // Auto-hide header on scroll down, show on scroll up (with iOS momentum debounce)
  const scrollRef=useRef(null);
  const lastScrollY=useRef(0);
  const upAccum=useRef(0);
  const [headerHidden,setHeaderHidden]=useState(false);
  useEffect(()=>{
    window.scrollTo(0,0);
  },[p.id||p._supabaseId]);
  useEffect(()=>{
    const onScroll=()=>{
      const y=window.scrollY||window.pageYOffset;
      if(y<=0){upAccum.current=0;setHeaderHidden(false);}
      else if(y>lastScrollY.current){upAccum.current=0;if(y>10) setHeaderHidden(true);}
      else if(y<lastScrollY.current){upAccum.current+=lastScrollY.current-y;if(upAccum.current>=15) setHeaderHidden(false);}
      lastScrollY.current=y;
    };
    window.addEventListener("scroll",onScroll,{passive:true});
    return ()=>window.removeEventListener("scroll",onScroll);
  },[]);
  const _initRows=ensureRepeatBrackets(p.rows);
  const _isFreshPattern=_initRows.filter(r=>!r.isHeader).every(r=>!r.done);
  const [rows,setRows]=useState(_initRows),[tab,setTab]=useState(()=>{if(initialScrollToRow!=null) return "rows";if(_isFreshPattern) return "materials";const saved=localStorage.getItem("yh_last_tab");return VALID_TABS.includes(saved)?saved:"materials";}),[editing,setEditing]=useState(false),[draft,setDraft]=useState({...p}),[showScale,setShowScale]=useState(false),[showShare,setShowShare]=useState(false),[milestone,setMilestone]=useState(null);
  useEffect(()=>{
    if(initialScrollToRow!=null&&tab==="rows"){
      setTimeout(()=>{
        const el=document.getElementById(`row-${initialScrollToRow}`);
        if(el) el.scrollIntoView({behavior:"smooth",block:"center"});
        else window.scrollTo({top:0,left:0,behavior:"instant"});
      },50);
    }
  },[]);// eslint-disable-line react-hooks/exhaustive-deps
  const [attachUploading,setAttachUploading]=useState(false);
  const [showYarnTip,setShowYarnTip]=useState(()=>!localStorage.getItem("yh_yarn_summary_tip_seen"));
  const [showPdfViewer,setShowPdfViewer]=useState(false);
  const isMobileDevice=typeof navigator!=="undefined"&&/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  // Wrap Cloudinary PDF URL in Google Docs viewer for cross-platform rendering
  const pdfViewerUrl=p.source_file_url?`https://docs.google.com/viewer?url=${encodeURIComponent(p.source_file_url)}&embedded=true`:null;
  const handleViewSource=()=>{
    if(!pdfViewerUrl)return;
    if(isMobileDevice) setShowPdfViewer(true);
    else window.open(pdfViewerUrl,"_blank","noopener,noreferrer");
  };

  // PDF thumb URL used for display fallback only — not persisted to Supabase
  // (Cloudinary on-the-fly PDF rendering is unreliable across plans)
  // Linear progress, row toggling, sub-counters, stitch pills — extracted to RowManager.jsx
  const attachRef=useRef(null);
  const handleAttachFile=async(e)=>{
    const file=e.target.files?.[0];if(!file)return;
    setAttachUploading(true);
    const result=await uploadPatternFile(file);
    setAttachUploading(false);
    if(result){
      const updated={...p,source_file_url:result.url,source_file_name:result.filename,source_file_type:result.type,rows};
      onSave(updated);
    }
  };
  const{isDesktop}=useBreakpoint();
  const done=pct({...p,rows});
  const save=()=>{onSave({...draft,rows});setEditing(false);};
  const yardDisplay=estYards(p)>0?"~"+estYards(p)+(p.yardage>0?" yds":" yds (est.)"):"Not listed";
  const skeinDisplay=estSkeins(p)>0?"~"+estSkeins(p)+(p.skeins>0?" skeins":" skeins (est.)"):"Not listed";
  const saveMyField=(key,val)=>{const updated={...p,rows,[key]:val||null};onSave(updated);};
  const detailPhoto=p.cover_image_url||pdfThumbUrl(p.source_file_url)||p.photo;
  return (
    <div style={{display:"flex",flexDirection:"column",minHeight:"100vh",background:T.bg}}>
      <CSS/>
      {showScale&&<ScaleModal pattern={p} onClose={()=>setShowScale(false)} Btn={Btn}/>}
      {showShare&&<ShareCardModal pattern={{...p,rows}} onClose={()=>setShowShare(false)} pct={pct} Btn={Btn}/>}
      {showPdfViewer&&p.source_file_url&&(
        <div style={{position:"fixed",inset:0,zIndex:600,display:"flex",flexDirection:"column",background:T.bg}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:`1px solid ${T.border}`,flexShrink:0,background:T.surface}}>
            <div style={{fontSize:13,fontWeight:600,color:T.ink}}>{p.source_file_name||"Source Pattern"}</div>
            <button onClick={()=>setShowPdfViewer(false)} style={{background:T.linen,border:"none",borderRadius:99,width:32,height:32,cursor:"pointer",fontSize:18,color:T.ink3,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
          <iframe src={pdfViewerUrl} title="Source Pattern" style={{flex:1,border:"none",width:"100%"}}/>
        </div>
      )}
      <div ref={scrollRef} style={{flex:1,WebkitOverflowScrolling:"touch"}}>
        <div style={{position:"sticky",top:0,zIndex:10,transform:headerHidden?"translateY(-100%)":"translateY(0)",transition:"transform 220ms ease"}}>
          <PatternHeader p={p} rows={rows} done={done} editing={editing} draft={draft} setDraft={setDraft} milestone={milestone} setMilestone={setMilestone} onBack={handleBack} backLabel={collectionMeta?.name} onShare={()=>setShowShare(true)} onScale={()=>setShowScale(true)} onEdit={()=>editing?save():setEditing(true)} onSave={save} detailPhoto={detailPhoto} Bar={Bar} Photo={Photo} WireframeViewer={WireframeViewer} onViewSource={handleViewSource}/>
          {collectionMeta && isMkalCollection && sibIndex >= 0 && (() => {
            // Part-to-part navigation. Only shown for MKAL collections —
            // general collections are unordered so prev/next doesn't apply.
            // Uses the collection's part_label vernacular (Clue / Part /
            // Chapter / etc) for all labels, and prefers expected_part_count
            // when the planner gave us a total.
            const label = collectionMeta.partLabel || "Part";
            const total = collectionMeta.expectedPartCount && collectionMeta.expectedPartCount > siblings.length
              ? collectionMeta.expectedPartCount
              : siblings.length;
            return (
              <div style={{
                background: T.surface, borderBottom: `1px solid ${T.border}`,
                padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                fontFamily: T.sans,
              }}>
                <button
                  onClick={() => goToSibling(prevSibling)}
                  disabled={!prevSibling}
                  style={{
                    background: "none", border: "none", padding: "4px 6px",
                    color: prevSibling ? T.terra : T.ink3,
                    cursor: prevSibling ? "pointer" : "default",
                    opacity: prevSibling ? 1 : 0.4,
                    fontSize: 12, fontWeight: 600, fontFamily: T.sans,
                    display: "flex", alignItems: "center", gap: 4, minWidth: 0, overflow: "hidden",
                  }}
                  aria-label={`Previous ${label.toLowerCase()}`}
                >
                  <span style={{ flexShrink: 0 }}>←</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {prevSibling ? `${label} ${sibIndex}` : ""}
                  </span>
                </button>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, fontFamily: T.serif, flexShrink: 0 }}>
                  {label} {sibIndex + 1} of {total}
                </div>
                <button
                  onClick={() => nextSibling ? goToSibling(nextSibling) : goToNextSlot()}
                  style={{
                    background: "none", border: "none", padding: "4px 6px",
                    color: T.terra,
                    cursor: "pointer",
                    fontSize: 12, fontWeight: 600, fontFamily: T.sans,
                    display: "flex", alignItems: "center", gap: 4, minWidth: 0, overflow: "hidden", justifyContent: "flex-end",
                  }}
                  aria-label={nextSibling ? `Next ${label.toLowerCase()}` : `Import next ${label.toLowerCase()}`}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {nextSibling ? `${label} ${sibIndex + 2}` : `Import ${label} ${sibIndex + 2}`}
                  </span>
                  <span style={{ flexShrink: 0 }}>→</span>
                </button>
              </div>
            );
          })()}
          <div style={{display:"flex",background:T.surface,borderBottom:`1px solid ${T.border}`}}>
            {[["materials","Materials"],["rows","Instructions/Rows"],["notes","My Notes"]].map(([key,label])=>(
              <button key={key} onClick={()=>{setTab(key);localStorage.setItem("yh_last_tab",key);}} style={{flex:1,padding:"13px 0",border:"none",background:"transparent",color:tab===key?T.terra:T.ink3,fontWeight:tab===key?600:400,fontSize:13,cursor:"pointer",borderBottom:"2px solid "+(tab===key?T.terra:"transparent"),transition:"color .15s"}}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{padding:`4px 20px ${isAnonymous?220:36}px`,maxWidth:isDesktop?760:undefined,margin:isDesktop?"0 auto":undefined,width:"100%"}}>
        {collectionUpgrade && (
          // Contextual upgrade banner for Free/Pro users whose just-imported
          // pattern looks like part of a larger project. Inline + dismissible
          // so it never blocks the row work. See-plans opens the standard
          // TieredUpgradeModal at the parent.
          <div style={{
            margin: "12px 0 18px",
            background: "rgba(155,126,200,0.10)",
            border: "1px solid rgba(155,126,200,0.32)",
            borderRadius: 14,
            padding: "12px 14px",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            fontFamily: T.sans,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.serif, fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 4, lineHeight: 1.3 }}>
                Bev found {collectionUpgrade.expected_part_count ? `${collectionUpgrade.expected_part_count} ${(collectionUpgrade.part_label || "part").toLowerCase()}s` : `multiple ${(collectionUpgrade.part_label || "part").toLowerCase()}s`} in this pattern
              </div>
              <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.55 }}>
                Upgrade to Craft to organize them as a collection — Bev keeps the materials and progress in one place.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
              <button onClick={onCollectionUpgrade} style={{ background: T.terra, color: "#fff", border: "none", borderRadius: 99, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>See plans</button>
              <button onClick={onCollectionUpgradeDismiss} aria-label="Dismiss" style={{ background: "transparent", border: "none", color: T.ink3, cursor: "pointer", fontSize: 16, padding: "4px 6px", lineHeight: 1 }}>×</button>
            </div>
          </div>
        )}
        {tab==="materials"&&(<>
          {(editing?draft.materials:p.materials).map((m,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:`1px solid ${T.border}`}}>
              <div style={{width:6,height:6,borderRadius:99,background:T.terra,flexShrink:0}}/>
              {editing?<div style={{display:"flex",gap:8,flex:1}}><input value={m.name} onChange={e=>{const a=[...draft.materials];a[i]={...a[i],name:e.target.value};setDraft({...draft,materials:a});}} style={{flex:1,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",fontSize:13,background:T.linen,color:T.ink,outline:"none"}}/><input value={m.amount} onChange={e=>{const a=[...draft.materials];a[i]={...a[i],amount:e.target.value};setDraft({...draft,materials:a});}} style={{width:80,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",fontSize:13,background:T.linen,color:T.ink,outline:"none"}}/></div>
              :<div style={{flex:1,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:14,color:T.ink2}}>{m.name}</span><span style={{fontSize:12,color:T.ink3,fontWeight:600}}>{m.amount}</span></div>}
            </div>
          ))}
          {editing&&<button onClick={()=>setDraft({...draft,materials:[...draft.materials,{id:Date.now(),name:"",amount:"",yardage:0}]})} style={{marginTop:14,width:"100%",border:`1.5px dashed ${T.border}`,background:"none",borderRadius:11,padding:"10px",color:T.ink3,cursor:"pointer",fontSize:13}}>+ Add material</button>}
          {showYarnTip&&<div style={{marginTop:16,background:T.linen,borderRadius:12,padding:"12px 14px",border:`1px solid ${T.border}`,display:"flex",alignItems:"flex-start",gap:10}}>
            <div style={{flex:1,fontSize:12,color:T.ink2,lineHeight:1.6}}>Using different yarn or hooks? Tap any card to log what you're actually using — we'll remember it every time you come back.</div>
            <button onClick={()=>{setShowYarnTip(false);localStorage.setItem("yh_yarn_summary_tip_seen","1");}} style={{background:"none",border:"none",color:T.ink3,cursor:"pointer",fontSize:16,padding:"0 2px",flexShrink:0,lineHeight:1,opacity:.6}}>×</button>
          </div>}
          <div style={{marginTop:showYarnTip?12:20,background:`linear-gradient(135deg,${T.terraLt},${T.card})`,borderRadius:14,padding:"14px 16px",border:`1px solid ${T.border}`}}>
            <div style={{fontFamily:T.serif,fontSize:14,color:T.ink,marginBottom:10}}>Yarn Summary</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <YarnSummaryCard label="Total yardage" myKey="my_yardage" myVal={p.my_yardage} fallback={yardDisplay} onSave={saveMyField}/>
              <YarnSummaryCard label="Skeins needed" myKey="my_skeins" myVal={p.my_skeins} fallback={skeinDisplay} onSave={saveMyField}/>
              <YarnSummaryCard label="Hook size" myKey="my_hook_size" myVal={p.my_hook_size} fallback={p.hook||"Not listed"} onSave={saveMyField}/>
              <YarnSummaryCard label="Yarn weight" myKey="my_yarn_weight" myVal={p.my_yarn_weight} fallback={p.weight||"Not listed"} onSave={saveMyField}/>
            </div>
            <button onClick={()=>setShowScale(true)} style={{marginTop:12,width:"100%",background:T.terra,color:"#fff",border:"none",borderRadius:10,padding:"10px",fontSize:13,fontWeight:600,cursor:"pointer"}}>⚖️ Scale pattern to different size →</button>
          </div>
        </>)}
        {tab==="rows"&&<RowManager p={p} rows={rows} setRows={setRows} onSave={onSave} editing={editing} setEditing={setEditing} setMilestone={setMilestone} Bar={Bar} onViewSource={handleViewSource} isAnonymous={isAnonymous} onSignUp={onSignUp}/>}
        {/* Source file direct link */}
        {tab==="materials"&&(
          <div style={{marginTop:16,borderTop:`1px solid ${T.border}`,paddingTop:14}}>
            <input ref={attachRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleAttachFile} style={{display:"none"}}/>
            {p.source_file_url?(
              <div style={{display:"flex",alignItems:"center",gap:8,background:T.linen,borderRadius:10,padding:"10px 14px",border:`1px solid ${T.border}`}}>
                <span style={{color:T.sage,fontSize:14}}>📄</span>
                <span style={{flex:1,fontSize:12,color:T.ink2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.source_file_name||"Attached file"}</span>
                <button onClick={()=>attachRef.current?.click()} style={{background:"none",border:"none",color:T.terra,cursor:"pointer",fontSize:11,fontWeight:600}}>Replace</button>
              </div>
            ):(
              <button onClick={()=>attachRef.current?.click()} disabled={attachUploading} style={{width:"100%",background:T.linen,border:`1.5px dashed ${T.border}`,borderRadius:10,padding:"12px",cursor:"pointer",fontSize:13,color:T.ink2,fontWeight:500,opacity:attachUploading?.6:1}}>{attachUploading?"Uploading…":"📎 Attach Pattern File"}</button>
            )}
          </div>
        )}
        {tab==="notes"&&(
          <div style={{paddingTop:10}}>
            {editing?<textarea value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} style={{width:"100%",minHeight:140,border:`1.5px solid ${T.border}`,borderRadius:12,padding:14,fontSize:14,lineHeight:1.75,resize:"vertical",outline:"none",color:T.ink,background:T.linen}} onFocus={e=>e.target.style.borderColor=T.terra} onBlur={e=>e.target.style.borderColor=T.border}/>
            :p.notes?<p style={{fontFamily:T.serif,fontStyle:"italic",fontSize:15,color:T.ink2,lineHeight:1.9,paddingTop:4,whiteSpace:"pre-wrap"}}>{p.notes}</p>
            :<div role="button" tabIndex={0} onClick={()=>{setDraft({...p});setEditing(true);}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setDraft({...p});setEditing(true);}}} onMouseEnter={e=>{e.currentTarget.style.background="rgba(155,126,200,0.08)";e.currentTarget.style.borderColor=T.terra;}} onMouseLeave={e=>{e.currentTarget.style.background=T.linen;e.currentTarget.style.borderColor=T.border;}} aria-label="Add your first note" style={{background:T.linen,border:`1.5px dashed ${T.border}`,borderRadius:12,padding:"20px 16px",cursor:"pointer",textAlign:"center",transition:"background .15s, border-color .15s",outline:"none"}}>
              <div style={{fontFamily:T.serif,fontStyle:"italic",fontSize:15,color:T.ink2,lineHeight:1.5}}>No notes yet.</div>
              <div style={{fontSize:12,color:T.ink3,marginTop:6}}>Tap to add your first note</div>
            </div>}
            <div style={{marginTop:20,display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:12,color:T.ink3}}>Rating</span><Stars val={editing?draft.rating:p.rating} ro={!editing} onChange={v=>setDraft({...draft,rating:v})}/></div>
            <div style={{marginTop:10,fontSize:12,color:T.ink3}}>Source: {p.source}</div>
          </div>
        )}
        <ChartsAndImagesSection pattern={p} tier={tier} isAnonymous={isAnonymous} onShowUpgrade={onShowUpgrade} />
        </div>
      </div>
      {/* Floating source pill now rendered inside RowManager */}
      {isAnonymous && (
        // Always-visible conversion surface for guests. Renders on every
        // tab (Materials / Instructions / Notes) so the CTA is on screen
        // without scrolling. Mirrors the inline glass card so the styling
        // language stays consistent — same heading, body copy, primary
        // button, and "Already have an account?" link.
        <div style={{
          position:"fixed",
          left:0,
          right:0,
          bottom:0,
          zIndex:100,
          background:"rgba(255,255,255,0.95)",
          backdropFilter:"blur(16px)",
          WebkitBackdropFilter:"blur(16px)",
          borderTop:"1px solid rgba(255,255,255,0.45)",
          boxShadow:"0 -4px 24px rgba(45,58,124,0.12)",
          padding: isDesktop ? "20px 24px" : "16px 16px",
          fontFamily:"Inter,sans-serif",
          textAlign:"center",
        }}>
          <div style={{maxWidth:600,margin:"0 auto"}}>
            <div style={{
              fontFamily:"'Playfair Display', Georgia, serif",
              fontSize: isDesktop ? 20 : 16,
              fontWeight:700,
              color:"#2D3A7C",
              lineHeight:1.25,
              marginBottom:6,
            }}>
              You're just getting started
            </div>
            <div style={{
              fontSize: isDesktop ? 14 : 13,
              color:"#6B6B8A",
              lineHeight:1.55,
              marginBottom:14,
            }}>
              Create a free account to see the full pattern, save your progress, and let Bev help you craft with confidence.
            </div>
            <button
              onClick={()=>onSignUp&&onSignUp()}
              style={{
                background:"#9B7EC8",
                color:"#fff",
                border:"none",
                borderRadius:12,
                padding: isDesktop ? "12px 28px" : "12px 16px",
                fontSize:14,
                fontWeight:600,
                cursor:"pointer",
                boxShadow:"0 4px 16px rgba(155,126,200,0.3)",
                width: isDesktop ? "auto" : "100%",
                minWidth: isDesktop ? 220 : undefined,
                marginBottom:10,
              }}
            >Create Free Account</button>
            <div style={{fontSize:13,color:"#6B6B8A"}}>
              Already have an account?{" "}
              <span
                onClick={()=>onSignUp&&onSignUp()}
                style={{color:"#9B7EC8",cursor:"pointer",fontWeight:600}}
              >Sign in</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ReadyToBuildPrompt = ({pattern,onStartBuilding,onViewDetails,onDismiss}) => (
  <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:T.sans}}>
    <div onClick={onDismiss} style={{position:"absolute",inset:0,background:"rgba(0,0,0,.35)"}}/>
    <div className="fu" style={{position:"relative",zIndex:1,width:"100%",maxWidth:360,background:T.modal,borderRadius:20,padding:"32px 28px",textAlign:"center",boxShadow:"0 16px 48px rgba(155,126,200,.18)"}}>
      <div style={{fontFamily:T.serif,fontSize:18,fontWeight:700,color:T.ink,marginBottom:6}}>Ready to start building?</div>
      <div style={{fontSize:13,color:T.ink3,marginBottom:20,lineHeight:1.5}}>{pattern?.title}</div>
      <button onClick={onStartBuilding} style={{width:"100%",background:T.terra,color:"#fff",border:"none",borderRadius:12,padding:"13px",fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(155,126,200,.3)",marginBottom:8}}>Start Building</button>
      <button onClick={onViewDetails} style={{width:"100%",background:T.linen,color:T.ink2,border:`1px solid ${T.border}`,borderRadius:12,padding:"12px",fontSize:13,fontWeight:500,cursor:"pointer"}}>View Details</button>
    </div>
  </div>
);

const PatternCreatedOverlay = ({pattern,onStartBuilding,onGoToHive}) => {
  useEffect(()=>{const t=setTimeout(onGoToHive,8000);return()=>clearTimeout(t);},[]);
  return (
    <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:T.sans}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.4)",backdropFilter:"blur(8px)"}}/>
      <div className="fu" style={{position:"relative",zIndex:1,width:"100%",maxWidth:420,background:T.modal,borderRadius:24,padding:"48px 40px",textAlign:"center",boxShadow:"0 20px 60px rgba(155,126,200,.2)"}}>
        <div style={{width:64,height:64,borderRadius:"50%",background:T.sageLt,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",fontSize:28}}>✓</div>
        <div style={{fontFamily:T.serif,fontSize:24,fontWeight:700,color:T.ink,marginBottom:8}}>Your pattern is ready to build</div>
        <div style={{fontFamily:T.serif,fontSize:18,color:T.terra,marginBottom:28}}>{pattern?.title||"Untitled Pattern"}</div>
        <button onClick={onStartBuilding} style={{width:"100%",background:T.terra,color:"#fff",border:"none",borderRadius:14,padding:"15px",fontSize:15,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(155,126,200,.3)",marginBottom:10}}>Start Building</button>
        <button onClick={onGoToHive} style={{width:"100%",background:T.linen,color:T.ink2,border:`1px solid ${T.border}`,borderRadius:14,padding:"14px",fontSize:14,fontWeight:500,cursor:"pointer"}}>Go to My Wovely</button>
      </div>
    </div>
  );
};

export { CoverImagePicker, DeleteConfirmModal, ReadyToBuildPrompt, PatternCreatedOverlay };
export default Detail;
