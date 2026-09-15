import { useState, useEffect } from "react";
import { T } from "./theme.jsx";
import { supabaseAuth, getSession } from "./supabase.js";
import { pulse } from "./utils/pulse.js";
import { getSource } from "./utils/source.js";
import posthog from "posthog-js";

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const GUEST_EMAIL_KEY = "wovely_guest_email";

// One field, one reason, in Bev's voice. The address goes on the guest's own
// anonymous auth user as waitlist_email (no table, no schema, no auth change)
// and the monitor hears email_captured so the room lights up. Ruled by Adam
// 2026-09-14: the guest demo asks for an email with one field.
// 2026-09-15: the landing and the end of the demo ask too (WOVELY desk: the
// field lived on a step nobody reached and read 0). A visitor there has no
// session yet, so the save opens an anonymous guest first, the same one the
// demo would have made, and writes the address on it.
export default function GuestEmailAsk({ compact = false, where = "guest_pattern", reason = "One note from Bev with the code. Nothing else, ever.", align = "center" }) {
  const [email,setEmail]=useState("");
  const [state,setState]=useState(()=>{try{return localStorage.getItem(GUEST_EMAIL_KEY)?"saved":"idle";}catch{return "idle";}});
  const [err,setErr]=useState("");
  // The ask renders in two places on a single-part pattern (under the rows
  // and on the sticky bar); saving in one settles both.
  useEffect(()=>{const on=()=>setState("saved");window.addEventListener("wovely:guest-email",on);return()=>window.removeEventListener("wovely:guest-email",on);},[]);
  const submit=async(e)=>{
    e?.preventDefault?.();
    const v=email.trim().toLowerCase();
    if(!EMAIL_OK.test(v)){setErr("That address is missing a piece.");return;}
    setErr("");setState("busy");
    if(!getSession()?.access_token){const a=await supabaseAuth.signInAnonymously();if(a?.error){setState("idle");setErr("Bev could not write that down just now. Try once more.");return;}}
    const {error}=await supabaseAuth.saveGuestEmail(v);
    if(error){setState("idle");setErr("Bev could not write that down just now. Try once more.");return;}
    try{localStorage.setItem(GUEST_EMAIL_KEY,v);}catch{}
    try{posthog.capture("email_captured",{source:getSource()||"direct",where});}catch{}
    try{pulse("email_captured",{path:window.location.pathname});}catch{}
    setState("saved");
    try{window.dispatchEvent(new Event("wovely:guest-email"));}catch{}
  };

  if(state==="saved")return(
    <div style={{fontFamily:"Nunito,sans-serif",fontSize:14,color:"#1E8A63",fontWeight:700,padding:"10px 0",textAlign:align}}>Saved. Bev will write once, with the code.</div>
  );
  return(
    <form onSubmit={submit} style={{display:"flex",flexDirection:"column",gap:8,maxWidth:360,margin:align==="center"?"0 auto":"0"}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <input type="email" inputMode="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@somewhere.com" aria-label="Email" disabled={state==="busy"} style={{flex:"1 1 180px",minWidth:0,border:`1.5px solid ${err?"#C2564A":T.border}`,borderRadius:12,padding:compact?"10px 12px":"12px 14px",fontSize:compact?14:15,fontFamily:"Nunito,sans-serif",color:T.ink,background:"#fff",outline:"none"}}/>
        <button type="submit" disabled={state==="busy"} style={{flex:"0 0 auto",background:"#7B6AD4",color:"#fff",border:"none",borderRadius:12,padding:compact?"10px 16px":"12px 20px",fontSize:14,fontWeight:700,fontFamily:"Nunito,sans-serif",cursor:state==="busy"?"default":"pointer",boxShadow:"0 4px 16px rgba(123,106,212,0.3)",opacity:state==="busy"?.7:1}}>{state==="busy"?"Saving":"Save my spot"}</button>
      </div>
      <div style={{fontSize:12,color:err?"#C2564A":"#726A92",lineHeight:1.5,fontFamily:"Nunito,sans-serif"}}>{err||reason}</div>
    </form>
  );
}
