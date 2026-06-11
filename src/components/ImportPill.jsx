import React, { useState, useEffect, useRef } from "react";
import { T, useBreakpoint } from "../theme.jsx";
import { useImportJobPolling } from "../hooks/useImportJobPolling.js";
import { PHASE_COPY_POOLS, REASSURANCE_LINE, pickPhaseCopy } from "../utils/importPhaseCopy.js";

// Floating import status pill. Mounts at App.jsx so it persists across navigation.
// Reads/writes sessionStorage key 'wovely_active_import_job' (string job id).
//
// Polling now lives in useImportJobPolling (shared with the in-modal flows in
// PDFUploadForm and ImageImportModal). The hook supplies job state, current
// phase, and elapsed-time ticking — the pill renders.
//
// States:
//   idle:        nothing rendered
//   processing:  Bev avatar + spinning ring + phase copy + elapsed time
//   completed:   prominent pulse for 5s, then settle to "Tap to review"
//   failed:      "Bev got tangled — try again" with Try again action
//
// Tap behavior:
//   processing:  calls onTapResume({ jobId, fileType }) — reopens the full
//                AddPatternModal/ImageImportModal in its loading state.
//                Pill STAYS visible so a close-and-resume can happen again.
//   completed:   calls onTapReview({ jobId, fileType, extractedData, coverImageUrl, validationReport }) and clears sessionStorage
//   failed:      calls onTapTryAgain({ jobId, fileType }) and clears sessionStorage

const SESSION_KEY = "wovely_active_import_job";
const PROMINENT_DURATION_MS = 5000;

const PROMINENT_STYLE = {
  background: "linear-gradient(135deg, rgba(155,126,200,0.95), rgba(216,234,216,0.95))",
  border: `1px solid ${T.terra}`,
  boxShadow: `0 8px 32px rgba(155,126,200,0.35)`,
};

const SETTLED_STYLE = {
  background: "rgba(255,255,255,0.82)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.45)",
  boxShadow: "0 4px 24px rgba(45,58,124,0.08)",
};

export const setActiveImportJob = (jobId) => {
  try {
    if (jobId) sessionStorage.setItem(SESSION_KEY, jobId);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {}
};

export default function ImportPill({ onTapReview, onTapTryAgain, onTapResume }) {
  const { isMobile } = useBreakpoint();
  const [jobId, setJobId] = useState(() => {
    try { return sessionStorage.getItem(SESSION_KEY) || null; } catch { return null; }
  });
  const [prominentUntil, setProminentUntil] = useState(0);
  const [tick, setTick] = useState(0); // local 1s tick to settle prominent window
  const [phaseCopy, setPhaseCopy] = useState(null);
  const lastPickedPhaseRef = useRef(null);

  // Watch sessionStorage for jobs added by other tabs / by AddPatternModal handoff.
  useEffect(() => {
    const checkInterval = setInterval(() => {
      try {
        const stored = sessionStorage.getItem(SESSION_KEY);
        if (stored !== jobId) setJobId(stored || null);
      } catch {}
    }, 1000);
    return () => clearInterval(checkInterval);
  }, [jobId]);

  useEffect(() => {
    const intv = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(intv);
  }, []);

  const polling = useImportJobPolling(jobId, {
    onMissing: () => { setActiveImportJob(null); setJobId(null); },
  });

  const { job, currentPhase, phaseElapsed, totalElapsed, isComplete, isFailed, isActive, validationReport, extractedData, coverImageUrl, fileType, fileUrl, retryCount, extractionMethod, errorMessage } = polling;

  // Detect the completed transition to set the prominent pulse window.
  useEffect(() => {
    if (isComplete) setProminentUntil(Date.now() + PROMINENT_DURATION_MS);
  }, [isComplete]);

  // Pick a new copy line when the phase changes. Stays stable within a phase
  // so we aren't shuffling text on every 3s poll.
  useEffect(() => {
    if (!currentPhase) return;
    if (currentPhase === lastPickedPhaseRef.current) return;
    const next = pickPhaseCopy(currentPhase);
    if (next) setPhaseCopy(next);
    lastPickedPhaseRef.current = currentPhase;
  }, [currentPhase]);

  const dismiss = () => {
    setActiveImportJob(null);
    setJobId(null);
  };

  const handleTap = () => {
    if (!job) return;
    if (isComplete) {
      onTapReview?.({ jobId: job.id, fileType, extractedData, coverImageUrl, validationReport, fileUrl });
      dismiss();
      return;
    }
    if (isFailed) {
      onTapTryAgain?.({ jobId: job.id, fileType });
      dismiss();
      return;
    }
    // Active/processing: reopen the full modal in its loading state. Clear
    // sessionStorage — the modal owns the import now; if the user closes it
    // again before completion the modal's unmount handler re-writes the key.
    // Without this clear, sessionStorage holds the job_id through the whole
    // resume → save round-trip, and ImportPill re-renders the same job after
    // save (offering a duplicate import).
    setActiveImportJob(null);
    setJobId(null);
    onTapResume?.({ jobId: job.id, fileType });
  };

  if (!jobId || !job) return null;
  if (!isActive && !isComplete && !isFailed) return null;

  const now = Date.now();
  const isProminent = isComplete && now < prominentUntil;
  const elapsedLabel = totalElapsed >= 60 ? `${Math.floor(totalElapsed / 60)}m ${totalElapsed % 60}s` : `${totalElapsed}s`;

  // ─── State copy ─────────────────────────────────────────────────────────────
  // Active state pulls from the phase copy pool (phaseCopy state, set on
  // phase transition). Sub is the persistent reassurance line. Elapsed
  // time, ETA, and progress bars are intentionally absent in Stage 1 —
  // Stage 2 reintroduces them once we have measured medians per phase.

  let title, sub, subAllowsWrap = false, ringSpinning = false;
  if (isActive) {
    title = phaseCopy || "Bev's on it...";
    sub = REASSURANCE_LINE;
    subAllowsWrap = true;
    ringSpinning = true;
  } else if (isComplete) {
    title = isProminent ? "Pattern ready!" : "Tap to review";
    sub = isProminent ? "Tap to review" : (fileType === "pdf" ? "PDF imported" : "Photo imported");
  } else if (isFailed) {
    title = "Bev got tangled";
    sub = errorMessage ? truncate(errorMessage, 80) : "Try again";
  }
  // tick is referenced via Date.now() above for prominent-window settle
  void tick;
  // phaseElapsed is no longer rendered in Stage 1 but the hook still returns
  // it; reference here so an unused-warning doesn't fire.
  void phaseElapsed;

  // ─── Layout / sizing ────────────────────────────────────────────────────────
  // Single compact card, always the same size. Tap routes via handleTap to
  // the parent (resume modal / open review / try again). No inline expand.

  const baseWidth = isMobile ? 240 : 320;
  const desktopRight = 24;
  const desktopBottom = 24;
  const mobileRight = 16;

  const containerStyle = {
    position: "fixed",
    bottom: isMobile ? `calc(16px + env(safe-area-inset-bottom, 0px))` : `${desktopBottom}px`,
    right: isMobile ? `${mobileRight}px` : `${desktopRight}px`,
    width: baseWidth,
    zIndex: 50,
    borderRadius: 16,
    padding: 12,
    transition: "transform .25s ease",
    cursor: "pointer",
    fontFamily: T.sans,
    color: isProminent ? "#FFFFFF" : T.ink,
    ...(isProminent ? PROMINENT_STYLE : SETTLED_STYLE),
    ...(isProminent && { animation: "wovelyPillPulse 1.2s ease-in-out infinite" }),
  };
  // retryCount + extractionMethod were only surfaced in the removed expanded
  // detail card; reference here so destructure-unused warnings don't fire.
  void retryCount; void extractionMethod;

  return (
    <>
      <PillKeyframes />
      <div role="status" aria-live="polite" onClick={handleTap} style={containerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <BevAvatar spinning={ringSpinning} prominent={isProminent} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div key={currentPhase || "_"} style={{
              fontSize: 13, fontWeight: 600,
              color: isProminent ? "#FFFFFF" : T.ink,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              animation: isActive ? "wovelyPhaseFade 200ms ease both" : undefined,
            }}>{title}</div>
            <div style={{
              fontSize: 11,
              color: isProminent ? "rgba(255,255,255,0.85)" : T.ink2,
              marginTop: 2,
              lineHeight: 1.35,
              ...(subAllowsWrap
                ? { whiteSpace: "normal", overflow: "visible" }
                : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }),
            }}>{sub}</div>
          </div>
          {isActive && (
            <div style={{
              fontSize: 11, color: T.ink3, fontVariantNumeric: "tabular-nums", flexShrink: 0,
            }}>{elapsedLabel}</div>
          )}
        </div>
      </div>
    </>
  );
}

function PillKeyframes() {
  return (
    <style>{`
      @keyframes wovelyPillPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.025)} }
      @keyframes wovelyPillRing { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }
      @keyframes wovelyPhaseFade { from{opacity:0;transform:translateY(2px)} to{opacity:1;transform:translateY(0)} }
    `}</style>
  );
}

function BevAvatar({ spinning, prominent }) {
  const size = 36;
  return (
    <div style={{ width: size, height: size, position: "relative", flexShrink: 0 }}>
      {spinning && (
        <div style={{
          position: "absolute", inset: -3, borderRadius: "50%",
          border: `2px solid transparent`,
          borderTopColor: prominent ? "rgba(255,255,255,0.9)" : T.terra,
          animation: "wovelyPillRing 1s linear infinite",
        }}/>
      )}
      <img
        src="/bev_neutral.png"
        alt="Bev"
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", display: "block" }}
      />
    </div>
  );
}

function truncate(s, n) {
  if (!s || s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
