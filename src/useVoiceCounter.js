import { useState, useRef, useEffect, useCallback } from "react";

// Hands-free counting. The hook never has to leave the yarn: say "next" (or
// "done", "round done", "plus") to mark the round finished, "undo" (or "back",
// "oops") to take one off. Web Speech API only, nothing leaves the phone
// except what the browser's own dictation already sends. Mic permission is the
// browser's prompt, and a refusal turns the button off with one plain line.
//
// Why this exists: r/crochet, r/CrochetHelp and r/knitting all ask for a
// counter they do not have to touch (wovely-problems.json p-005, 2026-09-14).
// Chrome and Safari (iOS 14.5+) both carry SpeechRecognition; Firefox does
// not, and there the button simply does not render.

const SR = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const voiceSupported = !!SR;

const UNDO = /\b(undo|back|oops|minus|take one off|one back)\b/i;
const NEXT = /\b(next|done|plus|finished|tick|check|round|row|one more|got it)\b/i;

export default function useVoiceCounter({ onNext, onUndo, enabled }) {
  const [on, setOn] = useState(false);
  const [heard, setHeard] = useState("");
  const [why, setWhy] = useState("");
  const rec = useRef(null);
  const nextRef = useRef(onNext);
  const undoRef = useRef(onUndo);
  const onRef = useRef(false);
  nextRef.current = onNext;
  undoRef.current = onUndo;

  const stop = useCallback(() => {
    onRef.current = false;
    setOn(false);
    try { rec.current && rec.current.stop(); } catch {}
    rec.current = null;
  }, []);

  const start = useCallback(() => {
    if (!SR) return;
    setWhy("");
    let r;
    try { r = new SR(); } catch { setWhy("This browser cannot listen. Chrome or Safari can."); return; }
    r.lang = (typeof navigator !== "undefined" && navigator.language) || "en-US";
    r.continuous = true;
    r.interimResults = false;
    r.maxAlternatives = 1;
    let strikes = 0;
    r.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      if (!last || !last.isFinal) return;
      const said = String(last[0].transcript || "").trim();
      if (!said) return;
      strikes = 0;
      if (UNDO.test(said)) { undoRef.current && undoRef.current(); setHeard(`Heard "${said}", one back`); }
      else if (NEXT.test(said)) { nextRef.current && nextRef.current(); setHeard(`Heard "${said}", round done`); }
      else setHeard(`Heard "${said}". Say next or undo.`);
    };
    // A browser with the API but no speech service behind it (a Chromium build
    // without Google's keys, some privacy browsers) fails with "network" on
    // every start. Three of those in a row with nothing heard is that case, and
    // it stops instead of spinning.
    r.onerror = (e) => {
      const code = e && e.error;
      if (code === "not-allowed" || code === "service-not-allowed") { setWhy("The mic is off for this site. Allow it in the browser and try again."); stop(); }
      else if (code === "network") { if (++strikes >= 3) { setWhy("This browser cannot listen right now. Chrome or Safari on your phone can."); stop(); } }
      else if (code === "no-speech" || code === "aborted") { /* onend restarts */ }
      else { setWhy("Listening stopped. Tap the mic to start again."); stop(); }
    };
    // Chrome ends a continuous session after a few seconds of silence and
    // iOS ends it after every utterance; while the button is on, come back.
    r.onend = () => { if (onRef.current && rec.current === r) { try { r.start(); } catch { stop(); } } };
    rec.current = r;
    onRef.current = true;
    setOn(true);
    setHeard("Listening. Say next, or undo.");
    try { r.start(); } catch { setWhy("Could not start listening. Tap the mic again."); stop(); }
  }, [stop]);

  const toggle = useCallback(() => { if (onRef.current) stop(); else start(); }, [start, stop]);

  // Leaving the counter (focus mode closed, part complete, unmount) stops the mic.
  useEffect(() => { if (!enabled && onRef.current) stop(); }, [enabled, stop]);
  useEffect(() => () => { onRef.current = false; try { rec.current && rec.current.stop(); } catch {} }, []);

  return { on, heard, why, toggle, supported: voiceSupported };
}
