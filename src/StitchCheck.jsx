import { useState, useRef } from "react";
import { T, useBreakpoint } from "./theme.jsx";
import ScanGauge, { ProcSteps } from "./components/ScanGauge.jsx";
import posthog from "posthog-js";
import BevGauge, { deriveState, sentenceCase, checkTier } from "./components/BevGauge.jsx";

// VALIDATION_PROMPT kept for export — used by AddPatternModal and ImageImportModal for client-side background validation
const VALIDATION_PROMPT = `You are a crochet pattern validator. Analyze this pattern and return ONLY a JSON object with this exact structure — no markdown, no backticks, no explanation:
{
  "overall": "valid" or "review" or "issues",
  "score": number 0-100,
  "checks": [
    { "id": "string", "label": "string", "status": "pass" or "warning" or "fail", "detail": "string" }
  ],
  "summary": "string"
}

Check for:
1. Sequential rounds/rows — are all numbers present with no gaps or duplicates? (id: "sequence")
2. Stitch count math — do totals in parentheses match the instructions mathematically? (id: "stitch_math")
3. Duplicate round numbers — same number appearing twice with different instructions? (id: "duplicates")
4. Cross-references — does the pattern reference rounds that don't exist? (id: "cross_refs")
5. Translation artifacts — does phrasing suggest a translated pattern that may have errors? (id: "translation")
6. Component structure — are section headers clear and consistent? (id: "structure")

SCORING RULES — do NOT penalize for any of the following:
• PDF formatting artifacts (OCR typos in tip/intro sections, formatting inconsistencies, page headers/footers)
• Print-Friendly page duplications — if the pattern appears duplicated at the end under a "Print-Friendly" or similar heading, ignore the duplicate section entirely. This is a common PDF feature, not a pattern error.
• Non-US decimal conventions (comma instead of period for decimals)
• Minor grammatical issues that do not affect the crochet instructions
These may be noted as informational "pass" items at most, never scored as warnings or failures.

CROCHET STITCH MATH RULES — you MUST follow these when verifying stitch counts:
• "inc" (increase) = 2 stitches worked into 1 stitch. It CONSUMES 1 stitch from the previous round but PRODUCES 2 stitches in the current round.
• "dec" / "sc2tog" / "inv dec" (decrease) = 1 stitch worked over 2 stitches. It CONSUMES 2 stitches but PRODUCES 1 stitch.
• "sc", "hdc", "dc", "tr", "sl st" = each is exactly 1 stitch (consumes 1, produces 1).
• Bracket repeats: "(sc, inc) x 6" means the sequence "sc, inc" is worked 6 times. That's 6 × (1 + 2) = 18 stitches produced, consuming 6 × 2 = 12 stitches from the previous round.
• When a round says "(sc, inc) x 6 (12)", verify: 6 repeats × 2 stitches produced per repeat = 12. This is CORRECT.
• Common correct progression: MR 6 → (sc, inc) x 6 = 12 → (2 sc, inc) x 4 = 16 → etc.
• Do NOT flag stitch counts as wrong unless you have done the arithmetic yourself and confirmed a mismatch.

UNCERTAINTY RULE:
If you can confidently verify the math is correct → "pass"
If you can confidently verify the math is wrong → "fail"
If you cannot confidently verify due to ambiguous notation, unusual abbreviations, complex construction, or stitch types not listed above → return status "warning" with a brief explanation of what could not be verified.
Never guess. Never silently pass something you cannot calculate with confidence.

Be specific in detail fields. Name exact round numbers where issues occur. If everything looks clean, say so clearly. Aim for scores 80-100 for patterns with no structural issues.`;

// Load pdf.js dynamically (same approach as AddPatternModal)
const extractTextFromPDF = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        if (!window.pdfjsLib) {
          await new Promise((res, rej) => {
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
            script.onload = res; script.onerror = rej;
            document.head.appendChild(script);
          });
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }
        const typedArray = new Uint8Array(e.target.result);
        const pdf = await window.pdfjsLib.getDocument({ data: typedArray }).promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          fullText += "\n" + content.items.map(item => item.str).join(" ");
        }
        resolve(fullText);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

const BADGE = { valid: { color: "#1E8A63", bg: T.sageLt, emoji: "\u2705", label: "Pattern Looks Good" }, review: { color: "#C9A84C", bg: "#FFF8EC", emoji: "\u26A0\uFE0F", label: "Review Suggested" }, issues: { color: "#C0544A", bg: "#FFF0EE", emoji: "\u274C", label: "Issues Found" } };
const badgeForScore = (score) => score >= 80 ? BADGE.valid : score >= 60 ? BADGE.review : BADGE.issues;
const CHECK_ICON = { pass: "\u2705", warn: "\u26A0\uFE0F", warning: "\u26A0\uFE0F", fail: "\u274C" };
const displayScore = (report) => {
  if (!report?.checks?.length) return report?.score || 0;
  const allPass = report.checks.every(c => c.status === "pass");
  return allPass ? 100 : report.score;
};

const CARD = {background:"rgba(255,255,255,0.82)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderRadius:20,padding:24,border:"1px solid rgba(255,255,255,0.6)",boxShadow:"0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(123,106,212,0.13)"};
const LABEL = {fontSize:11,fontWeight:600,color:T.ink2,textTransform:"uppercase",letterSpacing:".05em",marginBottom:6};

const extractFirstRowNumber = (text) => {
  const match = text.match(/(?:rnd|row|round)\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
};

const StitchCheck = ({ onNavigateToRow, gateAction } = {}) => {
  const [mode, setMode] = useState(null); // null | "pdf" | "text"
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const { isDesktop } = useBreakpoint();

  const runCheck = async (patternText) => {
    if (!patternText.trim()) return;
    posthog.capture("stitch_check_run");
    setLoading(true); setError(null); setReport(null); setProgress(10); setPhase("Preparing pattern text\u2026");
    const intv = setInterval(() => setProgress(p => Math.min(p + 2, 85)), 200);
    try {
      setPhase("Running BevCheck\u2026");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);
      const res = await fetch("/api/extract-pattern", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "bevcheck", patternText }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      clearInterval(intv); setProgress(90); setPhase("Reading results\u2026");
      const data = await res.json();
      console.log("[Wovely] BevCheck response status:", res.status, "provider:", data.provider);
      if (!res.ok || data.error) {
        if (data.message === "bev_tangled") throw new Error("bev_tangled");
        throw new Error("BevCheck API error: " + res.status);
      }
      setProgress(100); setPhase("Done");
      await new Promise(r => setTimeout(r, 300));
      setReport(data);
    } catch (e) {
      clearInterval(intv);
      console.error("[Wovely] BevCheck error:", e);
      setError("Couldn't analyze this pattern. Try again or paste the text directly.");
    }
    setLoading(false);
  };

  const handlePDF = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setMode("pdf"); setLoading(true); setProgress(5); setPhase("Extracting text from PDF\u2026");
    try {
      const extracted = await extractTextFromPDF(file);
      await runCheck(extracted);
    } catch {
      setError("Couldn't read this PDF. Try pasting the pattern text instead.");
      setLoading(false);
    }
  };

  const handleTextSubmit = () => runCheck(text);

  const reset = () => { setMode(null); setText(""); setReport(null); setError(null); setLoading(false); setProgress(0); };

  // Report card view
  if (report) {
    const resolvedState = deriveState(report);
    const coreChecks = (report.checks || []).filter(c => checkTier(c) === "core");
    const advisoryChecks = (report.checks || []).filter(c => checkTier(c) === "advisory");
    const issueCount = (report.checks || []).filter(c => c.status === "fail" || c.status === "warning" || c.status === "warn").length;
    const numericScore = typeof report.score === "number" ? report.score : undefined;

    const renderCheck = (c, opacity) => {
      const isWarning = c.status === "warning" || c.status === "warn";
      const isFail = c.status === "fail";
      const isActionable = onNavigateToRow && (isFail || isWarning);
      const rowNum = isActionable ? extractFirstRowNumber(c.detail) : null;
      return (
        <div key={c.id} onClick={isActionable ? () => onNavigateToRow(rowNum) : undefined} style={{ ...CARD, padding: "16px 20px", marginBottom: 10, display: "flex", gap: 12, alignItems: "flex-start", cursor: isActionable ? "pointer" : "default", transition: "transform .1s", opacity: opacity || 1 }} onMouseEnter={isActionable ? e => { e.currentTarget.style.transform = "translateY(-1px)"; } : undefined} onMouseLeave={isActionable ? e => { e.currentTarget.style.transform = "none"; } : undefined}>
          <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{CHECK_ICON[c.status] || "\u2753"}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: isFail ? "#C0544A" : isWarning ? "#C9A84C" : T.ink, marginBottom: 4 }}>{sentenceCase(c.label)}</div>
            <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.7 }}>{c.detail}</div>
            {isWarning && <div style={{ fontSize: 11, color: "#C9A84C", fontWeight: 600, fontFamily: "'Nunito', sans-serif", marginTop: 6 }}>Bev couldn't verify this — review manually</div>}
            {isActionable && <div style={{ fontSize: 11, color: "#7B6AD4", fontWeight: 600, fontFamily: "'Nunito', sans-serif", marginTop: 6 }}>→ View in rows</div>}
          </div>
        </div>
      );
    };

    return (
      <div style={{ padding: isDesktop ? "24px 24px 80px" : "0 18px 80px", maxWidth: 960, margin: "0 auto" }}>
        <div style={{ fontFamily: T.serif, fontSize: 22, color: T.ink, marginBottom: 4, fontWeight: 700 }}>BevCheck Report</div>
        <div style={{ fontSize: 13, color: T.ink3, marginBottom: 24 }}>Pattern validation results</div>

        {/* Semicircle gauge */}
        <div style={{ marginBottom: 20 }}>
          <BevGauge
            score={numericScore}
            state={numericScore == null ? resolvedState : undefined}
            issueCount={issueCount}
          />
        </div>

        {/* Core checks */}
        <div style={{ marginBottom: 20 }}>
          {coreChecks.map(c => renderCheck(c))}

          {/* Divider */}
          {advisoryChecks.length > 0 && (
            <>
              <div style={{ borderTop: "0.5px solid #ECE6F8", margin: "16px 0" }} />
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "#7B6AD4", fontFamily: "'Nunito', sans-serif", marginBottom: 12 }}>Advisory</div>
              {advisoryChecks.map(c => renderCheck(c, 0.85))}
            </>
          )}
        </div>

        {/* Summary */}
        {report.summary && (
          <div style={{ ...CARD, marginBottom: 20 }}>
            <div style={{ ...LABEL, color: T.terra, marginBottom: 8 }}>bev says</div>
            <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.7 }}>{report.summary}</div>
          </div>
        )}

        <div style={{ padding: "0 8px", textAlign: "center", marginBottom: 20 }}>
          <p style={{ fontSize: 12, color: T.sage, lineHeight: 1.7, fontStyle: "italic", margin: 0 }}>A few warnings don't mean your pattern won't work — think of it like adding a handwritten recipe card to your recipe box. Mom's notes, doodles, and shorthand are part of the charm. Wovely can import any pattern regardless of its BevCheck result.</p>
        </div>
        <button onClick={reset} style={{ width: "100%", background: "#FFFFFF", color: T.ink2, border: `1.5px solid ${T.terra}`, borderRadius: 9999, padding: "14px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Check another pattern</button>
      </div>
    );
  }

  return (
    <div style={{ padding: isDesktop ? "24px 24px 80px" : "0 18px 80px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ fontFamily: T.serif, fontSize: 22, color: T.ink, marginBottom: 4, fontWeight: 700 }}>BevCheck</div>
      <div style={{ fontSize: 13, color: T.ink3, marginBottom: 24, lineHeight: 1.6 }}>Before you pick up your hook — let Wovely check the math.</div>

      {error && (
        <div style={{ ...CARD, background: "#FFF0EE", borderColor: "rgba(192,90,90,.2)", marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: "#C2564A", fontWeight: 600, marginBottom: 4 }}>Something went wrong</div>
          <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.6 }}>{error}</div>
        </div>
      )}

      {loading && (() => {
        // 2b .proc treatment \u2014 bobbing Bev + step list + live gauge, same
        // family as the import paths. Steps ride the real phase string.
        const activeStep = /extract|prepar/i.test(phase) ? 0 : /running/i.test(phase) ? 1 : 2;
        return (
          <div style={{ ...CARD, textAlign: "center", padding: "28px 24px 32px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <style>{`@keyframes bevbobSC{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}`}</style>
            <img src="/bev-hero.png" alt="Bev checking your pattern" style={{ width: 96, filter: "drop-shadow(0 12px 18px rgba(90,66,160,.32))", animation: "bevbobSC 2.2s ease-in-out infinite" }} />
            <div style={{ fontFamily: "'Fredoka','Segoe UI',sans-serif", fontSize: 26, fontWeight: 600, color: "#2E2748", marginTop: 18, lineHeight: 1.15 }}>{phase}</div>
            <div style={{ fontWeight: 700, fontSize: 14.5, fontFamily: "Nunito,sans-serif", color: "#726A92", marginTop: 6 }}>Bev checks the math so your hook doesn't have to.</div>
            <div style={{ width: "100%", maxWidth: 390, marginTop: 22, display: "flex", justifyContent: "center" }}>
              <ScanGauge phase={activeStep >= 1 ? "checking" : "idle"} note={activeStep >= 1 ? "Checking every row's stitch counts\u2026" : "Warming up the needle\u2026"} />
            </div>
            <ProcSteps steps={["Reading your pattern", "BevCheck \u2014 validating accuracy", "Reading the results"]} activeStep={activeStep} />
          </div>
        );
      })()}

      {!loading && !mode && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div onClick={() => { const go=()=>fileRef.current?.click(); if(gateAction) gateAction({ intent:"bevcheck", title:"Create a free account to run BevCheck", subtitle:"Wovely checks your pattern for errors and saves the report." }, go); else go(); }} style={{ ...CARD, cursor: "pointer", textAlign: "center", transition: "all .15s" }} onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = T.shadowLg; }} onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = T.shadow; }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{"\uD83D\uDCC4"}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.ink, marginBottom: 4 }}>Upload PDF</div>
            <div style={{ fontSize: 12, color: T.ink3, lineHeight: 1.5 }}>We'll extract and validate</div>
          </div>
          <div onClick={() => { const go=()=>setMode("text"); if(gateAction) gateAction({ intent:"bevcheck", title:"Create a free account to run BevCheck", subtitle:"Wovely checks your pattern for errors and saves the report." }, go); else go(); }} style={{ ...CARD, cursor: "pointer", textAlign: "center", transition: "all .15s" }} onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = T.shadowLg; }} onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = T.shadow; }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{"\u270F\uFE0F"}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.ink, marginBottom: 4 }}>Paste Text</div>
            <div style={{ fontSize: 12, color: T.ink3, lineHeight: 1.5 }}>Paste your pattern directly</div>
          </div>
          <input ref={fileRef} type="file" accept=".pdf" onChange={handlePDF} style={{ display: "none" }} />
        </div>
      )}

      {!loading && mode === "text" && (
        <div style={CARD}>
          <div style={LABEL}>paste your pattern</div>
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Paste your pattern text here — rounds, rows, instructions, everything\u2026" rows={12} style={{ width: "100%", padding: "16px 0", background: "transparent", border: "none", borderBottom: "2px solid transparent", color: T.ink, fontSize: 14, resize: "vertical", lineHeight: 1.7, outline: "none", fontFamily: T.sans, transition: "border-color .2s" }} onFocus={e => e.target.style.borderBottomColor = T.terra} onBlur={e => e.target.style.borderBottomColor = "transparent"} />
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button onClick={handleTextSubmit} disabled={!text.trim()} style={{ flex: 1, background: T.terra, color: "#fff", border: "none", borderRadius: 9999, padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: text.trim() ? "pointer" : "not-allowed", opacity: text.trim() ? 1 : .5 }}>Run BevCheck</button>
            <button onClick={reset} style={{ background: "#FFFFFF", color: T.terra, border: `1.5px solid ${T.terra}`, borderRadius: 9999, padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
};

export { VALIDATION_PROMPT, BADGE, badgeForScore, CHECK_ICON, displayScore, extractFirstRowNumber };
export default StitchCheck;
