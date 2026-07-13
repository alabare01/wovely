import React, { useState, useEffect } from "react";
import { T } from "./theme.jsx";

/* ─────────────────────────────────────────────────────────────────────────────
   VaultReveal — the Free→Craft upgrade celebration (Tier B).
   Ported from design/Wovely App 2b.dc.html (.vwrap/.vframe/.vdoor/.vwheel/.vinner).
   A dark fullscreen overlay: a 3D vault door swings open (rotateY) to reveal the
   gold interior with Bev, confetti falls, then "Welcome to Craft" + copy + CTA
   fade in on a stagger. Fires on upgrade success.

   Canon note: the mockup subtitle said "unlimited patterns" — Craft is a 100
   fair-use tier (ratified 2026-07-12), so the copy here does NOT claim unlimited.
   Gold is intentional here (the Vault IS the premium reveal), which is exactly
   the "Craft/premium only" carve-out of the gold-is-scarce rule.
   ──────────────────────────────────────────────────────────────────────────── */

const CONFETTI_COLORS = [T.accent, T.coral, T.sun, T.mint, T.sky, T.pink, "#FFE3A0"];
// Deterministic spread (stable across renders/screenshots).
const CONFETTI = Array.from({ length: 26 }, (_, i) => ({
  left: ((i * 37) % 100) + (i % 3),
  delay: ((i * 0.23) % 2.6).toFixed(2),
  bg: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  dur: (2.4 + (i % 5) * 0.35).toFixed(2),
}));

const VAULT_CSS = `
.vaultreveal .vwrap{position:fixed;inset:0;z-index:2000;background:radial-gradient(120% 120% at 50% 30%,#3A2F63,#241B46);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:28px;overflow:hidden;animation:vfade .35s ease both;font-family:${T.body}}
@keyframes vfade{from{opacity:0}to{opacity:1}}
.vaultreveal .vscene{perspective:1000px}
.vaultreveal .vframe{position:relative;width:282px;height:282px;border-radius:50%;background:radial-gradient(circle at 35% 28%,#4A3D85,#241B46 72%);box-shadow:inset 0 0 0 3px #6A5AA8,inset 0 0 0 15px #372C66,inset 0 0 0 18px #191338,0 8px 18px rgba(255,255,255,.06),0 54px 110px -42px rgba(0,0,0,.85)}
.vaultreveal .vbolt{position:absolute;left:50%;top:50%;width:11px;height:11px;margin:-5.5px;border-radius:50%;background:radial-gradient(circle at 32% 28%,#CFC5F0,#7A6BB8 55%,#372C66);box-shadow:0 1.5px 3px rgba(0,0,0,.55),inset 0 -1px 2px rgba(0,0,0,.3)}
.vaultreveal .vhinge{position:absolute;left:-7px;top:50%;width:16px;height:70px;margin-top:-35px;border-radius:8px;background:linear-gradient(90deg,#7A6BB8,#3A2F63);box-shadow:3px 4px 8px rgba(0,0,0,.45),inset 0 2px 3px rgba(255,255,255,.25)}
.vaultreveal .vinner{position:absolute;inset:22px;border-radius:50%;background:radial-gradient(circle at 50% 32%,#FFF3D2,#F7CD62 62%,#DCA83E);display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:inset 0 12px 34px rgba(120,70,0,.4),inset 0 -6px 18px rgba(255,244,214,.6)}
.vaultreveal .vinner img{width:120px;animation:vbevbob 2.2s ease-in-out infinite;filter:drop-shadow(0 10px 14px rgba(120,70,0,.35))}
@keyframes vbevbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
.vaultreveal .vdoor{position:absolute;inset:22px;border-radius:50%;background:radial-gradient(circle at 38% 30%,#9C8EE4,#7666CE 46%,#5B49B0 74%,#48398F);transform-origin:0% 50%;transition:transform 1.3s cubic-bezier(.6,.05,.25,1) .75s;display:flex;align-items:center;justify-content:center;box-shadow:inset -14px -20px 44px rgba(25,16,60,.55),inset 9px 12px 26px rgba(255,255,255,.16),inset 0 0 0 2px rgba(255,255,255,.09),6px 0 16px rgba(10,6,30,.45)}
.vaultreveal .vdoorring{position:absolute;inset:26px;border-radius:50%;border:2px solid rgba(255,255,255,.13);box-shadow:inset 0 0 26px rgba(25,16,60,.4)}
.vaultreveal .vopen .vdoor{transform:rotateY(-108deg)}
.vaultreveal .vwheel{position:relative;width:110px;height:110px;transition:transform .85s cubic-bezier(.4,0,.2,1)}
.vaultreveal .vopen .vwheel{transform:rotate(240deg)}
.vaultreveal .vsp{position:absolute;left:50%;top:0;width:11px;height:100%;margin-left:-5.5px;border-radius:99px;background:linear-gradient(90deg,#B98A28,#FFE3A0 46%,#B98A28);box-shadow:0 2px 5px rgba(40,20,0,.45)}
.vaultreveal .r60{transform:rotate(60deg)}.vaultreveal .r120{transform:rotate(120deg)}
.vaultreveal .vwrim{position:absolute;inset:-3px;border-radius:50%;border:9px solid #E9B93C;box-shadow:inset 0 2px 4px rgba(255,255,255,.55),inset 0 -2px 5px rgba(120,70,0,.45),0 4px 10px rgba(60,30,0,.4)}
.vaultreveal .vhub{position:absolute;inset:37px;border-radius:50%;background:radial-gradient(circle at 36% 30%,#FFE9B4,#F2C744 55%,#C28F24);box-shadow:0 5px 12px rgba(0,0,0,.5),inset 0 -4px 9px rgba(120,70,0,.45),inset 0 2px 3px rgba(255,255,255,.6)}
.vaultreveal .v-t{font-family:${T.disp};font-weight:600;font-size:38px;color:#fff;margin-top:30px;opacity:0;transform:translateY(12px);transition:.5s 1.5s}
.vaultreveal .v-s{font-weight:700;font-size:15.5px;color:rgba(255,255,255,.75);margin-top:8px;max-width:440px;line-height:1.5;opacity:0;transform:translateY(12px);transition:.5s 1.7s}
.vaultreveal .rvgo{margin-top:26px;border:0;border-radius:14px;padding:15px 30px;background:${T.accent};color:#fff;font-family:${T.body};font-weight:800;font-size:15.5px;cursor:pointer;box-shadow:0 14px 26px -12px ${T.accent};opacity:0;transform:translateY(12px);transition:.5s 1.9s}
.vaultreveal .vopen .v-t,.vaultreveal .vopen .v-s,.vaultreveal .vopen .rvgo{opacity:1;transform:none}
.vaultreveal .confetto{position:absolute;top:-24px;width:10px;height:15px;border-radius:3px;opacity:0;animation:vcfall linear infinite}
@keyframes vcfall{0%{opacity:0;transform:translateY(-24px) rotate(0)}8%{opacity:1}100%{opacity:0;transform:translateY(104vh) rotate(560deg)}}
@media (max-width:640px){.vaultreveal .vframe{width:230px;height:230px}.vaultreveal .v-t{font-size:30px}}
`;

const BOLTS = [0, 45, 90, 135, 180, 225, 270, 315];

export default function VaultReveal({ open, onDone }) {
  const [mounted, setMounted] = useState(false);
  const [vopen, setVopen] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setVopen(false);
      const t = setTimeout(() => setVopen(true), 650); // matches mockup doUpgrade timing
      return () => clearTimeout(t);
    }
    setMounted(false); setVopen(false);
  }, [open]);

  if (!mounted) return null;

  return (
    <div className="vaultreveal">
      <style>{VAULT_CSS}</style>
      <div className={"vwrap" + (vopen ? " vopen" : "")}>
        {CONFETTI.map((c, i) => (
          <span key={i} className="confetto" style={{ left: c.left + "%", background: c.bg, animationDelay: c.delay + "s", animationDuration: c.dur + "s" }} />
        ))}
        <div className="vscene">
          <div className="vframe">
            {BOLTS.map(deg => <span key={deg} className="vbolt" style={{ transform: `rotate(${deg}deg) translateY(-131px)` }} />)}
            <div className="vhinge" />
            <div className="vinner"><img src="/bev-hero.png" alt="Bev" /></div>
            <div className="vdoor">
              <div className="vdoorring" />
              <div className="vwheel">
                <span className="vwrim" />
                <span className="vsp" />
                <span className="vsp r60" />
                <span className="vsp r120" />
                <span className="vhub" />
              </div>
            </div>
          </div>
        </div>
        <div className="v-t">Welcome to Craft</div>
        <div className="v-s">The Vault is open. Every original you make is kept safe, and your whole library comes with you from here on.</div>
        <button className="rvgo" onClick={onDone}>Start making</button>
      </div>
    </div>
  );
}
