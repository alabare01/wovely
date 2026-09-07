import { useState } from "react";
import { T, useBreakpoint } from "./theme.jsx";
import {
  YARN_WEIGHTS, STITCH_TYPES, estimateYardage, referenceGauge, ydsPerStitch, DEFAULT_SKEIN_YARDS,
} from "./utils/yardage.js";
import { scaleCount } from "./utils/gaugeScale.js";

// ── Field and result primitives ─────────────────────────────────────────────
//
// These live at module scope on purpose. They used to be declared inside
// Calculators, which meant React saw a brand new component type on every
// render, threw the old DOM node away and mounted a fresh one. The practical
// effect on a live public page: typing 36 into a width box left 0 in it, because
// the field was destroyed and rebuilt between the 3 and the 6 and the focus went
// with it. Verified on main at 390px before this change. Declared out here the
// type identity is stable, the node survives, and a person can type a number.
const LABEL = {fontSize:11,fontWeight:600,color:T.ink2,textTransform:"uppercase",letterSpacing:".05em",marginBottom:6};
const DIVIDER = {height:1,background:T.border,margin:"20px 0"};

const Input = ({label,val,set,step="1"}) => (
  <div style={{minWidth:0}}>
    <div style={{...LABEL,overflowWrap:"anywhere"}}>{label}</div>
    <input value={val} onChange={e=>set(e.target.value)} type="number" step={step} inputMode="decimal"
      style={{width:"100%",minWidth:0,maxWidth:"100%",padding:"12px 0",background:"transparent",border:"none",borderBottom:"2px solid transparent",fontSize:17,fontWeight:600,color:T.ink,textAlign:"center",outline:"none",transition:"border-color .2s"}}
      onFocus={e=>e.target.style.borderBottomColor=T.terra} onBlur={e=>e.target.style.borderBottomColor="transparent"}/>
  </div>
);

const ResultCard = ({label,val,flag,isMobile}) => (
  <div style={{textAlign:"center",padding:isMobile?"12px 4px":"12px 8px",minWidth:0}}>
    <div style={{...LABEL,overflowWrap:"anywhere"}}>{label}</div>
    <div style={{fontSize:isMobile?26:32,fontWeight:700,fontFamily:T.serif,color:flag?T.terra:T.ink,lineHeight:1,overflowWrap:"anywhere"}}>{val}</div>
    {flag&&<div style={{fontSize:10,color:T.terra,marginTop:4}}>rounding &gt;5%</div>}
  </div>
);

const Pill = ({children,active:a,onClick}) => (
  <button onClick={onClick} style={{flex:1,padding:"10px 16px",border:"none",background:a?T.terra:"transparent",color:a?"#fff":T.ink2,borderRadius:9999,cursor:"pointer",fontSize:12,fontWeight:600,transition:"all .15s",letterSpacing:".02em"}}>{children}</button>
);

// Same underline treatment as Input, so the two selectors read as part of the
// same row of fields. 16px because anything under it makes iOS Safari zoom the
// whole page on focus, and this tab is mostly phones.
const Select = ({label,val,set,options}) => (
  <div style={{minWidth:0}}>
    <div style={{...LABEL,overflowWrap:"anywhere"}}>{label}</div>
    <select value={val} onChange={e=>set(e.target.value)}
      style={{width:"100%",minWidth:0,maxWidth:"100%",padding:"11px 4px",background:"transparent",border:"none",borderBottom:`2px solid ${T.border}`,fontSize:16,fontWeight:600,fontFamily:T.sans,color:T.ink,textAlign:"center",outline:"none",cursor:"pointer",borderRadius:0}}>
      {options.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  </div>
);

// Tones borrowed from the crochet stitch counter page, which already
// established the house style for a tool that declines to answer.
const Note = ({tone="quiet",children}) => (
  <div style={{
    ...(tone==="warn"
      ? {background:"#FFF8E8",border:"1px solid #F5E2B8",color:"#7A5A15"}
      : {background:T.linen,border:`1px solid ${T.border}`,color:T.ink2}),
    borderRadius:14,padding:"13px 16px",fontSize:13.5,lineHeight:1.65,fontWeight:600,overflowWrap:"anywhere",
  }}>{children}</div>
);

// Every path here ends without a number on purpose. A yardage figure you cannot
// trust sends someone to a shop with the wrong trolley, and the page has no way
// to tell them by how much it was wrong. Same call the stitch counter page makes.
const YardageHeld = ({r,weightLabel,stitchLabel}) => {
  const stitch = stitchLabel.toLowerCase();
  if (r.reason==="no-size") return <Note>Waiting on a finished width and height. Fill both in and this resolves.</Note>;
  if (r.reason==="no-gauge") return <Note>Waiting on a gauge. Stitches per four inches and rows per inch both need a number in them.</Note>;
  if (r.reason==="no-consumption") return <Note>Waiting on yards per stitch. Clear the advanced box to go back to the figure for {weightLabel} {stitch}.</Note>;
  if (r.reason==="too-big") return (
    <Note tone="warn">
      <b>No yardage for this one.</b> That size works out to {r.yards.toLocaleString()} yards, which is
      more yarn than a king blanket takes. Check the width and the height. Both are in inches, so a
      throw is around 50 by 60 rather than 50 by 60 feet.
    </Note>
  );
  return (
    <Note tone="warn">
      <b>No yardage for this one.</b> Those numbers work out to {r.yards.toLocaleString()} yards
      over {Math.round(r.areaSqIn).toLocaleString()} square inches, which is {r.density} yards of yarn
      in every square inch of fabric. {weightLabel} {stitch} runs closer to {r.referenceDensity}, so this
      is {r.reason==="too-dense"?"far too much":"far too little"} yarn for a piece that size. The gauge or
      the yards per stitch is out by a long way. Showing the total anyway would just be a confident wrong
      number, so it is not shown.
    </Note>
  );
};

/**
 * @param {boolean} embedded  true when this renders inside the public /tools
 *        page shell (PublicCalculators), which owns the h1, the page padding
 *        and the cross-links. Inside the signed-in app shell it is false and
 *        nothing about the component changes.
 */
const Calculators = ({embedded=false,initialTab="gauge"}) => {
  // initialTab lets the three dedicated calculator URLs open on their own tool.
  // The other two stay one click away on purpose: somebody working out yardage
  // is usually about to check gauge as well.
  const [active,setActive]=useState(initialTab);
  // Gauge calc state
  const [stitches,setStitches]=useState("20"),[rows,setRows]=useState("24"),[swatchSize,setSwatchSize]=useState("4");
  const [targetW,setTargetW]=useState("50"),[targetH,setTargetH]=useState("60");
  // Yardage calc state, explained where the numbers are computed below
  const [projW,setProjW]=useState("50"),[projH,setProjH]=useState("60");
  const [yarnWeight,setYarnWeight]=useState("worsted"),[stitchType,setStitchType]=useState("sc");
  const [stPer4,setStPer4]=useState(null),[yardRows,setYardRows]=useState(null),[ydsOverride,setYdsOverride]=useState(null);
  // Resize calc state
  const [patSt,setPatSt]=useState("18"),[patRows,setPatRows]=useState("20"),[patSwatchIn,setPatSwatchIn]=useState("4");
  const [mySt,setMySt]=useState("14"),[myRows,setMyRows]=useState("16"),[mySwatchIn,setMySwatchIn]=useState("4");
  const [origCount,setOrigCount]=useState("24"),[origRows,setOrigRows]=useState("30"),[origDesc,setOrigDesc]=useState("(4 sc, inc) x 4");
  const [showRepeat,setShowRepeat]=useState(false);

  // Gauge calculator
  const stPerInch=parseFloat(stitches)/parseFloat(swatchSize)||0;
  const roPerInch=parseFloat(rows)/parseFloat(swatchSize)||0;
  // Casting on is knitting. A crocheter chains, or works a foundation row, and
  // the wrong verb here is the exact tell that a tool was built by someone who
  // does not crochet. Renamed 2026-09-07.
  const startingStitches=Math.round(stPerInch*parseFloat(targetW)||0);
  const totalRowsCalc=Math.round(roPerInch*parseFloat(targetH)||0);
  // ── YARDAGE ENGINE INPUTS ───────────────────────────────────────
  // Two things went wrong here and both were invisible on screen.
  //
  // One: the yardage total used to multiply by the GAUGE tab's rows per inch.
  // The yardage tab had no row input of its own, so editing a swatch on a
  // different tab silently moved the answer on this one, and a stray
  // `(roPerInch||4)` fallback disagreed with the live default of 6. This tab now
  // owns its own row gauge and reads nothing from the gauge tab.
  //
  // Two: it asked for "yds per stitch" cold and shipped 0.5 in the box, which is
  // eighteen inches of yarn for one stitch. Yarn weight and stitch type drive it
  // now. The three number boxes are prefilled from that pair and follow it until
  // someone types over one, after which their number wins and a reset appears.
  const yRef=referenceGauge(yarnWeight,stitchType);
  const yStPer4=stPer4??String(yRef.stsPer4);
  const yRowsPerIn=yardRows??String(yRef.rowsPerInch);
  const yPerSt=ydsOverride??String(ydsPerStitch(yarnWeight,stitchType));
  const yardTouched=stPer4!==null||yardRows!==null||ydsOverride!==null;
  const resetYardage=()=>{setStPer4(null);setYardRows(null);setYdsOverride(null);};
  const yardage=estimateYardage({
    widthIn:projW,heightIn:projH,stsPer4:yStPer4,rowsPerInch:yRowsPerIn,
    weightId:yarnWeight,stitchId:stitchType,ydsPerStitchOverride:yPerSt,
  });
  const weightLabel=(YARN_WEIGHTS.find(w=>w.id===yarnWeight)||{}).label||"";
  const stitchLabel=(STITCH_TYPES.find(s=>s.id===stitchType)||{}).label||"";

  // ── SCALING ENGINE ──────────────────────────────────────────────
  const patStPerIn = parseFloat(patSt)/parseFloat(patSwatchIn)||0;
  const myStPerIn  = parseFloat(mySt)/parseFloat(mySwatchIn)||0;
  const patRowPerIn= parseFloat(patRows)/parseFloat(patSwatchIn)||0;
  const myRowPerIn = parseFloat(myRows)/parseFloat(mySwatchIn)||0;
  const stScale = (patStPerIn>0&&myStPerIn>0) ? patStPerIn/myStPerIn : 1;
  const rowScale= (patRowPerIn>0&&myRowPerIn>0) ? patRowPerIn/myRowPerIn : 1;
  const sizeChangeW = stScale>0 ? (1/stScale) : 1;
  const sizeChangeH = rowScale>0 ? (1/rowScale) : 1;

  // scaleCount lives in src/utils/gaugeScale.js now. It used to carry a ternary
  // whose two branches were both stScale, so a row count came back scaled by the
  // stitch ratio, which is only right when the two gauges happen to differ by the
  // same amount. Rows go through the row ratio now, and there is a row box below
  // so that path is actually reachable.
  const rawCount = parseInt(origCount)||0;
  const rawRows = parseInt(origRows)||0;
  const scaledResult = scaleCount(rawCount,{stScale,rowScale},"st");
  const scaledRowResult = scaleCount(rawRows,{stScale,rowScale},"row");

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
  const {isDesktop:isDk,isMobile}=useBreakpoint();

  // ── MOBILE LAYOUT ─────────────────────────────────────────────────────────
  // At 390px this page was clipping. The cause was fixed two-up grids nested
  // inside cards with 24px of padding each: two side-by-side cards, each
  // holding its own two-column grid, left roughly 55px per number field on a
  // phone, so the labels and the values ran off their own boxes. Every grid
  // below is now single-column under the mobile breakpoint, card padding drops
  // to 16, and each input is min-width:0 so a grid cell can actually shrink
  // rather than forcing its parent wider than the viewport. /tools is where the
  // search traffic lands, and most of it lands on a phone.
  const PAD = isMobile ? 16 : 24;
  const CARD = {background:"rgba(255,255,255,0.82)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderRadius:20,padding:PAD,border:"1px solid rgba(255,255,255,0.6)",boxShadow:"0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(123,106,212,0.13)",marginBottom:16,minWidth:0};
  // Two-up and three-up survive a phone for short numeric fields inside ONE
  // card. What does not survive is the Scale tab's card-beside-card pair, each
  // holding its own two-column grid: that is four fields across 354px of
  // viewport minus four lots of padding. That one stacks.
  const two = "1fr 1fr";
  const three = isMobile ? "1fr 1fr 1fr" : "1fr 1fr 1fr";
  const pairOfCards = isMobile ? "1fr" : "1fr 1fr";


  return (
    <div style={{padding:embedded?0:(isDk?"24px 24px 100px":"0 18px 100px"),maxWidth:embedded?"none":960,margin:"0 auto",minWidth:0}}>
      {/* This was a plain styled div, so /tools shipped to search with NO h1 at
          all — the one heading Google looks at first was simply absent on a page
          that was just opened for indexing. Same size, same weight, now an
          actual heading.
          When embedded in the public shell the surrounding page owns the h1, so
          this one is suppressed: two h1s on one document is worse than none. */}
      {!embedded&&<>
        <h1 style={{fontFamily:T.serif,fontSize:22,color:T.ink,margin:"0 0 4px",fontWeight:700}}>Crochet Calculators</h1>
        <div style={{fontSize:13,color:T.ink3,marginBottom:20}}>Essential tools for planning your projects.</div>
      </>}

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
          <div style={{display:"grid",gridTemplateColumns:three,gap:16,marginTop:8}}>
            <Input label="stitches" val={stitches} set={setStitches}/>
            <Input label="rows" val={rows} set={setRows}/>
            <Input label="swatch (in)" val={swatchSize} set={setSwatchSize}/>
          </div>
          <div style={DIVIDER}/>
          <div style={LABEL}>target dimensions</div>
          <div style={{display:"grid",gridTemplateColumns:two,gap:16,marginTop:8}}>
            <Input label="width (in)" val={targetW} set={setTargetW}/>
            <Input label="height (in)" val={targetH} set={setTargetH}/>
          </div>
          <div style={DIVIDER}/>
          <div style={LABEL}>results</div>
          <div style={{display:"grid",gridTemplateColumns:two,gap:8,marginTop:8}}>
            <ResultCard isMobile={isMobile} label="starting stitches" val={startingStitches}/>
            <ResultCard isMobile={isMobile} label="total rows" val={totalRowsCalc}/>
            <ResultCard isMobile={isMobile} label="sts / inch" val={stPerInch.toFixed(1)}/>
            <ResultCard isMobile={isMobile} label="rows / inch" val={roPerInch.toFixed(1)}/>
          </div>
        </div>
      </>}

      {/* ── YARDAGE ── */}
      {active==="yardage"&&<>
        <div style={CARD}>
          <div style={LABEL}>finished size</div>
          <div style={{display:"grid",gridTemplateColumns:two,gap:16,marginTop:8}}>
            <Input label="width (in)" val={projW} set={setProjW}/>
            <Input label="height (in)" val={projH} set={setProjH}/>
          </div>

          <div style={DIVIDER}/>
          <div style={LABEL}>yarn and stitch</div>
          <div style={{display:"grid",gridTemplateColumns:pairOfCards,gap:16,marginTop:8}}>
            <Select label="yarn weight" val={yarnWeight} set={setYarnWeight} options={YARN_WEIGHTS}/>
            <Select label="stitch" val={stitchType} set={setStitchType} options={STITCH_TYPES}/>
          </div>

          <div style={DIVIDER}/>
          <div style={LABEL}>your gauge</div>
          <div style={{display:"grid",gridTemplateColumns:two,gap:16,marginTop:8}}>
            <Input label="sts per 4in" val={yStPer4} set={setStPer4} step="0.5"/>
            <Input label="rows per inch" val={yRowsPerIn} set={setYardRows} step="0.1"/>
          </div>
          <div style={{marginTop:14}}>
            <Input label="yds per stitch (advanced)" val={yPerSt} set={setYdsOverride} step="0.001"/>
            <div style={{fontSize:11,color:T.ink3,lineHeight:1.6,marginTop:4,textAlign:"center"}}>
              These three are filled in from the yarn and stitch above. Change them only if you have
              swatched and measured your own.
            </div>
          </div>
          {yardTouched&&<div style={{textAlign:"center",marginTop:10}}>
            <button onClick={resetYardage} style={{fontSize:11,color:T.terra,background:"none",border:"none",cursor:"pointer",padding:0,fontWeight:700}}>
              Reset to {weightLabel} {stitchLabel.toLowerCase()}
            </button>
          </div>}

          <div style={DIVIDER}/>
          {yardage.ok ? (
            <div style={{textAlign:"center",padding:"8px 0"}}>
              <div style={{fontSize:isMobile?42:52,fontWeight:700,fontFamily:T.serif,color:T.terra,lineHeight:1,overflowWrap:"anywhere"}}>{yardage.yards.toLocaleString()}</div>
              <div style={{fontSize:14,color:T.ink3,marginTop:6,fontWeight:500}}>yards needed</div>
              <div style={{display:"inline-flex",marginTop:12,background:T.terraLt,borderRadius:9999,padding:"4px 10px",fontSize:11,color:T.terra,fontWeight:600,textTransform:"uppercase",letterSpacing:".05em"}}>~{yardage.skeins} skeins at {DEFAULT_SKEIN_YARDS} yds</div>
              <div style={{fontSize:11.5,color:T.ink3,marginTop:12,lineHeight:1.6}}>
                {yardage.totalStitches.toLocaleString()} stitches, about {yardage.density} yards of yarn
                per square inch. Buy a skein of headroom, and one more if the dye lot matters to you.
              </div>
            </div>
          ) : <YardageHeld r={yardage} weightLabel={weightLabel} stitchLabel={stitchLabel}/>}
        </div>
      </>}

      {/* ── SCALE ── */}
      {active==="resize"&&<>
        <div style={{fontSize:12,color:T.ink3,marginBottom:16,lineHeight:1.6}}>
          Enter the pattern's gauge and your gauge. We'll calculate exact scaled stitch counts.
        </div>

        {/* Gauge inputs side by side on a desktop, stacked on a phone */}
        <div style={{display:"grid",gridTemplateColumns:pairOfCards,gap:12,marginBottom:16}}>
          <div style={CARD}>
            <div style={LABEL}>pattern gauge</div>
            <div style={{display:"grid",gridTemplateColumns:two,gap:12,marginTop:8,marginBottom:8}}>
              <Input label="sts" val={patSt} set={setPatSt}/>
              <Input label="rows" val={patRows} set={setPatRows}/>
            </div>
            <Input label="swatch (in)" val={patSwatchIn} set={setPatSwatchIn}/>
          </div>
          <div style={CARD}>
            <div style={LABEL}>my gauge</div>
            <div style={{display:"grid",gridTemplateColumns:two,gap:12,marginTop:8,marginBottom:8}}>
              <Input label="sts" val={mySt} set={setMySt}/>
              <Input label="rows" val={myRows} set={setMyRows}/>
            </div>
            <Input label="swatch (in)" val={mySwatchIn} set={setMySwatchIn}/>
          </div>
        </div>

        {/* Scale factor summary */}
        <div style={CARD}>
          <div style={LABEL}>your scale factors</div>
          <div style={{display:"grid",gridTemplateColumns:three,gap:8,marginTop:8}}>
            <ResultCard isMobile={isMobile} label="stitch mult." val={`\u00D7${stScale.toFixed(2)}`}/>
            <ResultCard isMobile={isMobile} label="width result" val={`${(sizeChangeW*100).toFixed(0)}%`} flag={Math.abs(sizeChangeW-1)>0.3}/>
            <ResultCard isMobile={isMobile} label="yardage mult." val={`${(sizeChangeW*sizeChangeH*100).toFixed(0)}%`}/>
          </div>
          {Math.abs(stScale-1)<0.03&&<div style={{marginTop:12,fontSize:12,color:T.sage,fontWeight:600,textAlign:"center"}}>Gauges match, so no scaling is needed</div>}
          {stScale!==1&&<div style={{marginTop:12,fontSize:12,color:T.ink2,lineHeight:1.6,textAlign:"center"}}>
            {stScale>1?"Your gauge is tighter, so multiply stitch counts to match.":"Your gauge is looser, so reduce stitch counts to match."}
          </div>}
        </div>

        {/* Single stitch count scaler */}
        <div style={CARD}>
          <div style={LABEL}>scale a stitch count</div>
          <div style={{display:"grid",gridTemplateColumns:two,gap:16,marginTop:8,marginBottom:8}}>
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

          {/* Rows scale by the ROW ratio. They used to scale by the stitch ratio,
              which is only correct when the two gauges differ by the same amount. */}
          <div style={{display:"grid",gridTemplateColumns:two,gap:16,marginBottom:8}}>
            <Input label="pattern rows" val={origRows} set={setOrigRows}/>
            <div>
              <div style={LABEL}>you should work</div>
              <div style={{textAlign:"center",padding:"8px 0"}}>
                <span style={{fontSize:28,fontWeight:700,fontFamily:T.serif,color:scaledRowResult.flagged?T.terra:T.sage}}>{scaledRowResult.scaled}</span>
                <span style={{display:"inline-flex",marginLeft:8,background:scaledRowResult.flagged?T.terraLt:T.sageLt,borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:600,color:scaledRowResult.flagged?T.terra:T.sage}}>rows</span>
              </div>
              {scaledRowResult.flagged&&<div style={{fontSize:10,color:T.terra,textAlign:"center"}}>{(scaledRowResult.error*100).toFixed(1)}% rounding</div>}
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

      {/* Crawl path. /tools is the only one of these pages search already knows
          about, so it is the page that can pass discovery on to the three new
          ones. Plain <a> rather than <Link>: this component renders inside the
          app shell, and the tool pages are standalone routes that must be
          entered with a clean mount. */}
      {!embedded&&<div style={{marginTop:28,paddingTop:22,borderTop:`1px solid ${T.border}`}}>
        <div style={{fontSize:11,fontWeight:700,color:T.ink2,textTransform:"uppercase",letterSpacing:".05em",marginBottom:12}}>More free crochet tools</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
          {[["/uk-us-crochet-terms","UK to US pattern converter"],
            ["/crochet-abbreviations","Crochet abbreviations explained"],
            ["/crochet-stitch-counter","Stitch count checker"]].map(([href,label])=>(
            <a key={href} href={href} style={{padding:"9px 15px",borderRadius:9999,background:"#fff",border:`1px solid ${T.border}`,color:T.terra,fontWeight:700,fontSize:13.5,textDecoration:"none"}}>{label}</a>
          ))}
        </div>
      </div>}
    </div>
  );
};

export default Calculators;
