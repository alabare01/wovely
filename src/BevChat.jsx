import { useState, useRef, useEffect, useCallback } from "react";
import { supabaseAuth } from "./supabase.js";

/* ─────────────────────────────────────────────────────────────────────────────
   Bev Chat — the guided "Untangler-in-chief" intake assistant.
   Faithful port of the chatTree + panel in design/Wovely App 2b.dc.html.
   Bev greets, offers tap-chips, collects structured data (category/area/
   severity/note) down a branching tree, and on a "logged/sent" node submits
   the whole thing to /api/send-feedback so it actually reaches Adam.
   Styling uses the 2b chat classes injected below (they read the app's CSS vars).
──────────────────────────────────────────────────────────────────────────── */

// Bev's voice — verbatim from the mockup. Do not sanitize.
const CHAT_TREE = {
  root: { say: ["Hi! I'm all ears. What can I untangle today?"], opts: [
    { t: "Something's broken", set: { category: "Bug" }, go: "bug1" },
    { t: "I have an idea", set: { category: "Idea" }, go: "idea1" },
    { t: "Billing & plan", set: { category: "Billing" }, go: "bill1" },
    { t: "Just saying hi", set: { category: "Love note" }, go: "love1" },
  ] },
  bug1: { say: ["Oh no, a tangle. Tell me what happened, in your own words."], input: true, next: "bug2" },
  bug2: { say: ["Got it. Where did it snag?"], opts: [
    { t: "Importing a pattern", set: { area: "Import" }, go: "bug3" },
    { t: "Counting rows", set: { area: "Row counter" }, go: "bug3" },
    { t: "BevCheck", set: { area: "BevCheck" }, go: "bug3" },
    { t: "Somewhere else", set: { area: "Other" }, go: "bug3" },
  ] },
  bug3: { say: ["And how bad is it?"], opts: [
    { t: "Minor snag", set: { severity: "Minor" }, go: "bugLog" },
    { t: "Annoying knot", set: { severity: "Annoying" }, go: "bugLog" },
    { t: "Fully unraveled", set: { severity: "Broken" }, go: "bugAdam" },
  ] },
  bugLog: { say: ["Logged and tagged. Adam and I go through these every morning, promise."], card: true, submit: true, opts: [
    { t: "One more thing", go: "root" }, { t: "All done", go: "bye" } ] },
  bugAdam: { say: ["That's a founder-level tangle. I'm handing this straight to Adam, he sees these first.", "Anything he should know before I pass it over?"], input: true, next: "adamSent" },
  adamSent: { say: ["Sent. Adam replies by email, usually the same day."], card: true, adam: true, submit: true, opts: [
    { t: "One more thing", go: "root" }, { t: "All done", go: "bye" } ] },
  idea1: { say: ["Ooh, tell me. What should Wovely learn to do?"], input: true, next: "idea2" },
  idea2: { say: ["I like it already. How much would it help you?"], opts: [
    { t: "Nice to have", set: { severity: "Nice to have" }, go: "ideaLog" },
    { t: "I'd use it weekly", set: { severity: "Weekly use" }, go: "ideaLog" },
    { t: "Take my money", set: { severity: "Take my money" }, go: "ideaAdam" },
  ] },
  ideaLog: { say: ["Into the idea basket it goes. Danielle and Adam read every single one."], card: true, submit: true, opts: [
    { t: "One more thing", go: "root" }, { t: "All done", go: "bye" } ] },
  ideaAdam: { say: ["\"Take my money\" skips the basket. That one goes straight to the founder."], card: true, adam: true, submit: true, opts: [
    { t: "One more thing", go: "root" }, { t: "All done", go: "bye" } ] },
  bill1: { say: ["Money stuff, let's sort it properly. What do you need?"], opts: [
    { t: "Change my plan", go: "billPlan" },
    { t: "A charge looks wrong", set: { area: "Charge" }, go: "billAdam" },
    { t: "Cancel Craft", set: { area: "Cancellation" }, go: "billCancel" },
  ] },
  billPlan: { say: ["Easy, plans live right here. Want me to open them?"], opts: [
    { t: "Open plans", act: "paywall" }, { t: "Never mind", go: "root" } ] },
  billAdam: { say: ["Billing worries go straight to a human, no bots between you and your money.", "What should Adam look at?"], input: true, next: "adamSent" },
  billCancel: { say: ["I'd hate to see you go. Want me to pause Craft instead? Your patterns stay in the Vault either way."], opts: [
    { t: "Pause instead", go: "pauseDone" },
    { t: "Still cancel", set: { severity: "Wants to cancel" }, go: "cancelAdam" },
  ] },
  pauseDone: { say: ["Done, paused, not forgotten. Everything will be right where you left it."], opts: [ { t: "Thanks, Bev", go: "bye" } ] },
  cancelAdam: { say: ["Okay. Adam handles every cancellation himself, anything you'd like him to know?"], input: true, next: "adamSent" },
  love1: { say: ["You'll make me blush. Go on…"], input: true, next: "loveEnd" },
  loveEnd: { say: ["Saved where Danielle and Adam will see it first thing. Thank you, really."], card: true, submit: true, opts: [
    { t: "Share a make in the Circle", act: "circle" }, { t: "All done", go: "bye" } ] },
  bye: { say: ["Happy hooking! I'm right here if anything tangles."], opts: [ { t: "Start over", go: "root" } ] },
};

const CHAT_CSS = `
.bevchat-scope .chatwrap{position:fixed;right:24px;bottom:24px;z-index:65;width:384px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 48px);background:#fff;border:1px solid var(--line);border-radius:24px;box-shadow:0 40px 80px -30px rgba(46,39,72,.5);display:flex;flex-direction:column;overflow:hidden;animation:bchatin .3s cubic-bezier(.2,1.2,.4,1)}
@keyframes bchatin{from{transform:translateY(18px);opacity:0}}
.bevchat-scope .chathead{display:flex;align-items:center;gap:12px;padding:14px 16px;background:linear-gradient(180deg,#8474DA,#6E5AC8);color:#fff}
.bevchat-scope .chathead img{width:40px;height:40px;border-radius:50%;border:2px solid rgba(255,255,255,.5)}
.bevchat-scope .ch-n{font-family:var(--disp);font-weight:600;font-size:17px}
.bevchat-scope .ch-s{font-weight:700;font-size:11.5px;color:rgba(255,255,255,.72)}
.bevchat-scope .ch-x{margin-left:auto;width:32px;height:32px;border-radius:50%;border:0;background:rgba(255,255,255,.16);color:#fff;cursor:pointer;font-weight:800;font-size:14px}
.bevchat-scope .chatbody{flex:1;overflow-y:auto;padding:16px 14px;display:flex;flex-direction:column;gap:9px;background:#FBF9FF}
.bevchat-scope .cmsg{max-width:82%;padding:10px 14px;border-radius:16px;font-weight:700;font-size:13.5px;line-height:1.5}
.bevchat-scope .cmsg.bev{background:#fff;border:1px solid var(--line);align-self:flex-start;border-bottom-left-radius:6px;color:var(--ink)}
.bevchat-scope .cmsg.me{background:var(--accent);color:#fff;align-self:flex-end;border-bottom-right-radius:6px}
.bevchat-scope .ctype{display:flex;gap:4px;padding:13px 14px;background:#fff;border:1px solid var(--line);border-radius:16px;border-bottom-left-radius:6px;align-self:flex-start}
.bevchat-scope .ctype span{width:7px;height:7px;border-radius:50%;background:#C9BBEC;animation:bctb 1s infinite}
.bevchat-scope .ctype .d2{animation-delay:.15s}.bevchat-scope .ctype .d3{animation-delay:.3s}
@keyframes bctb{0%,100%{opacity:.35;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}
.bevchat-scope .ccard{align-self:flex-start;max-width:88%;background:#fff;border:1.5px solid var(--line);border-radius:16px;padding:12px 15px 13px}
.bevchat-scope .ccard.adam{border-color:var(--accent);background:#F8F5FF}
.bevchat-scope .cc-lab{font-weight:800;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--accent)}
.bevchat-scope .cc-row{display:flex;gap:8px;font-weight:700;font-size:12.5px;color:var(--muted);margin-top:6px}
.bevchat-scope .cc-row b{color:var(--ink);font-weight:800;flex:none}
.bevchat-scope .chatchips{display:flex;flex-wrap:wrap;gap:8px;padding:6px 14px 12px;background:#FBF9FF}
.bevchat-scope .cchip{border:1.5px solid #D8CCF2;background:#fff;border-radius:999px;padding:9px 15px;font-family:var(--body);font-weight:800;font-size:13px;color:var(--accentD);cursor:pointer;transition:.15s}
.bevchat-scope .cchip:hover{border-color:var(--accent);background:#F5F1FD}
.bevchat-scope .chatfoot{display:flex;gap:9px;padding:12px 14px;border-top:1px solid var(--line);background:#fff}
.bevchat-scope .chatin{flex:1;border:1.5px solid var(--line);border-radius:999px;padding:11px 16px;font-family:var(--body);font-weight:700;font-size:13.5px;color:var(--ink);outline:none}
.bevchat-scope .chatin:focus{border-color:var(--accent)}
.bevchat-scope .chatsend{width:42px;height:42px;border-radius:50%;border:0;background:var(--accent);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none}
@media (max-width:640px){.bevchat-scope .chatwrap{right:0;bottom:0;width:100%;max-width:100%;border-radius:24px 24px 0 0;height:78vh}}
`;

export default function BevChat({ open, onClose, onPaywall, onCircle }) {
  const [msgs, setMsgs] = useState([]);
  const [node, setNode] = useState(null);
  const [typing, setTyping] = useState(false);
  const dataRef = useRef({});
  const bodyRef = useRef(null);
  const inRef = useRef(null);
  const timers = useRef([]);

  const scrollDown = useCallback(() => {
    setTimeout(() => { const b = bodyRef.current; if (b) b.scrollTop = b.scrollHeight; }, 60);
  }, []);

  const submitToAdam = useCallback((n) => {
    const d = dataRef.current;
    const category = d.category === "Love note" ? "Love it" : (d.category || "Feedback");
    const parts = [];
    if (d.area) parts.push("Area: " + d.area);
    if (d.note) parts.push(d.note);
    const payload = {
      category,
      message: parts.join("\n") || "(no message)",
      severity: d.severity || "",
      email: (supabaseAuth.getUser() && supabaseAuth.getUser().email) || "",
      page: (typeof location !== "undefined" ? location.pathname : "/"),
      browser: (typeof navigator !== "undefined" ? navigator.userAgent : ""),
      source: "bev-chat",
    };
    try {
      fetch("/api/send-feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {});
    } catch {}
  }, []);

  const buildCard = useCallback((adam) => {
    const d = dataRef.current;
    const rows = [];
    if (d.category) rows.push({ k: "Type", v: d.category });
    if (d.area) rows.push({ k: "Area", v: d.area });
    if (d.severity) rows.push({ k: "Note", v: d.severity });
    return { isCard: true, cardCls: adam ? "adam" : "", cardLab: adam ? "Sent to Adam" : "Logged", rows };
  }, []);

  const go = useCallback((key) => {
    const n = CHAT_TREE[key];
    if (!n) return;
    if (key === "root") dataRef.current = {};
    setNode(null);
    setTyping(true);
    scrollDown();
    let i = 0;
    const pushNext = () => {
      const txt = n.say[i];
      const t = setTimeout(() => {
        setMsgs(m => [...m, { isMsg: true, cls: "bev", txt }]);
        i++; scrollDown();
        if (i < n.say.length) { pushNext(); }
        else {
          if (n.submit) submitToAdam(n);
          if (n.card) setMsgs(m => [...m, buildCard(n.adam)]);
          setTyping(false); setNode(key); scrollDown();
          if (n.input) setTimeout(() => inRef.current && inRef.current.focus(), 80);
        }
      }, 500 + Math.min(1100, (txt || "").length * 13));
      timers.current.push(t);
    };
    pushNext();
  }, [scrollDown, submitToAdam, buildCard]);

  const pick = useCallback((opt) => {
    setMsgs(m => [...m, { isMsg: true, cls: "me", txt: opt.t }]);
    if (opt.set) dataRef.current = { ...dataRef.current, ...opt.set };
    scrollDown();
    if (opt.act === "paywall") { onPaywall && onPaywall(); return; }
    if (opt.act === "circle") { onCircle ? onCircle() : go("bye"); return; }
    if (opt.go) go(opt.go);
  }, [go, onPaywall, onCircle, scrollDown]);

  const send = useCallback(() => {
    const el = inRef.current; if (!el) return;
    const v = el.value.trim(); if (!v) return;
    el.value = "";
    const cur = CHAT_TREE[node];
    setMsgs(m => [...m, { isMsg: true, cls: "me", txt: v }]);
    dataRef.current = { ...dataRef.current, note: dataRef.current.note ? dataRef.current.note + " — " + v : v };
    scrollDown();
    if (cur && cur.next) go(cur.next);
  }, [node, go, scrollDown]);

  // Start / reset the conversation each time the panel opens.
  useEffect(() => {
    if (open) { setMsgs([]); setNode(null); dataRef.current = {}; go("root"); }
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
  }, [open, go]);

  if (!open) return null;
  const cur = node ? CHAT_TREE[node] : null;
  const chipsOn = !typing && cur && cur.opts;
  const inputOn = !typing && cur && cur.input;

  return (
    <div className="bevchat-scope">
      <style>{CHAT_CSS}</style>
      <div className="chatwrap" role="dialog" aria-label="Chat with Bev">
        <div className="chathead">
          <img src="/bev.png" alt="Bev" />
          <div>
            <div className="ch-n">Bev</div>
            <div className="ch-s">Untangler-in-chief · replies instantly</div>
          </div>
          <button className="ch-x" onClick={onClose} aria-label="Close chat">✕</button>
        </div>
        <div className="chatbody" ref={bodyRef}>
          {msgs.map((m, idx) => m.isCard
            ? (<div key={idx} className={"ccard " + m.cardCls}><div className="cc-lab">{m.cardLab}</div>{m.rows.map((r, j) => (<div key={j} className="cc-row"><b>{r.k}</b><span>{r.v}</span></div>))}</div>)
            : (<div key={idx} className={"cmsg " + m.cls}>{m.txt}</div>)
          )}
          {typing && <div className="ctype"><span></span><span className="d2"></span><span className="d3"></span></div>}
        </div>
        {chipsOn && (
          <div className="chatchips">
            {cur.opts.map((o, idx) => (<button key={idx} className="cchip" onClick={() => pick(o)}>{o.t}</button>))}
          </div>
        )}
        {inputOn && (
          <div className="chatfoot">
            <input className="chatin" ref={inRef} onKeyDown={e => { if (e.key === "Enter") send(); }} placeholder="Tell Bev…" />
            <button className="chatsend" onClick={send} aria-label="Send">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
