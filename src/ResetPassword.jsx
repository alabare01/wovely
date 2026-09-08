import { useState, useEffect } from "react";
import posthog from "posthog-js";

import { supabaseAuth, getSession, RESET_PASSWORD_PATH } from "./supabase.js";
import {
  MIN_PASSWORD_LENGTH, RECOVERY_FLAG, RESET_SENT_MSG,
  validateNewPassword, resetStep, resetRequestErrorMessage,
} from "./utils/passwordReset.js";

/* ─────────────────────────────────────────────────────────────────────────────
   PASSWORD RESET

   WHY THIS FILE EXISTS
   Until 2026-09-08 Wovely had no password reset at all. The sign-in card had
   no "Forgot password?" control, nothing in the tree ever called Supabase's
   /auth/v1/recover, there was no /reset-password route, and App.jsx's
   hash handler explicitly returned early on `type=recovery` — so even a
   recovery link issued by hand from the Supabase dashboard landed the user on
   the logged-out landing page and did nothing. Anyone on email + password who
   forgot it was locked out permanently with no self-service route.

   TWO STEPS, ONE COMPONENT
     · "request" — the user types their address and Supabase mails a link.
     · "set"     — the user came back through that link, the recovery session
                   is already in localStorage, and they choose a new password.

   The step is not passed in: it is DERIVED from whether a recovery session is
   sitting in sessionStorage (App.jsx writes RECOVERY_FLAG when it claims a
   `type=recovery` hash). That way the same component is correct whether it is
   reached from the sign-in card, from a bookmark, or from the email link, and
   there is no way to land on "set" with no token to set against.

   ACCOUNT ENUMERATION
   The confirmation after a request is deliberately identical whether or not
   the address has an account, because Supabase's own response is. Saying
   "no account with that email" would turn this screen into a free tool for
   testing which of a leaked address list uses Wovely.
   ──────────────────────────────────────────────────────────────────────────── */

// The rules this screen enforces live in utils/passwordReset.js, apart from
// the JSX, so node --test can exercise them for real rather than grepping this
// file for the right-looking strings. Re-exported here so a caller importing
// the screen gets the flag name with it.
export { RECOVERY_FLAG, MIN_PASSWORD_LENGTH, RESET_SENT_MSG, validateNewPassword };

export const hasRecoverySession = () => {
  let flag = false;
  try { flag = sessionStorage.getItem(RECOVERY_FLAG) === "1"; } catch { return false; }
  return resetStep({ recoveryFlag: flag, hasAccessToken: !!getSession()?.access_token }) === "set";
};

export const clearRecoveryFlag = () => {
  try { sessionStorage.removeItem(RECOVERY_FLAG); } catch {}
};

const S = {
  page: { minHeight: "100vh", background: "#FBF9FF", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px", fontFamily: "Nunito,-apple-system,sans-serif", boxSizing: "border-box" },
  card: { background: "#fff", border: "1px solid #ECE6F8", borderRadius: 28, padding: "40px 42px", width: 440, maxWidth: "100%", boxShadow: "0 40px 80px -40px rgba(46,39,72,.45)", textAlign: "center", boxSizing: "border-box" },
  bev: { width: 92, filter: "drop-shadow(0 12px 18px rgba(90,66,160,.35))" },
  h: { fontFamily: "'Fredoka',sans-serif", fontWeight: 600, fontSize: 28, marginTop: 14, color: "#2E2748" },
  s: { fontWeight: 700, fontSize: 14, color: "#726A92", marginTop: 6, lineHeight: 1.5 },
  input: { width: "100%", border: "1.5px solid #ECE6F8", borderRadius: 14, padding: "14px 16px", fontFamily: "Nunito,sans-serif", fontWeight: 700, fontSize: 15, color: "#2E2748", background: "#fff", outline: "none", marginTop: 10, boxSizing: "border-box" },
  btn: { width: "100%", marginTop: 16, border: 0, borderRadius: 14, padding: "14px 24px", background: "#7B6AD4", color: "#fff", fontFamily: "Nunito,sans-serif", fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 14px 26px -12px #7B6AD4" },
  err: { background: "#F2EEFB", color: "#C2564A", borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 700, marginTop: 12, textAlign: "left" },
  note: { background: "#EAF7F1", color: "#1E8A63", borderRadius: 12, padding: "12px 14px", fontSize: 13, fontWeight: 700, marginTop: 16, textAlign: "left", lineHeight: 1.5 },
  micro: { fontWeight: 700, fontSize: 12.5, color: "#726A92", marginTop: 16, lineHeight: 1.5 },
  link: { fontWeight: 800, color: "#7B6AD4", cursor: "pointer", textDecoration: "none", background: "none", border: 0, padding: 0, fontFamily: "Nunito,sans-serif", fontSize: "inherit" },
};

/*
  `standalone` controls only the outer chrome. Rendered from the /reset-password
  route it paints its own full-page background; rendered as a screen inside the
  landing (Auth.jsx) the landing already owns the background, so it drops it and
  inherits the surrounding .wv-land surface.

  `onDone` is where the user goes after a successful change, and `onBack` is the
  way out of the request step. Both are optional: without them the component
  falls back to a hard navigation to "/", so it is never a dead end.
*/
const ResetPassword = ({ standalone = true, onBack = null, onDone = null }) => {
  const [recovery] = useState(() => hasRecoverySession());
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    try { posthog.capture("password_reset_screen_shown", { step: recovery ? "set" : "request" }); } catch {}
  }, [recovery]);

  const goHome = () => {
    if (onDone) { onDone(); return; }
    try { window.location.assign("/"); } catch {}
  };

  const leave = () => {
    if (onBack) { onBack(); return; }
    try { window.location.assign("/"); } catch {}
  };

  const submitRequest = async () => {
    setError(null);
    const addr = email.trim();
    if (!addr) { setError("Enter the email address you sign in with."); return; }
    setBusy(true);
    const { error: err } = await supabaseAuth.resetPasswordForEmail(addr);
    setBusy(false);
    if (err) {
      // 429 is the only failure a user can act on, so it is the only one named.
      setError(resetRequestErrorMessage(err.status));
      return;
    }
    try { posthog.capture("password_reset_requested"); } catch {}
    setSent(true);
  };

  const submitNewPassword = async () => {
    setError(null);
    const check = validateNewPassword(pass, confirm);
    if (!check.ok) { setError(check.message); return; }
    setBusy(true);
    const { error: err } = await supabaseAuth.updatePassword(pass);
    setBusy(false);
    if (err) {
      setError(err.msg || err.error_description || err.message || "That link has expired. Ask for a new one and it will work.");
      return;
    }
    clearRecoveryFlag();
    try { posthog.capture("password_reset_completed"); } catch {}
    setDone(true);
  };

  const onKey = (e, fn) => { if (e.key === "Enter" && !busy) fn(); };

  const wrap = (inner) => (standalone
    ? <div style={S.page}><div style={S.card}>{inner}</div></div>
    : <div className="authwrap"><div style={{ ...S.card, boxShadow: "0 40px 80px -40px rgba(46,39,72,.45)" }}>{inner}</div></div>);

  // ── Step 2b: password changed ──
  if (done) return wrap(<>
    <img style={S.bev} src="/bev-hero.png" alt="Bev" />
    <div style={S.h}>That is sorted</div>
    <div style={S.s}>Your new password is saved and you are signed in. Bev kept everything right where you left it.</div>
    <button style={S.btn} onClick={goHome}>Go to My Wovely</button>
  </>);

  // ── Step 2a: choose a new password ──
  if (recovery) return wrap(<>
    <img style={S.bev} src="/bev-hero.png" alt="Bev" />
    <div style={S.h}>Choose a new password</div>
    <div style={S.s}>Pick something you will remember. At least {MIN_PASSWORD_LENGTH} characters.</div>
    <div onKeyDown={e => onKey(e, submitNewPassword)}>
      <div style={{ position: "relative" }}>
        <input
          style={{ ...S.input, paddingRight: 60 }}
          value={pass}
          onChange={e => setPass(e.target.value)}
          placeholder="New password"
          type={showPass ? "text" : "password"}
          autoComplete="new-password"
          aria-label="New password"
        />
        <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: 0, color: "#726A92", fontFamily: "Nunito,sans-serif", fontWeight: 800, fontSize: 12.5, cursor: "pointer", padding: 4 }}>{showPass ? "Hide" : "Show"}</button>
      </div>
      <input
        style={S.input}
        value={confirm}
        onChange={e => setConfirm(e.target.value)}
        placeholder="Type it once more"
        type={showPass ? "text" : "password"}
        autoComplete="new-password"
        aria-label="Confirm new password"
      />
      {error && <div style={S.err}>{error}</div>}
      <button style={busy ? { ...S.btn, opacity: 0.6 } : S.btn} onClick={submitNewPassword} disabled={busy}>
        {busy ? "Please wait..." : "Save my new password"}
      </button>
    </div>
    <div style={S.micro}>
      Changed your mind? <a style={S.link} href="/" onClick={e => { e.preventDefault(); clearRecoveryFlag(); leave(); }}>Back to Wovely</a>
    </div>
  </>);

  // ── Step 1: ask for the link ──
  return wrap(<>
    <img style={S.bev} src="/bev-hero.png" alt="Bev" />
    <div style={S.h}>{sent ? "Check your email" : "Reset your password"}</div>
    <div style={S.s}>{sent
      ? "Open the link on this device and you can set a new password straight away."
      : "Tell us the address you sign in with and Bev sends you a link to set a new password."}</div>
    {sent ? (
      <>
        <div style={S.note}>{RESET_SENT_MSG}</div>
        <div style={S.micro}>
          Wrong address? <button style={S.link} onClick={() => { setSent(false); setError(null); }}>Try another one</button>
          {" · "}
          <a style={S.link} href="/" onClick={e => { e.preventDefault(); leave(); }}>Back to sign in</a>
        </div>
      </>
    ) : (
      <div onKeyDown={e => onKey(e, submitRequest)}>
        <input
          style={S.input}
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          type="email"
          autoComplete="email"
          aria-label="Email address"
        />
        {error && <div style={S.err}>{error}</div>}
        <button style={busy ? { ...S.btn, opacity: 0.6 } : S.btn} onClick={submitRequest} disabled={busy}>
          {busy ? "Sending..." : "Send me a reset link"}
        </button>
        <div style={S.micro}>
          Remembered it? <a style={S.link} href="/" onClick={e => { e.preventDefault(); leave(); }}>Back to sign in</a>
        </div>
      </div>
    )}
  </>);
};

export default ResetPassword;

// Re-exported so a caller building a link to this screen imports one module.
export { RESET_PASSWORD_PATH };
