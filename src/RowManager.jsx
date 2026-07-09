import { useState, useRef, useMemo, useEffect } from "react";
import { T } from "./theme.jsx";
import { isReferenceChip } from "./utils/docType.js";

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

// ─── DOT COLOR CYCLE (Design System 2b: coral → sun → sky → mint) ─────────
const DOT_COLORS = [null, "#FF8A73", "#FFC24B", "#6FB7F0", "#5EC9AE"];
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
          <div key={di} onClick={() => onDotTap(globalIdx, di)} onMouseEnter={e=>e.currentTarget.style.transform="scale(1.2)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"} style={{width:15, height:15, borderRadius:99, border: color ? "none" : "1.5px dashed #C9BBEC", background: color || "transparent", cursor:"pointer", transition:"transform .15s"}} />
        ))}
      </div>
    </div>
  );
};

// ─── STITCH DICTIONARY & PILL MATCHING ────────────────────────────────────
const STITCH_DICT = {
  "SC":{full:"Single Crochet"},
  "HDC":{full:"Half Double Crochet"},
  "DC":{full:"Double Crochet"},
  "TR":{full:"Treble Crochet"},
  "SL ST":{full:"Slip Stitch"},
  "SS":{full:"Slip Stitch"},
  "CH":{full:"Chain Stitch"},
  "INC":{full:"Increase (2 sc in same st)"},
  "DEC":{full:"Decrease"},
  "SC2TOG":{full:"Single Crochet 2 Together"},
  "MR":{full:"Magic Ring"},
  "MC":{full:"Magic Circle"},
  "FO":{full:"Fasten Off"},
  "BLO":{full:"Back Loop Only"},
  "FLO":{full:"Front Loop Only"},
  "YO":{full:"Yarn Over"},
  "PM":{full:"Place Marker"},
  "SM":{full:"Slip Marker"},
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
  // S76 hub: when set, render ONLY the section whose header row has this id (a
  // focused drill-in). rows/setRows/onSave stay the FULL pattern, so all the
  // global-index toggle, progress, and milestone logic is unchanged.
  focusHeaderId = null,
}) => {
  const [noteEdit,setNoteEdit]=useState(null);
  const [expandedSections,setExpandedSections]=useState({});
  const [rowEditing,setRowEditing]=useState(null);
  const [newRow,setNewRow]=useState("");
  const [noteSaved,setNoteSaved]=useState(false);
  // 2b focus mode (Wovely App 2b.dc.html .focuswrap) — full-screen counter
  // over the same row data. Pure presentation state.
  const [focusOn,setFocusOn]=useState(false);
  useEffect(()=>{
    if(!focusOn)return;
    const prev=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return()=>{document.body.style.overflow=prev;};
  },[focusOn]);

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

  // ── 2b central counter (NOW card + focus mode) ──
  // The "active part" the counter drives: the scoped part when a part is
  // open (focusHeaderId), otherwise the first part with an unfinished round.
  // inc/dec reuse toggle() so persistence, milestones, section locking and
  // cascade-uncheck all behave exactly as a tap on the row itself.
  const activeSecIdx=useMemo(()=>{
    if(focusHeaderId){const i=linearSections.findIndex(s=>s.header?.id===focusHeaderId);if(i>=0)return i;}
    const i=linearSections.findIndex(s=>s.rows.some(r=>!r.done&&!r.isNoteOnly));
    return i>=0?i:Math.max(0,linearSections.length-1);
  },[linearSections,focusHeaderId]);
  const activeSec=linearSections[activeSecIdx]||{header:null,rows:[]};
  const activeCountable=activeSec.rows.filter(r=>!r.isNoteOnly);
  const activeDone=activeCountable.filter(r=>r.done).length;
  const activeTotal=activeCountable.length;
  const activeRemaining=activeCountable.filter(r=>!r.done);
  const activeCurRow=activeRemaining[0]||null;
  const activeNextRow=activeRemaining[1]||null;
  const activePct=activeTotal?Math.round(activeDone/activeTotal*100):0;
  const activePartNo=activeSec.header?linearSections.filter(s=>s.header).findIndex(s=>s.header.id===activeSec.header.id)+1:null;
  const activePartName=activeSec.header?activeSec.header.text.replace(/──/g,"").trim():(p.title||"Your rounds");
  const incRow=()=>{if(activeCurRow)toggle(activeCurRow.id);};
  const decRow=()=>{const last=[...activeSec.rows].reverse().find(r=>r.done);if(last)toggle(last.id);};
  const showCounter=!isAnonymous&&activeTotal>0;

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

  // Shared 2b counter cluster (nowcard + focuswrap both use it)
  const CounterCluster=({big})=>(
    <div style={{display:"flex",alignItems:"center",gap:big?34:16}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
        <button onClick={decRow} disabled={activeDone===0} aria-label="Undo last round" style={{width:56,height:56,borderRadius:"50%",border:0,cursor:activeDone?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",background:T.surface,color:T.terra,opacity:activeDone?1:.45}}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 12h12"/></svg>
        </button>
        <div style={{fontWeight:800,fontSize:10.5,letterSpacing:".05em",textTransform:"uppercase",color:T.ink3}}>Undo</div>
      </div>
      {!big&&<div style={{fontFamily:T.serif,fontWeight:600,fontSize:52,minWidth:80,textAlign:"center",lineHeight:1,color:T.ink}}>{activeDone}<small style={{fontFamily:T.sans,fontWeight:800,fontSize:18,color:T.ink3}}>/{activeTotal}</small></div>}
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
        <button onClick={incRow} disabled={!activeCurRow} aria-label="Mark round done" style={{width:big?76:56,height:big?76:56,borderRadius:"50%",border:0,cursor:activeCurRow?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",background:T.terra,color:"#fff",boxShadow:`0 12px 24px -10px ${T.terra}`,opacity:activeCurRow?1:.45}}>
          <svg width={big?30:24} height={big?30:24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <div style={{fontWeight:800,fontSize:10.5,letterSpacing:".05em",textTransform:"uppercase",color:T.ink3}}>Round done</div>
      </div>
    </div>
  );
  const focusLabel=`Round ${Math.min(activeDone+1,activeTotal)} of ${activeTotal}`;
  const partLabel=activePartNo?`Part ${activePartNo} — ${activePartName}`:activePartName;
  return (
    <>
      {/* ── 2b NOW card — central counter over the same row data ── */}
      {showCounter&&(
        <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:"18px 24px",background:"#fff",border:`1px solid ${T.border}`,borderRadius:24,padding:"22px 26px",margin:"4px 0 18px",boxShadow:"0 16px 34px -24px rgba(90,66,160,.4)"}}>
          <div style={{flex:"1 1 260px",minWidth:0}}>
            <div style={{fontWeight:800,fontSize:12,letterSpacing:".12em",textTransform:"uppercase",color:T.terra}}>{activeCurRow?`Now working · ${focusLabel}`:"Part complete"}</div>
            <div style={{fontFamily:T.serif,fontWeight:600,fontSize:24,color:T.ink,marginTop:3,lineHeight:1.15}}>{partLabel}</div>
            <div style={{fontWeight:700,fontSize:14,color:T.ink3,marginTop:2,maxWidth:420,lineHeight:1.5}}>Tap ＋ for each finished round — or tick rows in the list below. Same counter, always in step.</div>
            <div style={{fontFamily:T.serif,fontWeight:600,fontSize:15,color:T.terra,background:T.surface,padding:"6px 14px",borderRadius:999,marginTop:10,display:"inline-block"}}>{activePct}% complete · Bev saved your spot</div>
          </div>
          <CounterCluster/>
        </div>
      )}
      {showCounter&&(
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:14,margin:"0 0 14px"}}>
          <div style={{fontWeight:700,fontSize:13,color:T.ink3,lineHeight:1.5}}>Tap the round you just finished — the counter follows along. Finished rounds fade out.</div>
          <button onClick={()=>setFocusOn(true)} style={{display:"inline-flex",alignItems:"center",gap:8,border:`1.5px solid ${T.border}`,borderRadius:12,background:"#fff",padding:"10px 16px",fontFamily:T.sans,fontWeight:800,fontSize:13.5,color:T.terra,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H4.5A1.5 1.5 0 003 4.5V8M16 3h3.5A1.5 1.5 0 0121 4.5V8M8 21H4.5A1.5 1.5 0 013 19.5V16M16 21h3.5a1.5 1.5 0 001.5-1.5V16"/></svg>
            Focus mode
          </button>
        </div>
      )}
      {/* ── 2b full-screen focus mode ── */}
      {focusOn&&showCounter&&(
        <div style={{position:"fixed",inset:0,zIndex:500,background:"#FBF9FF",backgroundImage:"repeating-linear-gradient(45deg,rgba(123,106,212,.035) 0 1.5px,transparent 1.5px 9px)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",padding:28}}>
          <button onClick={()=>setFocusOn(false)} aria-label="Exit focus mode" style={{position:"absolute",top:22,right:24,width:44,height:44,borderRadius:"50%",border:`1.5px solid ${T.border}`,background:"#fff",color:T.ink3,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>
          </button>
          <div style={{fontWeight:800,fontSize:13,letterSpacing:".14em",textTransform:"uppercase",color:T.terra}}>{partLabel} · {activeCurRow?focusLabel:"complete"}</div>
          <div style={{fontFamily:T.serif,fontWeight:600,fontSize:"clamp(28px,4.6vw,48px)",lineHeight:1.15,maxWidth:720,marginTop:18,color:T.ink}}>{activeCurRow?activeCurRow.text:`All ${activeTotal} rounds done 🎉`}</div>
          <div style={{width:"min(420px,80vw)",height:10,borderRadius:999,background:T.border,marginTop:30,overflow:"hidden"}}>
            <span style={{display:"block",height:"100%",borderRadius:999,width:`${activePct}%`,background:`linear-gradient(90deg,${T.terra},${T.pink})`,transition:"width .3s"}}/>
          </div>
          <div style={{marginTop:34}}><CounterCluster big/></div>
          <div style={{fontWeight:700,fontSize:14.5,color:T.ink3,marginTop:26,maxWidth:560}}>Next: <b style={{color:T.ink}}>{activeNextRow?activeNextRow.text:activeCurRow?"last round of this part":"take a bow"}</b></div>
        </div>
      )}
      {/* Pattern Notes — designer's read-only preamble. Reads pattern_notes
          only (post-migration 007 split); notes is the user's journal and
          belongs to My Notes, not here. No fallback between the two. */}
      {!focusHeaderId&&p.pattern_notes&&<div style={{marginBottom:12}}>
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
          <button onClick={()=>{if(!editing)setEditing(true);}} style={{background:T.terra,color:"#fff",border:"none",borderRadius:12,padding:"12px 24px",fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(123,106,212,.3)"}}>Add Rows</button>
        </div>
      ):(()=>{
        const seenAbbr=new Set();
        return linearSections.map((sec,si)=>{
          if(focusHeaderId&&sec.header?.id!==focusHeaderId)return null;
          const secKey=sec.header?.id||"sec-"+si;
          const countable=sec.rows.filter(r=>!r.isNoteOnly);
          const secDone=countable.filter(r=>r.done).length;
          const secTotal=countable.length;
          const secComplete=secTotal>0&&secDone===secTotal;
          // S76: a named part with no rows AND no captured prose is a flat,
          // non-interactive reference chip — never a toggle that opens to
          // nothing. A part with captured `body` prose stays a real drill-in.
          const hasBody=!!(sec.header&&sec.header.body&&String(sec.header.body).trim());
          const isReference=isReferenceChip(secTotal,hasBody);
          if(isReference) return (
            <div key={secKey} style={{marginBottom:8,display:"flex",alignItems:"center",gap:10,padding:"10px 14px",border:`1px dashed ${T.border}`,borderRadius:10,background:T.surface,opacity:.85}}>
              <span style={{fontSize:10,fontWeight:700,letterSpacing:".06em",color:T.ink3,background:"#fff",border:`1px solid ${T.border}`,borderRadius:6,padding:"2px 6px"}}>REF</span>
              <span style={{fontSize:13,color:T.ink2,fontWeight:600}}>{sec.header?sec.header.text.replace(/──/g,"").trim():"Reference"}</span>
            </div>
          );
          const defaultOpen=sec.rows.some(r=>!r.done)||!sec.header||hasBody;
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
            {sec.header&&!focusHeaderId&&<button onClick={toggleSec} style={{width:"100%",background:secComplete?T.sageLt:T.linen,border:`1px solid ${secComplete?"rgba(92,122,94,.3)":T.border}`,borderRadius:open?"10px 10px 0 0":10,padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,textAlign:"left"}}>
              <span style={{fontSize:12,color:T.ink3}}>{open?"▼":"▶"}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:secComplete?T.sage:T.terra}}>{sec.header.text.replace(/──/g,"").trim()}{secComplete?" ✓":""}</div>
                {/* Narrative sections (a named part with no checkable rows — e.g.
                    "Overview, Sizing, Materials") have no progress to track.
                    Label them "Reference" and drop the 0-of-0 line + empty bar
                    instead of showing a misleading "0 of 0 complete" (S76 bug 2). */}
                <div style={{fontSize:11,color:T.ink3,marginTop:2}}>{secTotal===0?"Read this part":isAnonymous?`Showing ${visibleRows.length} of ${sec.rows.length} rows`:`${secDone} of ${secTotal} complete`}</div>
              </div>
              {sec.header.makeCount>1&&<div style={{background:T.gold,color:"#fff",borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700}}>×{sec.header.makeCount}</div>}
              {secTotal>0&&<div style={{width:60}}><Bar val={secDone/secTotal*100} color={secComplete?T.sage:T.terra} h={3}/></div>}
            </button>}
            {(open||!sec.header||focusHeaderId)&&<div style={{display:"flex",flexDirection:"column",gap:10,padding:sec.header&&!focusHeaderId?"10px 0 2px":0,position:"relative"}}>
              {hasBody&&<div style={{padding:"12px 14px",fontSize:13,color:T.ink2,lineHeight:1.7,whiteSpace:"pre-wrap",background:"#fff",border:`1px solid ${T.border}`,borderRadius:14}}>{sec.header.body}</div>}
              {visibleRows.map((r,i)=>{const globalIdx=r._gi;const isCurrent=globalIdx===currentRowIdx;const rowLocked=!r.done&&!isRowCheckable(globalIdx,sec,si);const newAbbr=r.done?[]:findNewAbbr(r.text,seenAbbr);const rowNumFromId=r.id?parseInt((String(r.id).match(/\d+$/)||[])[0],10):null;const flagStatus=flaggedRowMap&&rowNumFromId?flaggedRowMap[rowNumFromId]:null;const isCur=isCurrent&&!rowLocked&&!isAnonymous;return(
        // 2b .step card — same toggle/lock/flag/dots logic, card presentation.
        // Done rounds fade (.step.done opacity .55); BevCheck flags keep their
        // coral/amber left border + tinted fill (.ffail/.fwarn).
        <div key={r.id} id={`row-${i + 1}`} data-row={i + 1} style={{background:flagStatus==="fail"?"#FFF6F4":flagStatus==="warning"?"#FFFBF2":"#fff",border:`1px solid ${isCur?T.terra:T.border}`,borderLeft:flagStatus==="fail"?"4px solid #FF8A73":flagStatus==="warning"?"4px solid #F5B93E":undefined,borderRadius:14,boxShadow:isCur?`0 10px 22px -16px ${T.terra}`:"none",opacity:r.done?.55:rowLocked?.45:1,transition:"opacity .15s, border-color .15s"}}>
          <div onClick={()=>{if(isAnonymous||rowLocked)return;toggle(r.id);}} style={{display:"flex",gap:14,alignItems:"center",cursor:isAnonymous||rowLocked?"default":"pointer",padding:"14px 18px"}}>
            <button type="button" aria-label={r.done?"Mark row incomplete":"Mark row complete"} disabled={isAnonymous||rowLocked} onClick={e=>{e.stopPropagation();if(isAnonymous||rowLocked)return;toggle(r.id);}} style={{position:"relative",overflow:"visible",width:30,height:30,borderRadius:9,flexShrink:0,padding:0,border:"none",background:r.done?T.sage:isCur?T.terra:T.surface,color:r.done||isCur?"#fff":T.terra,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.sans,fontWeight:800,fontSize:14,transition:"all .2s",cursor:isAnonymous||rowLocked?"default":"pointer"}}>
              <span aria-hidden="true" style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:44,height:44}}/>
              {r.done?"✓":i+1}
            </button>
            <div style={{flex:1,minWidth:0}}>
              {r.isAction&&!rowLocked&&<div style={{fontSize:10,color:T.gold,fontWeight:600,letterSpacing:".06em",marginBottom:2}}>ACTION</div>}
              {rowEditing?.id===r.id
                ?<div style={{display:"flex",gap:6,alignItems:"center"}} onClick={e=>e.stopPropagation()}>
                  <input autoFocus value={rowEditing.text} onChange={e=>setRowEditing({...rowEditing,text:e.target.value})} onKeyDown={e=>{if(e.key==="Enter")saveRowText(r.id,rowEditing.text);if(e.key==="Escape")setRowEditing(null);}} style={{flex:1,padding:"6px 10px",background:T.linen,border:`1.5px solid ${T.terra}`,borderRadius:8,fontSize:13,color:T.ink,outline:"none",lineHeight:1.5}}/>
                  <button onClick={()=>saveRowText(r.id,rowEditing.text)} style={{background:T.sage,border:"none",borderRadius:6,padding:"5px 8px",color:"#fff",fontSize:12,cursor:"pointer",fontWeight:700}}>✓</button>
                  <button onClick={()=>setRowEditing(null)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 8px",color:T.ink3,fontSize:12,cursor:"pointer"}}>✕</button>
                </div>
                :<div style={{fontSize:14.5,fontWeight:700,lineHeight:1.6,color:r.done?T.ink3:rowLocked?"#B8B2AA":T.ink}}>{r.text}</div>}
            </div>
            {flagStatus&&<div style={{marginLeft:"auto",fontWeight:800,fontSize:11,color:flagStatus==="fail"?"#C2564A":"#B07B1E",flexShrink:0,maxWidth:112,textAlign:"right"}}>{flagStatus==="fail"?"✗ check this row":"⚠ heads up"}</div>}
            {!isAnonymous&&!rowLocked&&rowEditing?.id!==r.id&&<div style={{display:"flex",gap:2,flexShrink:0}}>
              <button onClick={e=>{e.stopPropagation();setRowEditing({id:r.id,text:r.text});setNoteEdit(null);}} style={{background:"none",border:"none",fontSize:13,cursor:"pointer",padding:"4px",color:T.ink3,opacity:.5}} title="Edit row">✏️</button>
              <button onClick={e=>{e.stopPropagation();setNoteEdit(noteEdit===r.id?null:r.id);}} style={{background:"none",border:"none",fontSize:14,cursor:"pointer",padding:"4px"}}><span style={{color:r.note?T.terra:T.ink3,opacity:r.note?1:.5}}>📝</span></button>
            </div>}
          </div>
          {!isAnonymous&&!r.done&&!rowLocked&&((r.repeat_brackets||[]).some(b=>b.count>1)||r.repeat_done)&&<div style={{padding:"0 18px 12px 62px"}}><SubCounter row={r} globalIdx={globalIdx} onDotTap={handleDotTap} onRepeatDone={handleRepeatDone}/></div>}
          {r.note&&noteEdit!==r.id&&!rowLocked&&<div onClick={e=>{e.stopPropagation();setNoteEdit(r.id);}} style={{padding:"0 18px 12px 62px",fontSize:12,color:T.ink3,lineHeight:1.5,cursor:"pointer"}}><span style={{fontSize:11}}>📌</span> <span style={{fontStyle:"italic"}}>{r.note}</span></div>}
          {newAbbr.length>0&&!rowLocked&&<div style={{padding:"0 18px 12px 62px"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:T.sans,fontSize:11,color:T.ink3,marginBottom:6}}>New stitch — tap for a video</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{newAbbr.map(a=><button key={a.raw} type="button" onClick={e=>{e.stopPropagation();window.open("https://www.youtube.com/results?search_query=" + encodeURIComponent(a.full + " crochet tutorial"),"_blank","noopener,noreferrer");}} onMouseEnter={e=>{e.currentTarget.style.background="#E7DFF8";}} onMouseLeave={e=>{e.currentTarget.style.background=T.surface;}} style={{display:"inline-flex",alignItems:"center",gap:5,background:T.surface,color:T.terra,border:"none",borderRadius:999,padding:"5px 10px",fontFamily:T.sans,fontSize:11.5,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap",transition:"background .15s"}}><svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true" style={{flexShrink:0,display:"block"}}><path d="M3 2.2 L10 6 L3 9.8 Z" fill={T.terra}/></svg>{a.raw}</button>)}</div>
          </div>}
          {noteEdit===r.id&&!rowLocked&&<div style={{padding:"0 18px 14px 62px",display:"flex",alignItems:"center",gap:8}}><input value={r.note} onChange={e=>updateNote(r.id,e.target.value)} placeholder="Add a note for this row…" style={{flex:1,padding:"9px 12px",background:T.linen,border:`1.5px solid ${T.terra}`,borderRadius:9,fontSize:13,color:T.ink,outline:"none"}}/>{noteSaved&&<span style={{fontSize:11,color:T.sage,fontWeight:600,flexShrink:0}}>Note saved</span>}</div>}
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
      {!focusHeaderId && (isAnonymous ? (
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
            boxShadow:"0 4px 24px rgba(90,66,160,0.08)",
            padding:"28px 24px",
            textAlign:"center",
          }}>
            <div style={{
              fontFamily:"'Fredoka', Georgia, serif",
              fontSize:22,
              fontWeight:700,
              color:T.ink,
              lineHeight:1.25,
              marginBottom:8,
            }}>
              You're just getting started
            </div>
            <div style={{
              fontFamily:"Nunito,sans-serif",
              fontSize:14,
              color:"#726A92",
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
                background:"#7B6AD4",
                color:"#fff",
                border:"none",
                borderRadius:12,
                padding:"13px 28px",
                fontSize:14,
                fontWeight:600,
                cursor:"pointer",
                boxShadow:"0 4px 16px rgba(123,106,212,0.3)",
                marginBottom:12,
              }}
            >Create Free Account</button>
            <div style={{fontSize:12.5,color:"#726A92"}}>
              Already have an account?{" "}
              <span
                onClick={()=>onSignUp&&onSignUp()}
                style={{color:"#7B6AD4",cursor:"pointer",fontWeight:600}}
              >Sign in</span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{display:"flex",gap:8,marginTop:16}}>
          <input value={newRow} onChange={e=>setNewRow(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addRow()} placeholder="Add a row or step…" style={{flex:1,border:`1.5px solid ${T.border}`,borderRadius:11,padding:"10px 14px",fontSize:13,color:T.ink,background:T.linen,outline:"none"}} onFocus={e=>e.target.style.borderColor=T.terra} onBlur={e=>e.target.style.borderColor=T.border}/>
          <button onClick={addRow} style={{background:T.terra,color:"#fff",border:"none",borderRadius:11,padding:"10px 18px",fontSize:22,cursor:"pointer",lineHeight:1,boxShadow:"0 4px 12px rgba(123,106,212,.35)"}}>+</button>
        </div>
      ))}
      {/* Floating source pattern pill — hidden for guests so it doesn't
          collide with the sticky signup bar at the same screen position. */}
      {p.source_file_url&&onViewSource&&!isAnonymous&&!focusHeaderId&&<button onClick={onViewSource} style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",zIndex:200,background:T.terra,color:"#fff",border:"none",borderRadius:999,padding:"12px 24px",fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(123,106,212,.4)",whiteSpace:"nowrap"}}>📄 View Source Pattern →</button>}
    </>
  );
};

export default RowManager;
