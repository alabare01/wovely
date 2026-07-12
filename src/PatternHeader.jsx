import { T, useBreakpoint } from "./theme.jsx";

const PatternHeader = ({
  p,
  rows,
  done,
  editing,
  draft,
  setDraft,
  milestone,
  setMilestone,
  onBack,
  backLabel,
  onShare,
  onScale,
  onEdit,
  onSave,
  detailPhoto,
  Bar,
  Photo,
  WireframeViewer,
  onViewSource,
}) => {
  // Back-button label. When the pattern belongs to a collection, the parent
  // supplies "← <Collection Name>" so the breadcrumb hint is visible without
  // a separate breadcrumb row. Falls back to plain "← Back".
  const backText = backLabel ? `← ${backLabel}` : "← Back";
  const{isDesktop}=useBreakpoint();

  return (
    <>
      {milestone&&(
        <div className="su" style={{position:"fixed",top:0,left:0,right:0,zIndex:400,background:milestone===100?"linear-gradient(135deg,"+T.sage+",#2D4A2F)":"linear-gradient(135deg,"+T.terra+",#7B5FB5)",padding:"14px 20px",display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontSize:28}}>{milestone===100?"🎉":"🪡"}</div>
          <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700,color:"#fff"}}>{milestone===100?"Pattern complete!":milestone+"% done — keep going!"}</div><div style={{fontSize:12,color:"rgba(255,255,255,.75)",marginTop:2}}>Share your progress with your followers</div></div>
          <button onClick={()=>{onShare();setMilestone(null);}} style={{background:"rgba(255,255,255,.2)",border:"none",borderRadius:10,padding:"8px 14px",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0}}>Share 📤</button>
          <button onClick={()=>setMilestone(null)} style={{background:"none",border:"none",color:"rgba(255,255,255,.6)",fontSize:18,cursor:"pointer",flexShrink:0,padding:"4px"}}>×</button>
        </div>
      )}
      {/* ── HERO: Snap & Stitch patterns get split photo+wireframe, others get clean fixed-height photo ── */}
      {p.snapConfidence&&p.snapComponents?.length ? (
        /* ── SNAP & STITCH HERO — 2b light phero (Wovely App 2b.dc.html): cover
             card holds the live component map, BevCheck badge + ink title +
             action pills, snap confidence surfaced on the map. ── */
        (() => {
          const rowsDone = rows.filter(r=>r.done).length;
          const paction = { display:"inline-flex",alignItems:"center",gap:7,background:"#fff",border:`1px solid ${T.line}`,borderRadius:12,padding:"9px 14px",fontWeight:800,fontSize:13.5,color:T.ink,cursor:"pointer",fontFamily:T.body };
          return (
          <div style={{flexShrink:0,background:`${T.crosshatch},${T.bg}`,padding:isDesktop?"18px 40px 22px":"14px 18px 18px",marginTop:milestone?56:0,transition:"margin .3s"}}>
            <button onClick={onBack} style={{display:"inline-flex",alignItems:"center",gap:8,background:"#fff",border:`1px solid ${T.line}`,borderRadius:12,padding:"10px 16px",fontFamily:T.body,fontWeight:800,fontSize:14,color:T.ink,cursor:"pointer",marginBottom:18}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 5.5l-7 6.5 7 6.5"/></svg>{backText.replace(/^←\s*/,"")}
            </button>
            <div style={{display:"grid",gridTemplateColumns:isDesktop?"300px 1fr":"1fr",gap:isDesktop?30:16,alignItems:"start"}}>
              {/* Cover — live component map in a 2b light card */}
              <div style={{position:"relative",height:isDesktop?230:190,borderRadius:22,overflow:"hidden",background:T.linen,border:`1px solid ${T.line}`}}>
                <WireframeViewer components={p.snapComponents} labeled={true} fillContainer={true}/>
                {/* Snap confidence signal */}
                <div style={{position:"absolute",top:12,left:12,display:"inline-flex",alignItems:"center",gap:6,background:T.accent,borderRadius:999,padding:"5px 11px",fontSize:11,fontWeight:800,color:"#fff",fontFamily:T.body,pointerEvents:"none"}}>
                  ✨ Snap &amp; Stitch · {p.snapConfidence}%
                </div>
                {/* Component map label */}
                <div style={{position:"absolute",bottom:12,left:12,background:"rgba(255,255,255,.9)",border:`1px solid ${T.line}`,borderRadius:999,padding:"4px 11px",fontSize:11,fontWeight:700,color:T.muted,fontFamily:T.body,pointerEvents:"none"}}>
                  Component map
                </div>
              </div>
              {/* Right column */}
              <div style={{minWidth:0}}>
                <div style={{display:"inline-flex",alignItems:"center",gap:9,background:"#EAF7F1",color:"#1E8A63",border:"1px solid #CDEBDE",fontWeight:800,fontSize:13,padding:"8px 14px",borderRadius:999}}>
                  <img src="/bev-sm.png" alt="Bev" style={{width:24,height:24,borderRadius:"50%"}}/>BevCheck passed · snapped and mapped
                </div>
                {editing
                  ? <input value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} style={{width:"100%",marginTop:14,background:"#fff",border:`1.5px solid ${T.line}`,borderRadius:12,padding:"8px 12px",color:T.ink,fontSize:isDesktop?30:24,fontFamily:T.disp,fontWeight:600,outline:"none"}}/>
                  : <h1 style={{fontFamily:T.disp,fontWeight:600,fontSize:isDesktop?36:26,letterSpacing:"-.01em",margin:"14px 0 0",lineHeight:1.05,color:T.ink}}>{p.title}</h1>}
                <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>
                  {p.source_file_url&&onViewSource&&<button onClick={onViewSource} style={paction}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 3.5H7.5A1.5 1.5 0 006 5v14a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0018 19V8z"/><path d="M13.5 3.5V8H18"/></svg>Source</button>}
                  <button onClick={onShare} style={paction}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6.5" cy="12" r="2.3"/><circle cx="17" cy="6.2" r="2.3"/><circle cx="17" cy="17.8" r="2.3"/><path d="M8.5 10.9l6.4-3.6M8.5 13.1l6.4 3.6"/></svg>Share</button>
                  <button onClick={onScale} style={paction}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9.5V4.5H9M20 14.5V19.5H15M4.5 5l6 6M19.5 19l-6-6"/></svg>Scale</button>
                  <button onClick={onEdit} style={{...paction,...(editing?{background:T.accent,color:"#fff",borderColor:T.accent}:{})}}>{editing?"Save":"Edit"}</button>
                </div>
                <div style={{marginTop:16,display:"flex",alignItems:"center",gap:12,maxWidth:420}}>
                  <div style={{flex:1,height:9,borderRadius:999,background:"#ECE6F8",overflow:"hidden"}}><span style={{display:"block",height:"100%",width:`${done}%`,borderRadius:999,background:"linear-gradient(90deg,#7B6AD4,#C98BE0)"}}/></div>
                  <span style={{fontFamily:T.disp,fontWeight:600,fontSize:15,color:T.accent}}>{done}%</span>
                </div>
                <div style={{fontWeight:700,fontSize:12.5,color:T.muted,marginTop:6}}>{rowsDone} of {rows.length} rows · Bev saved your spot</div>
              </div>
            </div>
          </div>
          );
        })()
      ) : (
        /* ── STANDARD HERO — 2b light phero (Wovely App 2b.dc.html): cover card
             + BevCheck badge + ink title + action pills. ── */
        (() => {
          const cover = detailPhoto || p.photo || null;
          const rowsDone = rows.filter(r=>r.done).length;
          const paction = { display:"inline-flex",alignItems:"center",gap:7,background:"#fff",border:`1px solid ${T.line}`,borderRadius:12,padding:"9px 14px",fontWeight:800,fontSize:13.5,color:T.ink,cursor:"pointer",fontFamily:T.body };
          return (
          <div style={{flexShrink:0,background:`${T.crosshatch},${T.bg}`,padding:isDesktop?"18px 40px 22px":"14px 18px 18px",marginTop:milestone?56:0,transition:"margin .3s"}}>
            <button onClick={onBack} style={{display:"inline-flex",alignItems:"center",gap:8,background:"#fff",border:`1px solid ${T.line}`,borderRadius:12,padding:"10px 16px",fontFamily:T.body,fontWeight:800,fontSize:14,color:T.ink,cursor:"pointer",marginBottom:18}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 5.5l-7 6.5 7 6.5"/></svg>{backText.replace(/^←\s*/,"")}
            </button>
            <div style={{display:"grid",gridTemplateColumns:isDesktop?"300px 1fr":"1fr",gap:isDesktop?30:16,alignItems:"start"}}>
              {/* Cover — blurred coverfill card */}
              <div style={{position:"relative",height:isDesktop?230:190,borderRadius:22,overflow:"hidden",background:"#EDE7F7",border:`1px solid ${T.line}`}}>
                {cover
                  ? <>
                      <div style={{position:"absolute",inset:0,backgroundImage:`url('${cover}')`,backgroundSize:"cover",backgroundPosition:"center",filter:"blur(22px) saturate(1.15)",transform:"scale(1.22)"}}/>
                      <Photo src={cover} alt={p.title} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain",objectPosition:"center",zIndex:1}}/>
                    </>
                  : <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.disp,fontSize:44,color:T.accent,opacity:.5}}>{(p.title||"?")[0]}</div>}
              </div>
              {/* Right column */}
              <div style={{minWidth:0}}>
                <div style={{display:"inline-flex",alignItems:"center",gap:9,background:"#EAF7F1",color:"#1E8A63",border:"1px solid #CDEBDE",fontWeight:800,fontSize:13,padding:"8px 14px",borderRadius:999}}>
                  <img src="/bev-sm.png" alt="Bev" style={{width:24,height:24,borderRadius:"50%"}}/>{p.isStarter?"BevCheck passed · free Wovely original":"BevCheck passed · pattern validated"}
                </div>
                {editing
                  ? <input value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} style={{width:"100%",marginTop:14,background:"#fff",border:`1.5px solid ${T.line}`,borderRadius:12,padding:"8px 12px",color:T.ink,fontSize:isDesktop?30:24,fontFamily:T.disp,fontWeight:600,outline:"none"}}/>
                  : <h1 style={{fontFamily:T.disp,fontWeight:600,fontSize:isDesktop?36:26,letterSpacing:"-.01em",margin:"14px 0 0",lineHeight:1.05,color:T.ink}}>{p.title}</h1>}
                <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>
                  {p.source_file_url&&onViewSource&&<button onClick={onViewSource} style={paction}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 3.5H7.5A1.5 1.5 0 006 5v14a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0018 19V8z"/><path d="M13.5 3.5V8H18"/></svg>Source</button>}
                  <button onClick={onShare} style={paction}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6.5" cy="12" r="2.3"/><circle cx="17" cy="6.2" r="2.3"/><circle cx="17" cy="17.8" r="2.3"/><path d="M8.5 10.9l6.4-3.6M8.5 13.1l6.4 3.6"/></svg>Share</button>
                  <button onClick={onScale} style={paction}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9.5V4.5H9M20 14.5V19.5H15M4.5 5l6 6M19.5 19l-6-6"/></svg>Scale</button>
                  <button onClick={onEdit} style={{...paction,...(editing?{background:T.accent,color:"#fff",borderColor:T.accent}:{})}}>{editing?"Save":"Edit"}</button>
                </div>
                <div style={{marginTop:16,display:"flex",alignItems:"center",gap:12,maxWidth:420}}>
                  <div style={{flex:1,height:9,borderRadius:999,background:"#ECE6F8",overflow:"hidden"}}><span style={{display:"block",height:"100%",width:`${done}%`,borderRadius:999,background:"linear-gradient(90deg,#7B6AD4,#C98BE0)"}}/></div>
                  <span style={{fontFamily:T.disp,fontWeight:600,fontSize:15,color:T.accent}}>{done}%</span>
                </div>
                <div style={{fontWeight:700,fontSize:12.5,color:T.muted,marginTop:6}}>{rowsDone} of {rows.length} rows · Bev saved your spot</div>
              </div>
            </div>
          </div>
          );
        })()
      )}
    </>
  );
};

export default PatternHeader;
