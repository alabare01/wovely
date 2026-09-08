import { useState } from "react";
import { T } from "./theme.jsx";
import { getSession } from "./supabase.js";

/* ─────────────────────────────────────────────────────────────────────────────
   DELETE MY ACCOUNT

   WHY THIS EXISTS
   Until 2026-09-08 there was no way for a user to delete their own account.
   Not in the app, not in the API, not by asking. Wovely takes an email on the
   first screen, so the absence of an exit is a trust problem before it is a
   compliance one, and "email us" is not self-serve.

   WHAT IT ACTUALLY DOES
   Calls POST /api/delete-account, which removes the rows and then the login.
   It is not the app's existing soft delete (patterns get status='deleted' and
   stay in the table). Everything here is gone for good, which is why the
   confirmation is a typed word rather than a second button: a mis-tap must not
   be able to reach it.

   THE COPY
   Says what will happen, in the order it happens, with no softening. A person
   about to lose their work is owed the plain version.
   ──────────────────────────────────────────────────────────────────────────── */

const CONFIRM_WORD = "DELETE";

export default function DeleteAccountSection({ patternCount = 0, onDeleted }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const armed = typed.trim().toUpperCase() === CONFIRM_WORD;

  const handleDelete = async () => {
    if (!armed || busy) return;
    setBusy(true); setError(null);
    const session = getSession();
    if (!session?.access_token) {
      setError("Your session has expired. Sign in again and retry.");
      setBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({ confirm: CONFIRM_WORD }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        console.error("[Wovely] Account deletion failed:", res.status, body);
        setError(body.message || "We could not finish that. Try again, and if it keeps failing use the feedback button and we will do it by hand.");
        setBusy(false);
        return;
      }
      // The login is gone, so the stored session is now a key to nothing.
      onDeleted?.();
    } catch (e) {
      console.error("[Wovely] Account deletion error:", e?.message);
      setError("We could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  };

  const SC_LABEL = { fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: ".05em", fontFamily: T.body };

  return (
    <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 20, marginTop: 20 }}>
      <div style={{ ...SC_LABEL, marginBottom: 10 }}>Delete account</div>

      {!open && (
        <>
          <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.6, marginBottom: 14 }}>
            Closes your account and removes your patterns, your row progress, and your profile. Any subscription is cancelled first. This cannot be undone.
          </div>
          <button
            onClick={() => { setOpen(true); setError(null); setTyped(""); }}
            style={{ background: "#fff", color: T.coral, border: `1.5px solid ${T.coral}`, borderRadius: 13, padding: "11px 22px", fontSize: 13, fontWeight: 800, fontFamily: T.body, cursor: "pointer" }}
          >Delete my account</button>
        </>
      )}

      {open && (
        <div style={{ background: "#FFF4F2", border: `1.5px solid ${T.coral}`, borderRadius: 16, padding: "16px 18px" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginBottom: 8 }}>This deletes everything, permanently</div>
          <ul style={{ fontSize: 13, color: T.ink2, lineHeight: 1.7, margin: "0 0 14px", paddingLeft: 18 }}>
            <li>{patternCount === 1 ? "Your 1 pattern" : `Your ${patternCount} patterns`}, with every row you have checked off</li>
            <li>Your collections, photos, saved stitches and yarn stash</li>
            <li>Your profile and your login</li>
            <li>Any active subscription is cancelled as part of this</li>
          </ul>
          <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.6, marginBottom: 10 }}>
            Type <strong>{CONFIRM_WORD}</strong> below to confirm. There is no undo and no recovery.
          </div>
          <input
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={CONFIRM_WORD}
            aria-label={`Type ${CONFIRM_WORD} to confirm account deletion`}
            autoComplete="off"
            style={{ width: "100%", boxSizing: "border-box", padding: "12px 16px", background: "#fff", border: `1.5px solid ${armed ? T.coral : T.line}`, borderRadius: 14, color: T.ink, fontSize: 15, fontFamily: T.body, fontWeight: 700, outline: "none", letterSpacing: ".06em", marginBottom: 12 }}
          />
          {error && (
            <div style={{ fontSize: 12.5, color: T.coral, fontWeight: 700, lineHeight: 1.5, marginBottom: 12 }}>{error}</div>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={handleDelete}
              disabled={!armed || busy}
              style={{ background: armed && !busy ? T.coral : "#E7DFF3", color: "#fff", border: "none", borderRadius: 13, padding: "12px 22px", fontSize: 13.5, fontWeight: 800, fontFamily: T.body, cursor: armed && !busy ? "pointer" : "not-allowed" }}
            >{busy ? "Deleting..." : "Delete my account for good"}</button>
            <button
              onClick={() => { setOpen(false); setTyped(""); setError(null); }}
              disabled={busy}
              style={{ background: "#fff", color: T.ink2, border: `1.5px solid ${T.line}`, borderRadius: 13, padding: "12px 22px", fontSize: 13.5, fontWeight: 800, fontFamily: T.body, cursor: busy ? "not-allowed" : "pointer" }}
            >Keep my account</button>
          </div>
        </div>
      )}
    </div>
  );
}
