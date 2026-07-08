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
        /* ── SNAP & STITCH SPLIT HERO ── */
        <div style={{flexShrink:0,background:"#2E2748",marginTop:milestone?56:0,transition:"margin .3s"}}>
          {/* top bar */}
          <div style={{position:"relative",zIndex:2,padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <button onClick={onBack} style={{background:"rgba(255,255,255,.12)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,.15)",borderRadius:10,padding:"7px 16px",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:500}}>{backText}</button>
            <div style={{display:"flex",gap:8}}>
              {p.source_file_url&&onViewSource&&<button onClick={onViewSource} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.15)",borderRadius:10,padding:"7px 14px",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:600}}>📄 Source</button>}
              <button onClick={onShare} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.15)",borderRadius:10,padding:"7px 14px",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:600}}>📤 Share</button>
              <button onClick={onScale} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.15)",borderRadius:10,padding:"7px 14px",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:600}}>⚖️ Scale</button>
              <button onClick={onEdit} style={{background:editing?T.terra:"rgba(255,255,255,.1)",border:"1px solid "+(editing?T.terra:"rgba(255,255,255,.15)"),borderRadius:10,padding:"7px 16px",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:600}}>{editing?"Save":"Edit"}</button>
            </div>
          </div>
          {/* split panel */}
          <div style={{display:"grid",gridTemplateColumns:isDesktop?"1fr 1fr":"1fr 1fr",height:isDesktop?340:240,position:"relative"}}>
            {/* left: photo — contain so full subject always visible */}
            <div style={{position:"relative",overflow:"hidden",background:"#0E0A08"}}>
              <Photo src={detailPhoto} alt={p.title} style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"center top"}}/>
              <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(14,10,8,.85) 0%,transparent 45%)"}}/>
              <div style={{position:"absolute",bottom:14,left:14,right:0}}>
                {editing
                  ?<input value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} style={{width:"90%",background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.3)",borderRadius:8,padding:"5px 8px",color:"#fff",fontSize:16,fontFamily:T.serif,outline:"none"}}/>
                  :<div style={{fontFamily:T.serif,fontSize:isDesktop?20:15,fontWeight:700,color:"#fff",lineHeight:1.2,paddingRight:8}}>{p.title}</div>}
              </div>
              {/* Snap & Stitch badge */}
              <div style={{position:"absolute",top:10,left:10,background:"rgba(123,106,212,.9)",borderRadius:8,padding:"3px 9px",fontSize:9,fontWeight:700,color:"#fff",display:"flex",alignItems:"center",gap:4}}>
                ✨ Snap & Stitch · {p.snapConfidence}%
              </div>
            </div>
            {/* right: interactive wireframe */}
            <div style={{position:"relative",background:"#F5F2FF",borderLeft:"1px solid rgba(255,255,255,.08)"}}>
              <WireframeViewer components={p.snapComponents} labeled={true} fillContainer={true}/>
              <div style={{position:"absolute",top:10,right:10,background:"rgba(28,23,20,.55)",backdropFilter:"blur(6px)",borderRadius:8,padding:"3px 9px",fontSize:9,color:"rgba(255,255,255,.8)",fontWeight:600,pointerEvents:"none"}}>
                3D Component Map
              </div>
            </div>
          </div>
          {/* progress bar row */}
          <div style={{padding:"10px 18px 12px",background:"#2E2748"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1}}><Bar val={done} color={T.terra} h={3} bg="rgba(255,255,255,.15)"/></div>
              <span style={{color:"rgba(255,255,255,.7)",fontSize:12,fontWeight:600,minWidth:36}}>{done}%</span>
              <span style={{color:"rgba(255,255,255,.35)",fontSize:11}}>{rows.filter(r=>r.done).length}/{rows.length} rows</span>
            </div>
          </div>
        </div>
      ) : (
        /* ── STANDARD PHOTO HERO — blurred backdrop treatment ── */
        <div style={{position:"relative",flexShrink:0,height:isDesktop?260:220,overflow:"hidden",background:T.terra,marginTop:milestone?56:0,transition:"margin .3s"}}>
          {/* Layer 1: blurred backdrop */}
          {(detailPhoto||p.photo)&&<img src={detailPhoto||p.photo} alt="" style={{position:"absolute",width:"100%",height:"100%",objectFit:"cover",filter:"blur(20px) saturate(1.2) brightness(0.6)",transform:"scale(1.1)",pointerEvents:"none"}}/>}
          {/* Layer 2: sharp centered image */}
          {detailPhoto&&<img src={detailPhoto} alt={p.title} style={{position:"absolute",left:"50%",transform:"translateX(-50%)",height:"100%",width:"auto",objectFit:"contain",zIndex:1}}/>}
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(20,14,10,.88) 0%,rgba(20,14,10,.2) 50%,rgba(20,14,10,.05) 100%)",zIndex:2}}/>
          <div style={{position:"absolute",top:0,left:0,right:0,padding:"14px 18px",display:"flex",justifyContent:"space-between",zIndex:3}}>
            <button onClick={onBack} style={{background:"rgba(15,10,8,.45)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,.15)",borderRadius:10,padding:"7px 16px",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:500}}>{backText}</button>
            <div style={{display:"flex",gap:8}}>
              {p.source_file_url&&onViewSource&&<button onClick={onViewSource} style={{background:"rgba(15,10,8,.45)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,.15)",borderRadius:10,padding:"7px 14px",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:600}}>📄 Source</button>}
              <button onClick={onShare} style={{background:"rgba(15,10,8,.45)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,.15)",borderRadius:10,padding:"7px 14px",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:600}}>📤 Share</button>
              <button onClick={onScale} style={{background:"rgba(15,10,8,.45)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,.15)",borderRadius:10,padding:"7px 14px",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:600}}>⚖️ Scale</button>
              <button onClick={onEdit} style={{background:editing?T.terra:"rgba(15,10,8,.45)",backdropFilter:"blur(8px)",border:"1px solid "+(editing?T.terra:"rgba(255,255,255,.15)"),borderRadius:10,padding:"7px 16px",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:600}}>{editing?"Save":"Edit"}</button>
            </div>
          </div>
          <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"0 20px 14px",zIndex:3}}>
            {editing
              ?<input value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} style={{width:"100%",background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.3)",borderRadius:8,padding:"6px 10px",color:"#fff",fontSize:19,fontFamily:T.serif,outline:"none"}}/>
              :<div style={{fontFamily:T.serif,fontSize:isDesktop?24:20,fontWeight:700,color:"#fff",lineHeight:1.2}}>{p.title}</div>}
            <div style={{marginTop:10,display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1}}><Bar val={done} color={T.terra} h={4} bg="rgba(255,255,255,.25)"/></div>
              <span style={{color:"#fff",fontSize:13,fontWeight:600,minWidth:36}}>{done}%</span>
            </div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:3}}>{rows.filter(r=>r.done).length} of {rows.length} rows complete</div>
          </div>
        </div>
      )}
    </>
  );
};

export default PatternHeader;
