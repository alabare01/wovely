import React, { useState, useEffect, useRef, useCallback } from "react";
import { T, useBreakpoint } from "../theme.jsx";
import { getSession } from "../supabase.js";

// Floating import status pill. Mounts at App.jsx so it persists across navigation.
// Reads/writes sessionStorage key 'wovely_active_import_job' (string job id).
//
// Polls /api/job-status/[job_id] every 3s while processing. Stops on completed/failed.
//
// States:
//   idle:        nothing rendered
//   processing:  Bev avatar + spinning ring + rotating status copy
//   completed:   prominent pulse for 5s, then settle to "Tap to review"
//   failed:      "Bev got tangled — try again" with Try again action
//
// Tap behavior:
//   processing:  expands (inline card on desktop, modal sheet on mobile) with file type + elapsed time
//   completed:   calls props.onTapReview({ jobId, fileType, extractedData }) and clears sessionStorage
//   failed:      calls props.onTapTryAgain({ jobId, fileType }) and clears sessionStorage

const SESSION_KEY = "wovely_active_import_job";
const POLL_INTERVAL_MS = 3000;
const PROMINENT_DURATION_MS = 5000;

const STATUS_MESSAGES = [
  "Bev's reading your pattern...",
  "Counting stitches...",
  "Untangling the rows...",
  "Almost there...",
];

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

export default function ImportPill({ onTapReview, onTapTryAgain }) {
  const { isMobile } = useBreakpoint();
  const [jobId, setJobId] = useState(() => {
    try { return sessionStorage.getItem(SESSION_KEY) || null; } catch { return null; }
  });
  const [job, setJob] = useState(null); // server response { id, status, extracted_data, error_message, file_type, ... }
  const [statusMsgIdx, setStatusMsgIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [prominentUntil, setProminentUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const pollTimerRef = useRef(null);
  const msgTimerRef = useRef(null);

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

  // Poll job-status while processing/pending
  const pollJob = useCallback(async (id) => {
    if (!id) return;
    const session = getSession();
    const token = session?.access_token;
    if (!token) return;
    try {
      const res = await fetch(`/api/job-status/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) {
        // Job no longer accessible — clear
        setActiveImportJob(null);
        setJobId(null);
        setJob(null);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setJob(prev => {
        // Detect completed transition to set prominent window
        if (data.status === "completed" && (!prev || prev.status !== "completed")) {
          setProminentUntil(Date.now() + PROMINENT_DURATION_MS);
        }
        return data;
      });
    } catch (e) {
      // Network blip — try again next tick
      console.warn("[ImportPill] poll failed:", e.message);
    }
  }, []);

  useEffect(() => {
    if (!jobId) return;
    pollJob(jobId);
    pollTimerRef.current = setInterval(() => {
      // Keep polling only while still pending/processing
      pollJob(jobId);
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    };
  }, [jobId, pollJob]);

  // Stop polling once we know job is settled
  useEffect(() => {
    if (!job) return;
    if (job.status === "completed" || job.status === "failed") {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }
  }, [job?.status]);

  // Rotate status messages
  useEffect(() => {
    if (!job || job.status === "completed" || job.status === "failed") return;
    msgTimerRef.current = setInterval(() => {
      setStatusMsgIdx(i => (i + 1) % STATUS_MESSAGES.length);
    }, 3500);
    return () => {
      if (msgTimerRef.current) clearInterval(msgTimerRef.current);
      msgTimerRef.current = null;
    };
  }, [job?.status]);

  // Tick `now` every second so elapsed time updates and prominent window settles
  useEffect(() => {
    const intv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(intv);
  }, []);

  const dismiss = () => {
    setActiveImportJob(null);
    setJobId(null);
    setJob(null);
    setExpanded(false);
  };

  const handleTap = () => {
    if (!job) return;
    if (job.status === "completed") {
      onTapReview?.({ jobId: job.id, fileType: job.file_type, extractedData: job.extracted_data, coverImageUrl: job.cover_image_url || null });
      dismiss();
      return;
    }
    if (job.status === "failed") {
      onTapTryAgain?.({ jobId: job.id, fileType: job.file_type });
      dismiss();
      return;
    }
    // processing/pending: expand
    setExpanded(e => !e);
  };

  if (!jobId || !job) return null;

  const status = job.status;
  if (status !== "pending" && status !== "processing" && status !== "completed" && status !== "failed") {
    return null;
  }

  const isProminent = status === "completed" && now < prominentUntil;
  const elapsed = job.created_at ? Math.max(0, Math.floor((now - new Date(job.created_at).getTime()) / 1000)) : 0;
  const elapsedLabel = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`;

  // ─── State copy ─────────────────────────────────────────────────────────────

  let title, sub, ringSpinning = false;
  if (status === "pending" || status === "processing") {
    title = STATUS_MESSAGES[statusMsgIdx];
    sub = job.file_type === "pdf" ? "Reading your PDF" : "Reading your photo";
    ringSpinning = true;
  } else if (status === "completed") {
    title = isProminent ? "Pattern ready!" : "Tap to review";
    sub = isProminent ? "Tap to review" : (job.file_type === "pdf" ? "PDF imported" : "Photo imported");
  } else if (status === "failed") {
    title = "Bev got tangled";
    sub = job.error_message ? truncate(job.error_message, 80) : "Try again";
  }

  // ─── Layout / sizing ────────────────────────────────────────────────────────

  const baseWidth = isMobile ? 240 : 280;
  const expandedWidth = isMobile ? 280 : 360;
  const desktopRight = 24;
  const desktopBottom = 24;
  const mobileRight = 16;

  const containerStyle = {
    position: "fixed",
    bottom: isMobile ? `calc(16px + env(safe-area-inset-bottom, 0px))` : `${desktopBottom}px`,
    right: isMobile ? `${mobileRight}px` : `${desktopRight}px`,
    width: expanded ? expandedWidth : baseWidth,
    zIndex: 50,
    borderRadius: 16,
    padding: expanded ? 16 : 12,
    transition: "width .25s ease, padding .25s ease, transform .25s ease",
    cursor: "pointer",
    fontFamily: T.sans,
    color: isProminent ? "#FFFFFF" : T.ink,
    ...(isProminent ? PROMINENT_STYLE : SETTLED_STYLE),
    ...(isProminent && {
      animation: "wovelyPillPulse 1.2s ease-in-out infinite",
    }),
  };

  // Modal sheet for expanded mobile state — replaces inline expand
  if (isMobile && expanded) {
    return (
      <>
        <PillKeyframes />
        <div onClick={() => setExpanded(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", backdropFilter: "blur(4px)",
          zIndex: 49,
        }}/>
        <div style={{
          position: "fixed", left: 0, right: 0,
          bottom: `env(safe-area-inset-bottom, 0px)`,
          background: T.modal, borderRadius: "20px 20px 0 0",
          padding: "20px 20px 28px",
          zIndex: 50,
          boxShadow: "0 -8px 32px rgba(45,58,124,0.18)",
          fontFamily: T.sans,
        }}>
          <SheetContents
            job={job}
            elapsedLabel={elapsedLabel}
            statusMsg={STATUS_MESSAGES[statusMsgIdx]}
            onClose={() => setExpanded(false)}
            onTapReview={() => handleTap()}
            onTapTryAgain={() => handleTap()}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PillKeyframes />
      <div role="status" aria-live="polite" onClick={handleTap} style={containerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <BevAvatar spinning={ringSpinning} prominent={isProminent} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 600,
              color: isProminent ? "#FFFFFF" : T.ink,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{title}</div>
            <div style={{
              fontSize: 11,
              color: isProminent ? "rgba(255,255,255,0.85)" : T.ink2,
              marginTop: 2,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{sub}</div>
          </div>
          {(status === "pending" || status === "processing") && (
            <div style={{
              fontSize: 11, color: T.ink3, fontVariantNumeric: "tabular-nums", flexShrink: 0,
            }}>{elapsedLabel}</div>
          )}
        </div>
        {expanded && !isMobile && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}`, fontSize: 12, color: T.ink2, lineHeight: 1.6 }}>
            <div><strong>Type:</strong> {job.file_type === "pdf" ? "PDF" : "Photo"}</div>
            <div><strong>Elapsed:</strong> {elapsedLabel}</div>
            {job.extraction_method && <div><strong>Method:</strong> {job.extraction_method}</div>}
            {job.retry_count > 0 && <div><strong>Retries:</strong> {job.retry_count}</div>}
            {status === "failed" && (
              <button onClick={(e) => { e.stopPropagation(); handleTap(); }} style={{
                marginTop: 12, background: T.terra, color: "#FFF", border: "none", borderRadius: 10,
                padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%",
              }}>Try again</button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function PillKeyframes() {
  return (
    <style>{`
      @keyframes wovelyPillPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.025)} }
      @keyframes wovelyPillRing { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }
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

function SheetContents({ job, elapsedLabel, statusMsg, onClose, onTapReview, onTapTryAgain }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <BevAvatar spinning={job.status === "pending" || job.status === "processing"} prominent={false} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.serif, fontSize: 16, color: T.ink, fontWeight: 600 }}>
            {job.status === "completed" ? "Pattern ready"
              : job.status === "failed" ? "Bev got tangled"
              : statusMsg}
          </div>
          <div style={{ fontSize: 12, color: T.ink2, marginTop: 2 }}>
            {job.file_type === "pdf" ? "PDF import" : "Photo import"}
          </div>
        </div>
        <button onClick={onClose} aria-label="close" style={{
          background: T.linen, border: "none", borderRadius: 99, width: 30, height: 30,
          cursor: "pointer", fontSize: 16, color: T.ink3,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>×</button>
      </div>

      <div style={{ background: T.linen, borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 12, lineHeight: 1.7 }}>
        <Row label="Status" value={prettyStatus(job.status)} />
        <Row label="Elapsed" value={elapsedLabel} />
        {job.extraction_method && <Row label="Method" value={job.extraction_method} />}
        {job.retry_count > 0 && <Row label="Retries" value={String(job.retry_count)} />}
        {job.error_message && <Row label="Error" value={job.error_message} />}
      </div>

      {job.status === "completed" && (
        <button onClick={onTapReview} style={primaryBtn}>Review pattern →</button>
      )}
      {job.status === "failed" && (
        <button onClick={onTapTryAgain} style={primaryBtn}>Try again</button>
      )}
      {(job.status === "pending" || job.status === "processing") && (
        <div style={{ fontSize: 11, color: T.ink3, textAlign: "center", paddingTop: 4 }}>
          You can navigate away — Bev will keep working in the background.
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
      <span style={{ color: T.ink3, fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{label}</span>
      <span style={{ color: T.ink, fontSize: 12, textAlign: "right", maxWidth: "65%", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

const primaryBtn = {
  width: "100%", background: T.terra, color: "#FFF", border: "none", borderRadius: 12,
  padding: "12px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer",
  boxShadow: "0 4px 14px rgba(155,126,200,0.3)",
};

function truncate(s, n) {
  if (!s || s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function prettyStatus(s) {
  if (s === "pending") return "Queued";
  if (s === "processing") return "Processing";
  if (s === "completed") return "Completed";
  if (s === "failed") return "Failed";
  return s;
}
