import { useState, useRef, useMemo } from "react";
import { T } from "./theme.jsx";

// ─── CLIENT-SIDE REPEAT BRACKET PARSER (for old patterns) ─────────────────
const parseRepeatBrackets = (text) => {
  const results = [];
  const re = /\(([^)]+)\)\s*[x×]\s*(\d+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    results.push({ sequence: m[1].trim(), count: parseInt(m[2]) });
  }
  return results;
};

export const ensureRepeatBrackets = (rows) => rows.map(r => {
  if (r.isHeader) return r;
  if (r.repeat_brackets && r.repeat_brackets.length > 0) return r;
  const parsed = parseRepeatBrackets(r.text || "");
  return parsed.length > 0 ? { ...r, repeat_brackets: parsed } : r;
});

// ─── DOT COLOR CYCLE ──────────────────────────────────────────────────────
const DOT_COLORS = [null, "#C0392B", "#F5C842", "#2980B9", "#27AE60"];
const nextDotColor = (current) => {
  const idx = DOT_COLORS.indexOf(current);
  return DOT_COLORS[(idx + 1) % DOT_COLORS.length];
};

const hasTrailingStitches = (row) => {
  const text = row.text || "";
  const re = /\([^)]+\)\s*[x×]\s*\d+/gi;
  let lastEnd = 0, m;
  while ((m = re.exec(text)) !== null) lastEnd = m.index + m[0].length;
  if (lastEnd === 0) return false;
  const after = text.slice(lastEnd).replace(/[\s,;—–\-]+/g, " ").replace(/\(\d+\)\s*$/, "").trim();
  return /[a-zA-Z]/.test(after);
};

const SubCounter = ({row, globalIdx, onDotTap, onRepeatDone}) => {
  const rb = (row.repeat_brackets || []).find(b => b.count > 1);
  if (!rb) return null;
  if (row.repeat_done) return (
    <div style={{paddingTop:8}} onClick={e => e.stopPropagation()}>
      <div style={{fontSize:11, color:T.ink3, marginBottom:6}}>Repeat complete — finish remaining stitches</div>
      <button onClick={() => onRepeatDone(globalIdx)} style={{background:T.terra, color:"#fff", border:"none", borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:600, cursor:"pointer"}}>Tap to finish row</button>
    </div>
  );
  const dots = row.dot_state && row.dot_state.length === rb.count ? row.dot_state : Array(rb.count).fill(null);
  return (
    <div style={{paddingTop:8}} onClick={e => e.stopPropagation()}>
      <div style={{fontSize:11, color:T.ink3, marginBottom:4}}>Repeat: {rb.sequence} × {rb.count}</div>
      <div style={{display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"}}>
        {dots.map((color, di) => (
          <div key={di} onClick={() => onDotTap(globalIdx, di)} style={{width:14, height:14, borderRadius:99, border: color ? "none" : "1.5px solid #ccc", background: color || "transparent", cursor:"pointer", transition:"all .15s"}} />
        ))}
      </div>
    </div>
  );
};

// ─── STITCH DICTIONARY & PILL MATCHING ────────────────────────────────────
const STITCH_DICT = {
  "SC":{full:"Single Crochet",url:"https://www.youtube.com/watch?v=JhBBqGBYAHo"},
  "HDC":{full:"Half Double Crochet",url:"https://www.youtube.com/watch?v=Ej-HjuFGUyQ"},
  "DC":{full:"Double Crochet",url:"https://www.youtube.com/watch?v=E4SqvLk0BPI"},
  "TR":{full:"Treble Crochet",url:"https://www.youtube.com/watch?v=6VNbHiHKntY"},
  "SL ST":{full:"Slip Stitch",url:"https://www.youtube.com/watch?v=sGnKTTPvFDA"},
  "SS":{full:"Slip Stitch",url:"https://www.youtube.com/watch?v=sGnKTTPvFDA"},
  "CH":{full:"Chain Stitch",url:"https://www.youtube.com/watch?v=fHAMQBhy09g"},
  "INC":{full:"Increase (2 sc in same st)",url:"https://www.youtube.com/watch?v=IQYHE6jt3_4"},
  "DEC":{full:"Decrease",url:"https://www.youtube.com/watch?v=QYbMPbcqQbE"},
  "SC2TOG":{full:"Single Crochet 2 Together",url:"https://www.youtube.com/watch?v=QYbMPbcqQbE"},
  "MR":{full:"Magic Ring",url:"https://www.youtube.com/watch?v=bUyaQiTOmVA"},
  "MC":{full:"Magic Circle",url:"https://www.youtube.com/watch?v=bUyaQiTOmVA"},
  "FO":{full:"Fasten Off",url:"https://www.youtube.com/watch?v=5w9hr_KNOBU"},
  "BLO":{full:"Back Loop Only",url:"https://www.youtube.com/watch?v=WP2grOxSdz0"},
  "FLO":{full:"Front Loop Only",url:"https://www.youtube.com/watch?v=WP2grOxSdz0"},
  "YO":{full:"Yarn Over",url:"https://www.youtube.com/watch?v=S0jxQ0vaMZk"},
  "PM":{full:"Place Marker",url:"https://www.youtube.com/watch?v=kHhBaJFDmgE"},
  "SM":{full:"Slip Marker",url:"https://www.youtube.com/watch?v=kHhBaJFDmgE"},
};
const ABBR_PATTERN=new RegExp("\\b("+Object.keys(STITCH_DICT).sort((a,b)=>b.length-a.length).map(k=>k.replace(/\s+/g,"\\s+")).join("|")+")\\b","gi");
const findNewAbbr=(text,seenAbbr)=>{
  const found=[],regex=new RegExp(ABBR_PATTERN.source,"gi");let match;
  while((match=regex.exec(text))!==null){const raw=match[0].toUpperCase().replace(/\s+/g," ");const info=STITCH_DICT[raw];if(!info)continue;if(!seenAbbr.has(raw)){seenAbbr.add(raw);found.push({raw,...info});}}
  return found;
};

// ─── pct helper ───────────────────────────────────────────────────────────
const pct = p => { const checkable=(p.rows||[]).filter(r=>!r.isHeader); return checkable.length ? Math.round(checkable.filter(r=>r.done).length/checkable.length*100) : 0; };

const RowManager = ({
  p,
  rows,
  setRows,
  onSave,
  editing,
  setEditing,
  setMilestone,
  Bar,
  onViewSource,
  isAnonymous = false,
  onSignUp,
}) => {
  const [noteEdit,setNoteEdit]=useState(null);
  const [expandedSections,setExpandedSections]=useState({});
  const [rowEditing,setRowEditing]=useState(null);
  const [newRow,setNewRow]=useState("");
  const [noteSaved,setNoteSaved]=useState(false);

  const prevDone=useRef(pct({...p,rows:p.rows}));
  const currentRowIdx=rows.findIndex(r=>!r.done&&!r.isHeader);

  // BevCheck flagged rows lookup — maps row number → status ("fail" | "warning")
  const flaggedRowMap=useMemo(()=>{
    const fr=p.validation_report?.flaggedRows;
    if(!fr||!fr.length) return null;
    const map={};
    fr.forEach(f=>{if(f.rowNumber!=null) map[f.rowNumber]=f.status;});
    return Object.keys(map).length?map:null;
  },[p.validation_report]);

  // ── Linear progress: section locking & row sequencing ──
  const linearSections=useMemo(()=>{
    const secs=[];let cur={header:null,rows:[]};
    rows.forEach((r,i)=>{if(r.isHeader){if(cur.header||cur.rows.length)secs.push(cur);cur={header:r,rows:[]};}else cur.rows.push({...r,_gi:i});});
    if(cur.header||cur.rows.length)secs.push(cur);
    return secs;
  },[rows]);
  const isSectionComplete=sec=>sec.rows.length>0&&sec.rows.every(r=>r.done);
  const isAssemblySection=sec=>sec.header&&/assembly|finishing/i.test(sec.header.text);
  const isSectionIndependent=sec=>!!sec.header?.independent;
  const isSectionLocked=()=>false;
  const isRowCheckable=(globalIdx,sec,si)=>{
    if(isSectionLocked(sec,si))return false;
    const idxInSec=sec.rows.findIndex(r=>r._gi===globalIdx);
    if(idxInSec<0)return false;
    if(rows[globalIdx].done)return true;
    for(let j=0;j<idxInSec;j++){if(!sec.rows[j].done)return false;}
    return true;
  };
  const findSection=(globalIdx)=>{for(let si=0;si<linearSections.length;si++){if(linearSections[si].rows.some(r=>r._gi===globalIdx))return si;}return -1;};

  const handleDotTap=(globalIdx,dotIdx)=>{
    const row=rows[globalIdx];if(!row)return;
    const si=findSection(globalIdx);
    if(si>=0&&!isRowCheckable(globalIdx,linearSections[si],si))return;
    const rb=(row.repeat_brackets||[]).find(b=>b.count>1);if(!rb)return;
    const dots=[...(row.dot_state&&row.dot_state.length===rb.count?row.dot_state:Array(rb.count).fill(null))];
    dots[dotIdx]=nextDotColor(dots[dotIdx]);
    const nextRows=rows.map((r,i)=>i===globalIdx?{...r,dot_state:dots}:r);
    if(dots.every(c=>c!==null)){
      if(hasTrailingStitches(row)){
        const partial=nextRows.map((r,i)=>i===globalIdx?{...r,repeat_done:true,dot_state:dots}:r);
        setRows(partial);onSave({...p,rows:partial});return;
      }
      const autoCheck=nextRows.map((r,i)=>i===globalIdx?{...r,done:true,dot_state:dots}:r);
      setRows(autoCheck);onSave({...p,rows:autoCheck});
      const newDone=pct({...p,rows:autoCheck}),prev2=prevDone.current;for(const m of [25,50,75,100]){if(prev2<m&&newDone>=m){setMilestone(m);break;}}prevDone.current=newDone;return;
    }
    setRows(nextRows);onSave({...p,rows:nextRows});
  };

  const handleRepeatDone=(globalIdx)=>{
    const next=rows.map((r,i)=>i===globalIdx?{...r,done:true,repeat_done:false}:r);
    setRows(next);onSave({...p,rows:next});
    const newDone=pct({...p,rows:next}),prev=prevDone.current;
    for(const m of [25,50,75,100]){if(prev<m&&newDone>=m){setMilestone(m);break;}}
    prevDone.current=newDone;
  };

  const toggle=id=>{
    const r=rows.find(x=>x.id===id);if(r?.isHeader)return;
    const globalIdx=rows.findIndex(x=>x.id===id);
    const secIdx=findSection(globalIdx);
    if(secIdx<0)return;
    if(!isRowCheckable(globalIdx,linearSections[secIdx],secIdx))return;
    const wasChecked=r.done;
    let next;
    if(wasChecked){
      const sec=linearSections[secIdx];
      const idxInSec=sec.rows.findIndex(sr=>sr._gi===globalIdx);
      const toUncheck=new Set(sec.rows.slice(idxInSec+1).map(sr=>sr._gi));
      if(isSectionComplete(sec)){
        for(let si2=0;si2<linearSections.length;si2++){
          if(si2===secIdx)continue;
          const s2=linearSections[si2];
          if(isSectionIndependent(s2))continue;
          const dependsOnThis=isAssemblySection(s2)||(si2>secIdx&&(()=>{for(let k=si2-1;k>=0;k--){if(!isSectionIndependent(linearSections[k]))return k===secIdx;}return false;})());
          if(dependsOnThis)s2.rows.forEach(sr=>toUncheck.add(sr._gi));
        }
      }
      next=rows.map((row,i)=>{
        if(i===globalIdx){
          const updated={...row,done:false,repeat_done:false};
          if(row.dot_state){const rb2=(row.repeat_brackets||[]).find(b=>b.count>1);updated.dot_state=Array(rb2?rb2.count:0).fill(null);}
          return updated;
        }
        if(!toUncheck.has(i))return row;
        const updated={...row,done:false,repeat_done:false};
        if(row.dot_state){const rb2=(row.repeat_brackets||[]).find(b=>b.count>1);updated.dot_state=Array(rb2?rb2.count:0).fill(null);}
        return updated;
      });
    } else {
      next=rows.map(row=>{if(row.id!==id)return row;return{...row,done:true};});
    }
    setRows(next);onSave({...p,rows:next});
    const newDone=pct({...p,rows:next}),prev=prevDone.current;
    for(const m of [25,50,75,100]){if(prev<m&&newDone>=m){setMilestone(m);break;}}
    prevDone.current=newDone;
  };

  const saveRowText=(id,newText)=>{if(!newText.trim())return;const next=rows.map(r=>r.id===id?{...r,text:newText.trim()}:r);setRows(next);onSave({...p,rows:next});setRowEditing(null);};
  const addRow=()=>{if(!newRow.trim())return;const next=[...rows,{id:Date.now(),text:newRow.trim(),done:false,note:""}];setRows(next);onSave({...p,rows:next});setNewRow("");};
  const updateNote=(id,note)=>{const next=rows.map(r=>r.id===id?{...r,note}:r);setRows(next);onSave({...p,rows:next});setNoteSaved(true);setTimeout(()=>setNoteSaved(false),2000);};

  return (
    <>
      {/* Pattern Notes — designer's read-only preamble. Reads pattern_notes
          only (post-migration 007 split); notes is the user's journal and
          belongs to My Notes, not here. No fallback between the two. */}
      {p.pattern_notes&&<div style={{marginBottom:12}}>
        <button onClick={()=>setNoteEdit(noteEdit==="pnotes"?null:"pnotes")} style={{width:"100%",background:T.linen,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:13,color:T.ink2,fontWeight:500}}>📋 Pattern Notes — tap to expand</span>
          <span style={{fontSize:12,color:T.ink3}}>{noteEdit==="pnotes"?"▼":"▶"}</span>
        </button>
        {noteEdit==="pnotes"&&<div style={{background:T.linen,border:`1px solid ${T.border}`,borderTop:"none",borderRadius:"0 0 10px 10px",padding:"12px 14px",fontSize:13,color:T.ink2,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{p.pattern_notes}</div>}
      </div>}
      {rows.length===0?(
        <div style={{textAlign:"center",padding:"48px 20px"}}>
          <div style={{fontSize:40,marginBottom:14}}>🧶</div>
          <div style={{fontFamily:T.serif,fontSize:18,fontWeight:600,color:T.ink2,marginBottom:8}}>No rows added yet</div>
          <div style={{fontSize:13,color:T.ink3,lineHeight:1.6,marginBottom:20}}>Add rows to start building this pattern step by step.</div>
          <button onClick={()=>{if(!editing)setEditing(true);}} style={{background:T.terra,color:"#fff",border:"none",borderRadius:12,padding:"12px 24px",fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(155,126,200,.3)"}}>Add Rows</button>
        </div>
      ):(()=>{
        const seenAbbr=new Set();
        return linearSections.map((sec,si)=>{
          const secKey=sec.header?.id||"sec-"+si;
          const countable=sec.rows.filter(r=>!r.isNoteOnly);
          const secDone=countable.filter(r=>r.done).length;
          const secTotal=countable.length;
          const secComplete=secTotal>0&&secDone===secTotal;
          const defaultOpen=sec.rows.some(r=>!r.done)||!sec.header;
          const open=expandedSections[secKey]!==undefined?expandedSections[secKey]:defaultOpen;
          const toggleSec=()=>setExpandedSections(prev=>({...prev,[secKey]:!open}));
          // Guest preview: show only the first 25% of rows in each section.
          // Per-section truncation gives a tease of every component instead
          // of cutting off the first component partway through and leaving
          // later components invisible.
          const previewLimit = isAnonymous ? Math.max(1, Math.ceil(sec.rows.length * 0.25)) : sec.rows.length;
          const visibleRows = sec.rows.slice(0, previewLimit);
          const hiddenRowCount = sec.rows.length - visibleRows.length;
          return (<div key={secKey} style={{marginBottom:8}}>
            {sec.header&&<button onClick={toggleSec} style={{width:"100%",background:secComplete?T.sageLt:T.linen,border:`1px solid ${secComplete?"rgba(92,122,94,.3)":T.border}`,borderRadius:open?"10px 10px 0 0":10,padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,textAlign:"left"}}>
              <span style={{fontSize:12,color:T.ink3}}>{open?"▼":"▶"}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:secComplete?T.sage:T.terra}}>{sec.header.text.replace(/──/g,"").trim()}{secComplete?" ✓":""}</div>
                <div style={{fontSize:11,color:T.ink3,marginTop:2}}>{isAnonymous?`Showing ${visibleRows.length} of ${sec.rows.length} rows`:`${secDone} of ${secTotal} complete`}</div>
              </div>
              {sec.header.makeCount>1&&<div style={{background:T.gold,color:"#fff",borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700}}>×{sec.header.makeCount}</div>}
              <div style={{width:60}}><Bar val={secTotal?secDone/secTotal*100:0} color={secComplete?T.sage:T.terra} h={3}/></div>
            </button>}
            {(open||!sec.header)&&<div style={{border:sec.header?`1px solid ${T.border}`:"none",borderTop:"none",borderRadius:sec.header?"0 0 10px 10px":0,overflow:"hidden",position:"relative"}}>
              {visibleRows.map((r,i)=>{const globalIdx=r._gi;const isCurrent=globalIdx===currentRowIdx;const rowLocked=!r.done&&!isRowCheckable(globalIdx,sec,si);const newAbbr=r.done?[]:findNewAbbr(r.text,seenAbbr);const rowNumFromId=r.id?parseInt((String(r.id).match(/\d+$/)||[])[0],10):null;const flagStatus=flaggedRowMap&&rowNumFromId?flaggedRowMap[rowNumFromId]:null;return(
        <div key={r.id} id={`row-${i + 1}`} data-row={i + 1} style={{borderBottom:`1px solid ${T.border}`,background:flagStatus==="fail"?"rgba(192,84,74,0.08)":flagStatus==="warning"?"rgba(201,168,76,0.08)":r.isAction&&!rowLocked?"rgba(184,144,44,.06)":"transparent",borderLeft:flagStatus==="fail"?"3px solid #C0544A":flagStatus==="warning"?"3px solid #C9A84C":"none"}}>
          <div onClick={()=>{if(!rowLocked)toggle(r.id);}} style={{display:"flex",gap:13,alignItems:"flex-start",cursor:rowLocked?"default":"pointer",background:isCurrent&&!rowLocked?"rgba(155,126,200,.04)":"transparent",padding:"14px 8px",margin:"0 -8px",opacity:rowLocked?.45:1,transition:"opacity .15s"}}>
            <div style={{width:26,height:26,borderRadius:7,flexShrink:0,marginTop:1,background:r.done?T.terra:rowLocked?"#E8E4DF":T.surface,border:"1.5px solid "+(r.done?T.terra:isCurrent&&!rowLocked?T.terra:rowLocked?"#D5D0CA":T.border),display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s",boxShadow:r.done?"0 2px 8px rgba(155,126,200,.3)":isCurrent&&!rowLocked?"0 0 0 3px rgba(155,126,200,.15)":"none"}}>
              {r.done&&<span style={{color:"#fff",fontSize:13,fontWeight:700}}>✓</span>}{!r.done&&isCurrent&&!rowLocked&&<div style={{width:8,height:8,borderRadius:99,background:T.terra}}/>}
            </div>
            <div style={{flex:1,minWidth:0}}>
              {isCurrent&&!rowLocked&&<div style={{fontSize:10,color:T.terra,fontWeight:600,letterSpacing:".06em",marginBottom:2}}>CURRENT ROW</div>}
              {!isCurrent&&r.isAction&&!rowLocked&&<div style={{fontSize:10,color:T.gold,fontWeight:600,letterSpacing:".06em",marginBottom:2}}>ACTION</div>}
              {!isCurrent&&!r.isAction&&!rowLocked&&<div style={{fontSize:10,color:flagStatus==="fail"?"#C0544A":flagStatus==="warning"?"#C9A84C":T.ink3,letterSpacing:".06em",marginBottom:2}}>{flagStatus==="fail"?"✗ ":flagStatus==="warning"?"⚠ ":""}ROW {i+1}</div>}
              {rowLocked&&<div style={{fontSize:10,color:T.ink3,letterSpacing:".06em",marginBottom:2}}>ROW {i+1}</div>}
              {rowEditing?.id===r.id
                ?<div style={{display:"flex",gap:6,alignItems:"center"}} onClick={e=>e.stopPropagation()}>
                  <input autoFocus value={rowEditing.text} onChange={e=>setRowEditing({...rowEditing,text:e.target.value})} onKeyDown={e=>{if(e.key==="Enter")saveRowText(r.id,rowEditing.text);if(e.key==="Escape")setRowEditing(null);}} style={{flex:1,padding:"6px 10px",background:T.linen,border:`1.5px solid ${T.terra}`,borderRadius:8,fontSize:13,color:T.ink,outline:"none",lineHeight:1.5}}/>
                  <button onClick={()=>saveRowText(r.id,rowEditing.text)} style={{background:T.sage,border:"none",borderRadius:6,padding:"5px 8px",color:"#fff",fontSize:12,cursor:"pointer",fontWeight:700}}>✓</button>
                  <button onClick={()=>setRowEditing(null)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 8px",color:T.ink3,fontSize:12,cursor:"pointer"}}>✕</button>
                </div>
                :<div style={{fontSize:14,lineHeight:1.6,color:r.done?T.ink3:rowLocked?"#B8B2AA":T.ink,textDecoration:r.done?"line-through":"none"}}>{r.text}</div>}
            </div>
            {!rowLocked&&rowEditing?.id!==r.id&&<div style={{display:"flex",gap:2,flexShrink:0}}>
              <button onClick={e=>{e.stopPropagation();setRowEditing({id:r.id,text:r.text});setNoteEdit(null);}} style={{background:"none",border:"none",fontSize:13,cursor:"pointer",padding:"4px",color:T.ink3,opacity:.5}} title="Edit row">✏️</button>
              <button onClick={e=>{e.stopPropagation();setNoteEdit(noteEdit===r.id?null:r.id);}} style={{background:"none",border:"none",fontSize:14,cursor:"pointer",padding:"4px"}}><span style={{color:r.note?T.terra:T.ink3,opacity:r.note?1:.5}}>📝</span></button>
            </div>}
          </div>
          {!r.done&&!rowLocked&&((r.repeat_brackets||[]).some(b=>b.count>1)||r.repeat_done)&&<div style={{padding:"0 8px 10px 47px"}}><SubCounter row={r} globalIdx={globalIdx} onDotTap={handleDotTap} onRepeatDone={handleRepeatDone}/></div>}
          {r.note&&noteEdit!==r.id&&!rowLocked&&<div onClick={e=>{e.stopPropagation();setNoteEdit(r.id);}} style={{padding:"0 8px 10px 47px",fontSize:12,color:T.ink3,lineHeight:1.5,cursor:"pointer"}}><span style={{fontSize:11}}>📌</span> <span style={{fontStyle:"italic"}}>{r.note}</span></div>}
          {newAbbr.length>0&&!rowLocked&&<div style={{padding:"0 8px 10px 47px",display:"flex",flexWrap:"wrap",gap:4}} onClick={e=>e.stopPropagation()}>{newAbbr.map(a=><button key={a.raw} onClick={e=>{e.stopPropagation();window.open(a.url,"_blank","noopener,noreferrer");}} style={{background:"transparent",color:T.terra,border:"1px solid rgba(155,126,200,0.4)",borderRadius:4,padding:"2px 6px",fontSize:10,fontWeight:500,cursor:"pointer"}}>{a.raw}</button>)}</div>}
          {noteEdit===r.id&&!rowLocked&&<div style={{padding:"0 8px 12px 47px",display:"flex",alignItems:"center",gap:8}}><input value={r.note} onChange={e=>updateNote(r.id,e.target.value)} placeholder="Add a note for this row…" style={{flex:1,padding:"9px 12px",background:T.linen,border:`1.5px solid ${T.terra}`,borderRadius:9,fontSize:13,color:T.ink,outline:"none"}}/>{noteSaved&&<span style={{fontSize:11,color:T.sage,fontWeight:600,flexShrink:0}}>Note saved</span>}</div>}
        </div>
      );})}
              {isAnonymous && hiddenRowCount > 0 && (
                <div style={{padding:"12px 14px 4px",fontSize:12,color:T.ink3,textAlign:"center",fontStyle:"italic"}}>
                  {hiddenRowCount} more {hiddenRowCount===1?"row":"rows"} after the preview
                </div>
              )}
            </div>}
          </div>);
        });
      })()}
      {isAnonymous ? (
        // Guest preview wall — fade overlay above a glass CTA card. Renders
        // after the truncated rows so the page reads "first taste, then a
        // gentle nudge to convert". onSignUp opens the AuthWallModal in
        // convert-anonymous-to-real mode so the same UUID + pattern carries
        // forward without a reimport.
        <div style={{position:"relative",marginTop:8}}>
          <div style={{
            position:"absolute",
            top:-80,
            left:0,
            right:0,
            height:80,
            background:"linear-gradient(to bottom, rgba(248,246,255,0) 0%, rgba(248,246,255,1) 100%)",
            pointerEvents:"none",
          }}/>
          <div style={{
            background:"rgba(255,255,255,0.82)",
            backdropFilter:"blur(16px)",
            WebkitBackdropFilter:"blur(16px)",
            border:"1px solid rgba(255,255,255,0.45)",
            borderRadius:16,
            boxShadow:"0 4px 24px rgba(45,58,124,0.08)",
            padding:"28px 24px",
            textAlign:"center",
          }}>
            <div style={{
              fontFamily:"'Playfair Display', Georgia, serif",
              fontSize:22,
              fontWeight:700,
              color:"#2D3A7C",
              lineHeight:1.25,
              marginBottom:8,
            }}>
              You're just getting started
            </div>
            <div style={{
              fontFamily:"Inter,sans-serif",
              fontSize:14,
              color:"#6B6B8A",
              lineHeight:1.6,
              marginBottom:20,
              maxWidth:360,
              margin:"0 auto 20px",
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
                padding:"13px 28px",
                fontSize:14,
                fontWeight:600,
                cursor:"pointer",
                boxShadow:"0 4px 16px rgba(155,126,200,0.3)",
                marginBottom:12,
              }}
            >Create Free Account</button>
            <div style={{fontSize:12.5,color:"#6B6B8A"}}>
              Already have an account?{" "}
              <span
                onClick={()=>onSignUp&&onSignUp()}
                style={{color:"#9B7EC8",cursor:"pointer",fontWeight:600}}
              >Sign in</span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{display:"flex",gap:8,marginTop:16}}>
          <input value={newRow} onChange={e=>setNewRow(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addRow()} placeholder="Add a row or step…" style={{flex:1,border:`1.5px solid ${T.border}`,borderRadius:11,padding:"10px 14px",fontSize:13,color:T.ink,background:T.linen,outline:"none"}} onFocus={e=>e.target.style.borderColor=T.terra} onBlur={e=>e.target.style.borderColor=T.border}/>
          <button onClick={addRow} style={{background:T.terra,color:"#fff",border:"none",borderRadius:11,padding:"10px 18px",fontSize:22,cursor:"pointer",lineHeight:1,boxShadow:"0 4px 12px rgba(155,126,200,.35)"}}>+</button>
        </div>
      )}
      {/* Floating source pattern pill */}
      {p.source_file_url&&onViewSource&&<button onClick={onViewSource} style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",zIndex:200,background:T.terra,color:"#fff",border:"none",borderRadius:999,padding:"12px 24px",fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(155,126,200,.4)",whiteSpace:"nowrap"}}>📄 View Source Pattern →</button>}
    </>
  );
};

export default RowManager;
