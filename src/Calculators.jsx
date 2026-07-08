import { useState } from "react";
import { T, useBreakpoint } from "./theme.jsx";

const Calculators = () => {
  const [active,setActive]=useState("gauge");
  // Gauge calc state
  const [stitches,setStitches]=useState("20"),[rows,setRows]=useState("24"),[swatchSize,setSwatchSize]=useState("4");
  const [targetW,setTargetW]=useState("50"),[targetH,setTargetH]=useState("60");
  // Yardage calc state
  const [projW,setProjW]=useState("50"),[projH,setProjH]=useState("60"),[stPer4,setStPer4]=useState("12"),[ydsPerSt,setYdsPerSt]=useState("0.5");
  // Resize calc state
  const [patSt,setPatSt]=useState("18"),[patRows,setPatRows]=useState("20"),[patSwatchIn,setPatSwatchIn]=useState("4");
  const [mySt,setMySt]=useState("14"),[myRows,setMyRows]=useState("16"),[mySwatchIn,setMySwatchIn]=useState("4");
  const [origCount,setOrigCount]=useState("24"),[origDesc,setOrigDesc]=useState("(4 sc, inc) x 4");
  const [showRepeat,setShowRepeat]=useState(false);

  // Gauge calculator
  const stPerInch=parseFloat(stitches)/parseFloat(swatchSize)||0;
  const roPerInch=parseFloat(rows)/parseFloat(swatchSize)||0;
  const castOn=Math.round(stPerInch*parseFloat(targetW)||0);
  const totalRowsCalc=Math.round(roPerInch*parseFloat(targetH)||0);
  // Yardage calculator
  const totalSt=Math.round((parseFloat(stPer4)/4)*(parseFloat(projW)||0)*(parseFloat(projH)||0)*(roPerInch||4));
  const yardage=Math.round(totalSt*(parseFloat(ydsPerSt)||0.5));

  // ── SCALING ENGINE ──────────────────────────────────────────────
  const patStPerIn = parseFloat(patSt)/parseFloat(patSwatchIn)||0;
  const myStPerIn  = parseFloat(mySt)/parseFloat(mySwatchIn)||0;
  const patRowPerIn= parseFloat(patRows)/parseFloat(patSwatchIn)||0;
  const myRowPerIn = parseFloat(myRows)/parseFloat(mySwatchIn)||0;
  const stScale = (patStPerIn>0&&myStPerIn>0) ? patStPerIn/myStPerIn : 1;
  const rowScale= (patRowPerIn>0&&myRowPerIn>0) ? patRowPerIn/myRowPerIn : 1;
  const sizeChangeW = stScale>0 ? (1/stScale) : 1;
  const sizeChangeH = rowScale>0 ? (1/rowScale) : 1;

  const scaleCount = (n,axis="st") => {
    const factor = axis==="row" ? stScale : stScale;
    const scaled = Math.round(n * factor);
    const error = Math.abs(scaled - n*factor) / (n*factor||1);
    return { scaled, error, flagged: error > 0.05 };
  };

  const rawCount = parseInt(origCount)||0;
  const scaledResult = scaleCount(rawCount);

  const scaleRepeat = (desc, totalSts) => {
    const repeatMatch = desc.match(/[xX×*]\s*(\d+)/);
    const seqMatch = desc.match(/\(([^)]+)\)/);
    if (!repeatMatch || !seqMatch) return null;
    const origRepeat = parseInt(repeatMatch[1]);
    const scaledRepeat = Math.round(origRepeat * stScale);
    const seqText = seqMatch[1];
    const seqStCount = (seqText.match(/\b(sc|hdc|dc|tr|inc|dec|sl st|ch)\b/gi)||[]).length || 1;
    const newTotal = scaledRepeat * seqStCount;
    const newDesc = desc.replace(repeatMatch[0], `x ${scaledRepeat}`);
    return { newDesc, scaledRepeat, newTotal, origRepeat };
  };
  const repeatResult = showRepeat ? scaleRepeat(origDesc, rawCount) : null;
  const {isDesktop:isDk}=useBreakpoint();

  const CARD = {background:"rgba(255,255,255,0.82)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderRadius:20,padding:24,border:"1px solid rgba(255,255,255,0.6)",boxShadow:"0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(123,106,212,0.13)",marginBottom:16};
  const LABEL = {fontSize:11,fontWeight:600,color:T.ink2,textTransform:"uppercase",letterSpacing:".05em",marginBottom:6};
  const DIVIDER = {height:1,background:T.border,margin:"20px 0"};

  const Input = ({label,val,set,step="1"}) => (
    <div>
      <div style={LABEL}>{label}</div>
      <input value={val} onChange={e=>set(e.target.value)} type="number" step={step}
        style={{width:"100%",padding:"12px 0",background:"transparent",border:"none",borderBottom:"2px solid transparent",fontSize:17,fontWeight:600,color:T.ink,textAlign:"center",outline:"none",transition:"border-color .2s"}}
        onFocus={e=>e.target.style.borderBottomColor=T.terra} onBlur={e=>e.target.style.borderBottomColor="transparent"}/>
    </div>
  );
  const ResultCard = ({label,val,flag}) => (
    <div style={{textAlign:"center",padding:"12px 8px"}}>
      <div style={LABEL}>{label}</div>
      <div style={{fontSize:32,fontWeight:700,fontFamily:T.serif,color:flag?T.terra:T.ink,lineHeight:1}}>{val}</div>
      {flag&&<div style={{fontSize:10,color:T.terra,marginTop:4}}>rounding &gt;5%</div>}
    </div>
  );

  const Pill = ({children,active:a,onClick}) => (
    <button onClick={onClick} style={{flex:1,padding:"10px 16px",border:"none",background:a?T.terra:"transparent",color:a?"#fff":T.ink2,borderRadius:9999,cursor:"pointer",fontSize:12,fontWeight:600,transition:"all .15s",letterSpacing:".02em"}}>{children}</button>
  );

  return (
    <div style={{padding:isDk?"24px 24px 100px":"0 18px 100px",maxWidth:960,margin:"0 auto"}}>
      <div style={{fontFamily:T.serif,fontSize:22,color:T.ink,marginBottom:4,fontWeight:700}}>Crochet Calculators</div>
      <div style={{fontSize:13,color:T.ink3,marginBottom:20}}>Essential tools for planning your projects.</div>

      {/* Tab pills */}
      <div style={{display:"flex",gap:4,marginBottom:20,background:T.surface,borderRadius:9999,padding:4}}>
        {[["gauge","Gauge"],["yardage","Yardage"],["resize","Scale"]].map(([key,label])=>(
          <Pill key={key} active={active===key} onClick={()=>setActive(key)}>{label}</Pill>
        ))}
      </div>

      {/* ── GAUGE ── */}
      {active==="gauge"&&<>
        <div style={CARD}>
          <div style={LABEL}>your swatch</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginTop:8}}>
            <Input label="stitches" val={stitches} set={setStitches}/>
            <Input label="rows" val={rows} set={setRows}/>
            <Input label="swatch (in)" val={swatchSize} set={setSwatchSize}/>
          </div>
          <div style={DIVIDER}/>
          <div style={LABEL}>target dimensions</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginTop:8}}>
            <Input label="width (in)" val={targetW} set={setTargetW}/>
            <Input label="height (in)" val={targetH} set={setTargetH}/>
          </div>
          <div style={DIVIDER}/>
          <div style={LABEL}>results</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
            <ResultCard label="cast on" val={castOn}/>
            <ResultCard label="total rows" val={totalRowsCalc}/>
            <ResultCard label="sts / inch" val={stPerInch.toFixed(1)}/>
            <ResultCard label="rows / inch" val={roPerInch.toFixed(1)}/>
          </div>
        </div>
      </>}

      {/* ── YARDAGE ── */}
      {active==="yardage"&&<>
        <div style={CARD}>
          <div style={LABEL}>project details</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginTop:8}}>
            <Input label="width (in)" val={projW} set={setProjW}/>
            <Input label="height (in)" val={projH} set={setProjH}/>
            <Input label="sts per 4in" val={stPer4} set={setStPer4}/>
            <Input label="yds per stitch" val={ydsPerSt} set={setYdsPerSt} step="0.1"/>
          </div>
          <div style={DIVIDER}/>
          <div style={{textAlign:"center",padding:"16px 0 8px"}}>
            <div style={{fontSize:52,fontWeight:700,fontFamily:T.serif,color:T.terra,lineHeight:1}}>{yardage.toLocaleString()}</div>
            <div style={{fontSize:14,color:T.ink3,marginTop:6,fontWeight:500}}>yards needed</div>
            <div style={{display:"inline-flex",marginTop:12,background:T.terraLt,borderRadius:9999,padding:"4px 10px",fontSize:11,color:T.terra,fontWeight:600,textTransform:"uppercase",letterSpacing:".05em"}}>~{Math.ceil(yardage/200)} skeins at 200 yds</div>
          </div>
        </div>
      </>}

      {/* ── SCALE ── */}
      {active==="resize"&&<>
        <div style={{fontSize:12,color:T.ink3,marginBottom:16,lineHeight:1.6}}>
          Enter the pattern's gauge and your gauge. We'll calculate exact scaled stitch counts.
        </div>

        {/* Gauge inputs side by side */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          <div style={CARD}>
            <div style={LABEL}>pattern gauge</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:8,marginBottom:8}}>
              <Input label="sts" val={patSt} set={setPatSt}/>
              <Input label="rows" val={patRows} set={setPatRows}/>
            </div>
            <Input label="swatch (in)" val={patSwatchIn} set={setPatSwatchIn}/>
          </div>
          <div style={CARD}>
            <div style={LABEL}>my gauge</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:8,marginBottom:8}}>
              <Input label="sts" val={mySt} set={setMySt}/>
              <Input label="rows" val={myRows} set={setMyRows}/>
            </div>
            <Input label="swatch (in)" val={mySwatchIn} set={setMySwatchIn}/>
          </div>
        </div>

        {/* Scale factor summary */}
        <div style={CARD}>
          <div style={LABEL}>your scale factors</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:8}}>
            <ResultCard label="stitch mult." val={`\u00D7${stScale.toFixed(2)}`}/>
            <ResultCard label="width result" val={`${(sizeChangeW*100).toFixed(0)}%`} flag={Math.abs(sizeChangeW-1)>0.3}/>
            <ResultCard label="yardage mult." val={`${(sizeChangeW*sizeChangeH*100).toFixed(0)}%`}/>
          </div>
          {Math.abs(stScale-1)<0.03&&<div style={{marginTop:12,fontSize:12,color:T.sage,fontWeight:600,textAlign:"center"}}>Gauges match — no scaling needed</div>}
          {stScale!==1&&<div style={{marginTop:12,fontSize:12,color:T.ink2,lineHeight:1.6,textAlign:"center"}}>
            {stScale>1?"Your gauge is tighter — multiply stitch counts to match.":"Your gauge is looser — reduce stitch counts to match."}
          </div>}
        </div>

        {/* Single stitch count scaler */}
        <div style={CARD}>
          <div style={LABEL}>scale a stitch count</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginTop:8,marginBottom:8}}>
            <Input label="pattern calls for" val={origCount} set={setOrigCount}/>
            <div>
              <div style={LABEL}>you should work</div>
              <div style={{textAlign:"center",padding:"8px 0"}}>
                <span style={{fontSize:28,fontWeight:700,fontFamily:T.serif,color:scaledResult.flagged?T.terra:T.sage}}>{scaledResult.scaled}</span>
                <span style={{display:"inline-flex",marginLeft:8,background:scaledResult.flagged?T.terraLt:T.sageLt,borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:600,color:scaledResult.flagged?T.terra:T.sage}}>sts</span>
              </div>
              {scaledResult.flagged&&<div style={{fontSize:10,color:T.terra,textAlign:"center"}}>{(scaledResult.error*100).toFixed(1)}% rounding</div>}
            </div>
          </div>

          {/* Repeat pattern scaler toggle */}
          <button onClick={()=>setShowRepeat(r=>!r)} style={{fontSize:11,color:T.terra,background:"none",border:"none",cursor:"pointer",padding:0,fontWeight:500}}>
            {showRepeat?"\u25BE Hide repeat scaler":"\u25B8 Scale a repeat pattern"}
          </button>
          {showRepeat&&<>
            <div style={{marginTop:12}}>
              <div style={LABEL}>repeat instruction</div>
              <input value={origDesc} onChange={e=>setOrigDesc(e.target.value)}
                placeholder="e.g. (4 sc, inc) x 4"
                style={{width:"100%",padding:"12px 0",background:"transparent",border:"none",borderBottom:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,outline:"none",transition:"border-color .2s"}}
                onFocus={e=>e.target.style.borderBottomColor=T.terra} onBlur={e=>e.target.style.borderBottomColor=T.border}/>
            </div>
            {repeatResult&&<div style={{marginTop:12,textAlign:"center",padding:"12px 0"}}>
              <div style={LABEL}>scaled instruction</div>
              <div style={{fontSize:15,fontWeight:600,color:T.ink,fontFamily:T.serif,marginTop:4}}>{repeatResult.newDesc}</div>
              <div style={{fontSize:11,color:T.ink3,marginTop:6}}>{repeatResult.origRepeat} repeats \u2192 {repeatResult.scaledRepeat} repeats</div>
            </div>}
            {showRepeat&&!repeatResult&&origDesc.length>3&&<div style={{marginTop:8,fontSize:11,color:T.ink3}}>Couldn't parse that pattern. Try: (4 sc, inc) x 4</div>}
          </>}
        </div>

        {/* Sizing note */}
        <div style={{background:"#FFFFFF",borderRadius:16,padding:24,border:`1px solid ${T.border}`,boxShadow:T.shadow}}>
          <div style={{display:"inline-flex",background:T.terraLt,borderRadius:9999,padding:"4px 10px",fontSize:11,fontWeight:600,color:T.terra,marginBottom:10,letterSpacing:".05em",textTransform:"uppercase"}}>PRO TIP</div>
          <div style={{fontSize:12,color:T.ink2,lineHeight:1.7}}>For amigurumi, scaling via hook size + yarn weight change is often easier than adjusting every stitch count. A 5mm hook with bulky yarn instead of 3.5mm with DK roughly doubles your finished size with zero math.</div>
        </div>
      </>}
    </div>
  );
};

export default Calculators;
