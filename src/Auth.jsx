import { useState } from "react";
import { T } from "./theme.jsx";
import { supabaseAuth } from "./supabase.js";

/* ─────────────────────────────────────────────────────────────────────────────
   Landing page — faithful port of design/Wovely Landing.dc.html (Design
   System 2b). Structure, spacing, type scale and copy come from the mockup;
   the interactive bits are wired to the real app:
     · "Start free" / hero CTA / end band  → onTryAnonymous (guest mode)
     · "Sign in"                            → auth screen (sign-in mode)
     · "Try Craft" / "Go Craft"            → stash pending-upgrade intent
       (wovely_pending_upgrade_tier/cadence in sessionStorage — App.jsx's
       post-signup auto-checkout picks it up) then open signup.
   All CSS is scoped under .wv-land so nothing leaks into the app shell.
   ──────────────────────────────────────────────────────────────────────────── */

const CORD_IMG = "https://res.cloudinary.com/dmaupzhcx/image/upload/e_background_removal/c_crop,g_center,h_0.9,w_1.0/e_trim/v1782961067/website-assets/yarn-cord-gold-frayed.png";

const LANDING_CSS = `
.wv-land{--bg:#FBF9FF;--panel:#fff;--ink:#2E2748;--muted:#726A92;--accent:#7B6AD4;--accentD:#6E5AC8;--line:#ECE6F8;--coral:#FF8A73;--sun:#FFC24B;--mint:#5EC9AE;--disp:'Fredoka',sans-serif;--body:'Nunito',sans-serif;min-height:100vh;background:var(--bg);color:var(--ink);font-family:var(--body);position:relative;background-image:repeating-linear-gradient(45deg,rgba(123,106,212,.03) 0 1.5px,transparent 1.5px 9px)}
.wv-land *{box-sizing:border-box}
.wv-land .pagecord{position:fixed;top:0;left:0;height:100vh;width:26px;z-index:40;pointer-events:none;display:flex;flex-direction:column;filter:drop-shadow(3px 2px 3px rgba(90,58,10,.5)) drop-shadow(6px 5px 8px rgba(90,58,10,.28))}
.wv-land .pagecord img{width:22px;height:auto;display:block}
.wv-land .pagecord img.fl{transform:scaleY(-1)}
.wv-land .top{display:flex;align-items:center;gap:26px;padding:16px 54px;position:sticky;top:0;background:rgba(251,249,255,.88);backdrop-filter:blur(10px);z-index:30}
.wv-land .logo{display:flex;align-items:center;gap:11px;font-family:var(--disp);font-weight:600;font-size:24px;cursor:pointer}
.wv-land .logo img{width:44px;height:44px;border-radius:50%;border:2.5px solid #fff;box-shadow:0 6px 14px -6px rgba(90,66,160,.5)}
.wv-land .logo b{color:var(--accent);font-weight:700}
.wv-land .tlinks{display:flex;gap:22px;margin-left:auto;align-items:center}
.wv-land .tlink{font-weight:800;font-size:14.5px;color:var(--muted);cursor:pointer;text-decoration:none}
.wv-land .tlink:hover{color:var(--accent)}
.wv-land .cta{border:0;border-radius:14px;padding:13px 24px;background:var(--accent);color:#fff;font-family:var(--body);font-weight:800;font-size:15px;cursor:pointer;box-shadow:0 14px 26px -12px var(--accent);transition:.15s}
.wv-land .cta:hover{transform:translateY(-1px)}
.wv-land .cta.big{padding:17px 34px;font-size:17px;border-radius:16px}
.wv-land .cta.gold{background:linear-gradient(120deg,#FFD98A,#F5B93E);color:#5A3E0E;box-shadow:0 14px 26px -12px rgba(200,150,40,.7)}
.wv-land .ghost{border:1.5px solid var(--line);border-radius:14px;padding:13px 22px;background:#fff;color:var(--ink);font-family:var(--body);font-weight:800;font-size:15px;cursor:pointer}
.wv-land .hero{display:grid;grid-template-columns:1fr 1.05fr;gap:52px;align-items:center;max-width:1160px;margin:0 auto;padding:40px 54px 16px}
.wv-land .eyebrow{display:inline-flex;align-items:center;gap:8px;font-weight:800;font-size:13px;letter-spacing:.15em;text-transform:uppercase;color:var(--accent)}
.wv-land .h1{font-family:var(--disp);font-weight:600;font-size:52px;line-height:1.05;letter-spacing:-.015em;margin:13px 0 0}
.wv-land .uline{color:var(--accentD);background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 14' preserveAspectRatio='none'%3E%3Cpath d='M3 9 C 40 3, 80 13, 120 7 S 190 6, 197 8' fill='none' stroke='%237B6AD4' stroke-width='4' stroke-linecap='round' stroke-dasharray='7 6'/%3E%3C/svg%3E") left bottom/100% 12px no-repeat;padding-bottom:14px;white-space:nowrap}
.wv-land .sub{font-weight:600;font-size:18px;line-height:1.5;color:var(--muted);margin:16px 0 0;max-width:480px}
.wv-land .ctarow{display:flex;align-items:center;gap:16px;margin-top:22px;flex-wrap:wrap}
.wv-land .micro{font-weight:800;font-size:13px;color:var(--muted)}
.wv-land .micro b{color:var(--mint)}
.wv-land .chips{display:flex;flex-wrap:wrap;gap:9px;margin-top:18px}
.wv-land .chip{display:inline-flex;align-items:center;gap:7px;font-weight:800;font-size:13px;background:#fff;border:1px solid var(--line);border-radius:999px;padding:9px 14px}
.wv-land .chip svg{color:var(--mint);flex:none}
.wv-land .heroviz{position:relative}
.wv-land .vizcard{border-radius:26px;overflow:hidden;border:1px solid var(--line);box-shadow:0 40px 80px -40px rgba(46,39,72,.55);position:relative;height:330px;margin-left:52px}
.wv-land .coverfill{position:relative;overflow:hidden;background:#EDE7F7}
.wv-land .cf-bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:blur(22px) saturate(1.15);transform:scale(1.22)}
.wv-land .cf-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center;z-index:1}
.wv-land .vizbev{position:absolute;bottom:-24px;left:-30px;width:245px;filter:drop-shadow(0 18px 26px rgba(90,66,160,.45));z-index:3}
.wv-land .vizbadge{position:absolute;top:16px;left:16px;z-index:3;display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.95);border-radius:999px;padding:9px 15px;font-weight:800;font-size:13px;color:#1E8A63;box-shadow:0 10px 22px -12px rgba(46,39,72,.5)}
.wv-land .vizrow{position:absolute;bottom:16px;right:16px;z-index:3;display:inline-flex;align-items:center;gap:10px;background:rgba(255,255,255,.95);border-radius:14px;padding:11px 15px;font-weight:800;font-size:13px;box-shadow:0 10px 22px -12px rgba(46,39,72,.5)}
.wv-land .vizrow .bar{width:110px;height:8px;border-radius:99px;background:var(--line);overflow:hidden}
.wv-land .vizrow .bar span{display:block;height:100%;width:64%;border-radius:99px;background:linear-gradient(90deg,var(--accent),#C98BE0)}
.wv-land .sect{max-width:1160px;margin:0 auto;padding:44px 54px 0}
.wv-land .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:30px}
.wv-land .stat{background:#fff;border:1px solid var(--line);border-radius:22px;padding:26px 24px}
.wv-land .statrow{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.wv-land .statn{font-family:var(--disp);font-weight:600;font-size:58px;line-height:.95;color:var(--accentD);white-space:nowrap;letter-spacing:-.02em}
.wv-land .statu{font-size:26px;font-weight:600;color:var(--accent);margin-left:3px}
.wv-land .statk{font-weight:900;font-size:12.5px;letter-spacing:.11em;text-transform:uppercase;color:#1E8A63;margin-top:10px}
.wv-land .stats-s b{color:var(--accentD)}
.wv-land .clk{flex:none;opacity:.9}
.wv-land .clk svg{display:block}
.wv-land .clk-m{transform-origin:20px 20px;animation:wvclkspin 1.6s linear infinite}
.wv-land .clk-h{transform-origin:20px 20px;animation:wvclkspin 19.2s linear infinite}
@keyframes wvclkspin{to{transform:rotate(360deg)}}
.wv-land .stats-s{font-weight:700;font-size:13.5px;color:var(--muted);line-height:1.55;margin-top:9px}
.wv-land .statfoot{display:flex;align-items:center;gap:15px;background:#F2EEFB;border-radius:18px;padding:17px 22px;margin-top:16px;font-weight:700;font-size:14.5px;line-height:1.55;color:var(--ink)}
.wv-land .statfoot img{width:52px;height:52px;border-radius:50%;border:2.5px solid #fff;box-shadow:0 6px 14px -6px rgba(90,66,160,.5);flex:none}
.wv-land .statfoot b{color:var(--accentD)}
.wv-land .sect-h{font-family:var(--disp);font-weight:600;font-size:36px;letter-spacing:-.01em;text-align:center}
.wv-land .sect-s{font-weight:700;font-size:15.5px;color:var(--muted);text-align:center;margin:10px auto 0;max-width:520px;line-height:1.55}
.wv-land .how{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:30px}
.wv-land .howc{background:#fff;border:1px solid var(--line);border-radius:22px;padding:0 0 24px;position:relative;overflow:visible}
.wv-land .howimg{height:132px;border-radius:20px 20px 0 0;display:block;margin-bottom:20px}
.wv-land .howbody{padding:0 24px}
.wv-land .hown{position:absolute;top:-13px;left:24px;background:var(--accent);color:#fff;font-family:var(--disp);font-weight:600;font-size:14px;padding:5px 13px;border-radius:999px;z-index:2;box-shadow:0 6px 14px -6px rgba(46,39,72,.5)}
.wv-land .howic{width:52px;height:52px;border-radius:15px;background:#F2EEFB;color:var(--accent);display:flex;align-items:center;justify-content:center}
.wv-land .how-t{font-family:var(--disp);font-weight:600;font-size:20px;margin-top:16px}
.wv-land .how-s{font-weight:700;font-size:14px;color:var(--muted);line-height:1.55;margin-top:7px}
.wv-land .craftband{max-width:1160px;margin:46px auto 0;padding:0 54px}
.wv-land .craftin{background:linear-gradient(#fff,#fff) padding-box,linear-gradient(135deg,#F2C744,#E9A83C 45%,#F6E7C9) border-box;border:2px solid transparent;border-radius:28px;padding:32px 38px;display:grid;grid-template-columns:1fr 1.3fr;gap:32px;align-items:center;box-shadow:0 30px 60px -34px rgba(200,150,40,.45)}
.wv-land .craftbadge{display:inline-flex;align-items:center;gap:5px;background:linear-gradient(120deg,#FFD98A,#F5B93E);color:#5A3E0E;font-weight:800;font-size:11px;letter-spacing:.07em;text-transform:uppercase;padding:5px 11px;border-radius:999px}
.wv-land .craft-h{font-family:var(--disp);font-weight:600;font-size:32px;margin-top:14px;line-height:1.1}
.wv-land .craft-s{font-weight:700;font-size:14.5px;color:var(--muted);margin-top:10px;line-height:1.55}
.wv-land .craftlist{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.wv-land .craftit{display:flex;gap:10px;align-items:flex-start;background:#FFFBF2;border:1px solid #F6E7C9;border-radius:14px;padding:13px 15px;font-weight:800;font-size:13.5px;line-height:1.4}
.wv-land .craftit svg{color:#B07B1E;flex:none;margin-top:1px}
.wv-land .plans{display:grid;grid-template-columns:1fr 1.12fr;gap:22px;max-width:880px;margin:28px auto 0}
.wv-land .pcard{background:#fff;border:1px solid var(--line);border-radius:26px;padding:26px 28px;display:flex;flex-direction:column}
.wv-land .pcard.hot{border:2px solid var(--accent);box-shadow:0 34px 70px -36px var(--accent);position:relative}
.wv-land .pop{position:absolute;top:-14px;left:30px;background:var(--accent);color:#fff;font-weight:800;font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;padding:7px 14px;border-radius:999px}
.wv-land .pname{font-family:var(--disp);font-weight:600;font-size:25px}
.wv-land .pdesc{font-weight:700;font-size:13.5px;color:var(--muted);margin-top:4px}
.wv-land .price{display:flex;align-items:baseline;gap:3px;margin-top:20px}
.wv-land .pamt{font-family:var(--disp);font-weight:600;font-size:52px;line-height:.9}
.wv-land .pper{font-weight:800;font-size:15px;color:var(--muted)}
.wv-land .pbill{font-weight:700;font-size:12.5px;color:var(--muted);margin-top:7px;min-height:16px}
.wv-land .was{font-weight:800;font-size:17px;color:var(--muted);text-decoration:line-through;margin-left:6px;align-self:center}
.wv-land .plist{list-style:none;padding:0;margin:20px 0 0;display:flex;flex-direction:column;gap:11px}
.wv-land .plist li{display:flex;gap:10px;align-items:flex-start;font-weight:700;font-size:14px;line-height:1.4}
.wv-land .plist svg{flex:none;margin-top:2px;color:var(--accent)}
.wv-land .spacer{flex:1}
.wv-land .pbtn{margin-top:24px;border:0;border-radius:14px;padding:15px;background:var(--accent);color:#fff;font-family:var(--body);font-weight:800;font-size:15px;cursor:pointer;box-shadow:0 16px 30px -14px var(--accent)}
.wv-land .pbtn.ghost{background:#fff;color:var(--ink);border:1.5px solid var(--line);box-shadow:none}
.wv-land .seg{display:inline-flex;background:#fff;border:1px solid var(--line);border-radius:999px;padding:4px;gap:2px}
.wv-land .seg button{border:0;background:transparent;font-family:var(--body);font-weight:800;font-size:14px;color:var(--muted);padding:10px 22px;border-radius:999px;cursor:pointer}
.wv-land .seg button.on{background:var(--accent);color:#fff}
.wv-land .togrow{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:22px}
.wv-land .save{font-weight:800;font-size:12.5px;color:#6E5AC8;background:#EFE9FB;padding:8px 14px;border-radius:999px}
.wv-land .endband{max-width:1160px;margin:52px auto 0;padding:0 54px 44px}
.wv-land .endin{background:linear-gradient(120deg,#8474DA,#6E5AC8);border-radius:30px;padding:38px 46px;display:flex;align-items:center;gap:38px;color:#fff;overflow:hidden;position:relative}
.wv-land .endin img{width:130px;filter:drop-shadow(0 16px 22px rgba(40,28,90,.5));flex:none}
.wv-land .end-h{font-family:var(--disp);font-weight:600;font-size:36px;line-height:1.08}
.wv-land .end-s{font-weight:700;font-size:15.5px;color:rgba(255,255,255,.82);margin-top:12px;max-width:460px;line-height:1.55}
.wv-land .endin .cta{background:#fff;color:var(--accentD);box-shadow:0 16px 30px -14px rgba(30,20,70,.6);margin-top:24px}
.wv-land .foot{display:flex;align-items:center;gap:22px;max-width:1160px;margin:0 auto;padding:0 54px 44px;font-weight:700;font-size:13px;color:var(--muted);flex-wrap:wrap}
.wv-land .foot a{color:var(--muted);text-decoration:none;font-weight:800}
.wv-land .authwrap{min-height:calc(100vh - 90px);display:flex;align-items:center;justify-content:center;padding:40px 20px}
@media (max-width:1024px){.wv-land .hero{grid-template-columns:1fr;padding:34px 40px 10px;gap:64px}.wv-land .heroviz{order:0}.wv-land .stats{grid-template-columns:1fr 1fr}.wv-land .heroviz{max-width:560px}.wv-land .top{padding:16px 40px}.wv-land .sect{padding:54px 40px 0}.wv-land .craftin{grid-template-columns:1fr;padding:36px}.wv-land .endin{flex-direction:column;text-align:center;padding:44px 36px}.wv-land .end-s{margin-left:auto;margin-right:auto}.wv-land .pagecord{display:none}}
@media (max-width:640px){.wv-land .h1{font-size:36px}.wv-land .pcard.hot{order:-1}.wv-land .stats{grid-template-columns:1fr}.wv-land .vizbev{width:180px;left:-14px}.wv-land .vizcard{margin-left:30px;height:280px}.wv-land .statfoot{flex-direction:column;text-align:center}.wv-land .howimg{height:180px}.wv-land .uline{white-space:normal;background-size:100% 9px;padding-bottom:10px}.wv-land .hero{padding:34px 22px 6px;gap:30px}.wv-land .top{padding:14px 18px;gap:12px}.wv-land .tlink.hidem{display:none}.wv-land .sect{padding:44px 22px 0}.wv-land .how{grid-template-columns:1fr;gap:20px}.wv-land .plans{grid-template-columns:1fr}.wv-land .craftband,.wv-land .endband{padding-left:22px;padding-right:22px}.wv-land .craftlist{grid-template-columns:1fr}.wv-land .foot{padding:0 22px 36px}.wv-land .vizcard{height:300px}}
#__ph_survey_widget, div[class*="PostHog"], div[id*="posthog"], .__ph_toolbar { display: none !important; }
`;

/* Checkmark used in chips, craft list and plan lists */
const Check = ({ size = 14, sw = 3 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round"><path d="M20 6 9 17l-5-5" /></svg>
);

/* Blurred-cover image fill (mockup .coverfill — the host element carries the
   sizing class, exactly like the mockup's `class="vizcard coverfill"`) */
const CoverFill = ({ src, alt = "", className = "", children }) => (
  <div className={`${className} coverfill`}>
    <div className="cf-bg" style={{ backgroundImage: `url('${src}')` }} />
    <img className="cf-img" src={src} alt={alt} />
    {children}
  </div>
);

const PageCord = () => (
  <div className="pagecord">
    {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
      <img key={i} className={i % 2 ? "fl" : ""} src={CORD_IMG} alt="" />
    ))}
  </div>
);

const TopNav = ({ onLanding, onSignIn, onStartFree, showLinks }) => (
  <div className="top">
    <div className="logo" onClick={onLanding}>
      <img src="/bev.png" alt="Bev" />
      <span>Wove<b>ly</b></span>
    </div>
    <div className="tlinks">
      {showLinks && <>
        <a className="tlink hidem" href="#how">How Bev works</a>
        <a className="tlink hidem" href="#craft">Craft</a>
        <a className="tlink hidem" href="#pricing">Pricing</a>
      </>}
      <a className="tlink" onClick={onSignIn}>Sign in</a>
      <button className="cta" onClick={onStartFree}>Start free</button>
    </div>
  </div>
);

const Landing = ({ annual, setAnnual, onStartFree, onGoCraft }) => (
  <>
    {/* ── Hero ── */}
    <div className="hero">
      <div className="heroviz">
        <img className="vizbev" src="/bev-hero.png" alt="Bev, your Wovely guide" />
        <CoverFill src="/mommy_fiora.png" alt="Two crocheted dragons — a real Wovely maker's project" className="vizcard">
          <div className="vizbadge">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></svg>
            BevCheck · 99.7% certified
          </div>
          <div className="vizrow">Round 33 of 51<div className="bar"><span /></div>64%</div>
        </CoverFill>
      </div>
      <div>
        <div className="eyebrow">Meet Bev — she runs your craft life</div>
        <h1 className="h1">More making. <span className="uline">Less managing.</span></h1>
        <p className="sub">Patterns, progress, yarn and supplies — Bev keeps all of it organized, checked and ready, so the hours you spend hunting and re-counting go back into actually crocheting.</p>
        <div className="ctarow">
          <button className="cta big" onClick={onStartFree}>Try Wovely free</button>
          <div className="micro"><b>✓</b> No account needed · 5 free patterns</div>
        </div>
        <div className="chips">
          <div className="chip"><Check />Every pattern checked for accuracy</div>
          <div className="chip"><Check />Your place kept, row by row</div>
          <div className="chip"><Check />Supplies counted &amp; ordered from the app</div>
        </div>
      </div>
    </div>

    {/* ── Stats: the hours you get back ── */}
    <div className="sect" id="time">
      <h2 className="sect-h">The hours you’re about to <span className="uline">get back</span></h2>
      <p className="sect-s">Organizing was never the hobby. Making is. Here’s what a tidy craft life hands back to you.</p>
      <div className="stats">
        <div className="stat">
          <div className="statrow">
            <div className="statn">+4<span className="statu">hrs</span></div>
            <span className="clk">
              <svg viewBox="0 0 40 40" width="40" height="40">
                <circle cx="20" cy="20" r="17" fill="none" stroke="#C9BBEC" strokeWidth="3" />
                <line className="clk-h" x1="20" y1="20" x2="20" y2="12" stroke="#7B6AD4" strokeWidth="3" strokeLinecap="round" />
                <line className="clk-m" x1="20" y1="20" x2="20" y2="8" stroke="#5EC9AE" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </span>
          </div>
          <div className="statk">more hook time, every week</div>
          <div className="stats-s">Disorganized crafters get 2.5 hours of actual making a week. Organized ones get 6.5. <b>That’s four found hours — yours to crochet.</b></div>
        </div>
        <div className="stat">
          <div className="statrow"><div className="statn">60<span className="statu">%</span></div></div>
          <div className="statk">back in your yarn budget</div>
          <div className="stats-s">Untracked stashes re-buy yarn they already own. <b>Bev knows yours to the skein</b> — so that money buys new projects instead.</div>
        </div>
        <div className="stat">
          <div className="statrow"><div className="statn">1,000<span className="statu">+</span></div></div>
          <div className="statk">patterns, three seconds away</div>
          <div className="stats-s">Serious makers hold four-digit libraries across binders, tabs and screenshots. <b>Yours are always right there — search, tap, hook.</b></div>
        </div>
      </div>
      <div className="statfoot">
        <img src="/bev.png" alt="Bev" />
        <div>That's the job Bev took: the organizing, the counting, the checking — even the supply math. <b>Every found hour goes where it belongs: on your hook.</b></div>
      </div>
    </div>

    {/* ── How Bev works ── */}
    <div className="sect" id="how">
      <h2 className="sect-h">Bev does the fiddly part</h2>
      <p className="sect-s">Three steps between "found a pattern" and "hook in hand."</p>
      <div className="how">
        <div className="howc">
          <div className="hown">Step 1</div>
          <CoverFill src="/manatee_hero.png" className="howimg" />
          <div className="howbody">
            <div className="howic">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 3.5H7.5A1.5 1.5 0 006 5v14a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0018 19V8z" /><path d="M13.5 3.5V8H18" /></svg>
            </div>
            <div className="how-t">Hand her anything</div>
            <div className="how-s">A bought PDF, photos of a paper pattern, a Ravelry link, or a blog URL. Bev reads them all — the original goes safely into your Vault.</div>
          </div>
        </div>
        <div className="howc">
          <div className="hown">Step 2</div>
          <CoverFill src="/grab-bevcheck.png" className="howimg" />
          <div className="howbody">
            <div className="howic">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.2l7 3v4.8c0 4.4-3 7.4-7 8.8-4-1.4-7-4.4-7-8.8V6.2z" /><path d="M9 12l2 2 4-4.2" /></svg>
            </div>
            <div className="how-t">She checks the math</div>
            <div className="how-s">BevCheck verifies every row's stitch counts before you start. Errors get flagged on the exact row — no more discovering them at round 40.</div>
          </div>
        </div>
        <div className="howc">
          <div className="hown">Step 3</div>
          <CoverFill src="/grab-rows.png" className="howimg" />
          <div className="howbody">
            <div className="howic">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V9M10 19V5M16 19v-8M22 19H2" /></svg>
            </div>
            <div className="how-t">You just crochet</div>
            <div className="how-s">Tick rows as you go — your place kept on every device. Running low? Bev already counted your yardage and can order the difference.</div>
          </div>
        </div>
      </div>
    </div>

    {/* ── Craft band ── */}
    <div className="craftband" id="craft">
      <div className="craftin">
        <div>
          <div className="craftbadge">✦ Craft — $6.99/mo</div>
          <div className="craft-h">For the patterns that deserve better than a binder</div>
          <div className="craft-s">Everything in Free, plus the deep tools: Bev's best work for your most ambitious makes.</div>
          <button className="cta gold" style={{ marginTop: 22 }} onClick={onGoCraft}>Try Craft</button>
        </div>
        <div className="craftlist">
          <div className="craftit"><Check size={15} />Unlimited pattern storage</div>
          <div className="craftit"><Check size={15} />Advanced imports — multi-file, charts &amp; schematics</div>
          <div className="craftit"><Check size={15} />Collections for MCALs &amp; MKALs, clue calendar included</div>
          <div className="craftit"><Check size={15} />The Vault — every original, backed up</div>
          <div className="craftit"><Check size={15} />Gauge, yardage &amp; scale calculators</div>
          <div className="craftit"><Check size={15} />Dedicated 24/7 human support</div>
        </div>
      </div>
    </div>

    {/* ── Pricing ── */}
    <div className="sect" id="pricing">
      <h2 className="sect-h">Start free. Stay free, or go Craft.</h2>
      <p className="sect-s">No card to start. Everything you make carries over if you upgrade.</p>
      <div className="togrow">
        <div className="seg">
          <button className={annual ? "" : "on"} onClick={() => setAnnual(false)}>Monthly</button>
          <button className={annual ? "on" : ""} onClick={() => setAnnual(true)}>Annual</button>
        </div>
        <div className="save">{annual ? "Saving 34% — $4.58/mo" : "Annual saves 34%"}</div>
      </div>
      <div className="plans">
        <div className="pcard">
          <div className="pname">Free</div>
          <div className="pdesc">For the occasional make.</div>
          <div className="price"><div className="pamt">$0</div><div className="pper">forever</div></div>
          <div className="pbill">No card required</div>
          <ul className="plist">
            <li><Check size={16} sw={2.6} />5 patterns with full row tracking</li>
            <li><Check size={16} sw={2.6} />BevCheck on every import</li>
            <li><Check size={16} sw={2.6} />3 Snap &amp; Stitch photo imports a month</li>
          </ul>
          <div className="spacer" />
          <button className="pbtn ghost" onClick={onStartFree}>Start free</button>
        </div>
        <div className="pcard hot">
          <div className="pop">Most popular</div>
          <div className="pname">Craft</div>
          <div className="pdesc">For makers who mean it.</div>
          <div className="price">
            <div className="pamt">${annual ? "4.58" : "6.99"}</div>
            <div className="pper">/mo</div>
            {annual && <div className="was">$6.99</div>}
          </div>
          <div className="pbill">{annual ? "$54.99 billed yearly — 2 months free" : "billed monthly — switch to annual to save 34%"}</div>
          <ul className="plist">
            <li><Check size={16} sw={2.6} />Everything in Free, unlimited patterns</li>
            <li><Check size={16} sw={2.6} />Advanced imports + Collections (MCAL/MKAL)</li>
            <li><Check size={16} sw={2.6} />Vault, calculators &amp; 24/7 human support</li>
          </ul>
          <div className="spacer" />
          <button className="pbtn" onClick={onGoCraft}>Go Craft</button>
        </div>
      </div>
    </div>

    {/* ── End CTA band ── */}
    <div className="endband">
      <div className="endin">
        <img src="/bev-hero.png" alt="Bev" />
        <div>
          <div className="end-h">Your next make is waiting.</div>
          <div className="end-s">Bring one pattern over and see what Bev does with it. Two minutes, no card, and your hooks will thank you.</div>
          <button className="cta" onClick={onStartFree}>Start free with Bev</button>
        </div>
      </div>
    </div>

    {/* ── Footer ── */}
    <div className="foot">
      <span>© 2026 Wovely</span>
      <a href="/founders">Founders</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="mailto:bev@wovely.app">Talk to us</a>
    </div>
  </>
);

/* ── Auth form — existing working auth plumbing (visual rebuild lands with
     the auth-screens surface; keep logic identical) ── */
const AuthForm = ({ onEnter, onEnterAsNew, onTryAnonymous, initialMode = "signup" }) => {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [isSignIn, setIsSignIn] = useState(initialMode === "signin");

  const handleSignup = async () => {
    setAuthError(null);
    if (!email.trim() || !pass) { setAuthError("Please fill in all fields."); return; }
    if (pass !== confirmPass) { setAuthError("Passwords don't match."); return; }
    setLoading(true);
    try {
      const { data, error } = await supabaseAuth.signUp(email.trim(), pass);
      if (error) { setAuthError(error.msg || error.error_description || error.message || "Sign-up failed."); setLoading(false); return; }
      onEnterAsNew();
    } catch { setAuthError("Network error — please try again."); }
    setLoading(false);
  };

  const handleSignin = async () => {
    setAuthError(null);
    if (!email.trim() || !pass) { setAuthError("Please fill in all fields."); return; }
    setLoading(true);
    try {
      const { error } = await supabaseAuth.signIn(email.trim(), pass);
      if (error) { setAuthError(error.error_description || error.msg || error.message || "Invalid email or password."); setLoading(false); return; }
      onEnter();
    } catch { setAuthError("Network error — please try again."); }
    setLoading(false);
  };

  const onKey = e => {
    if (e.key === "Enter" && !loading) {
      isSignIn ? handleSignin() : handleSignup();
    }
  };

  return (
    <div style={{
      padding: 40, maxWidth: 440, width: "100%", boxSizing: "border-box",
      background: "#fff", border: `1px solid ${T.line}`, borderRadius: 28,
      boxShadow: "0 40px 80px -40px rgba(46,39,72,.45)",
    }}>
      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 0, marginBottom: 28, borderRadius: 12, padding: 4, background: T.soft }}>
        {[["Sign up", false], ["Sign in", true]].map(([label, mode]) => (
          <button key={label} onClick={() => { setIsSignIn(mode); setAuthError(null); }} style={{
            flex: 1, padding: "10px 16px", background: isSignIn === mode ? "#fff" : "transparent",
            border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700,
            color: isSignIn === mode ? T.ink : T.muted, cursor: "pointer", fontFamily: T.body,
            boxShadow: isSignIn === mode ? "0 1px 3px rgba(46,39,72,0.08)" : "none",
          }}>{label}</button>
        ))}
      </div>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: T.disp, fontSize: 26, fontWeight: 600, color: T.ink, margin: "0 0 8px", lineHeight: 1.2 }}>
          {isSignIn ? "Welcome back" : "Let's get you set up"}
        </h1>
        <p style={{ fontFamily: T.body, fontSize: 14, color: T.muted, lineHeight: 1.5, margin: 0, fontWeight: 700 }}>
          {isSignIn ? "Bev kept everything right where you left it." : <>Bev's ready when you are. Free means free — <b style={{ color: T.mint }}>5 patterns, no card.</b></>}
        </p>
      </div>

      <button
        onClick={() => supabaseAuth.signInWithOAuth("google")}
        style={{
          width: "100%", padding: 14, background: "#fff", border: `1.5px solid ${T.line}`,
          borderRadius: 14, fontSize: 15, fontWeight: 800, color: T.ink, cursor: "pointer",
          fontFamily: T.body, display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h5.9a5 5 0 01-2.2 3.3v2.8h3.6c2.1-1.9 3.3-4.8 3.3-8.2z" /><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.6l-3.6-2.8c-1 .7-2.3 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0012 23z" /><path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 010-4.4V6.9H2.1a11 11 0 000 10.2z" /><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7L19.4 4A11 11 0 002.1 6.9l3.7 2.9c.9-2.6 3.3-4.4 6.2-4.4z" /></svg>
        Continue with Google
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0", color: T.muted, fontWeight: 800, fontSize: 12 }}>
        <div style={{ flex: 1, borderTop: `1.5px dashed ${T.line}` }} />or with email<div style={{ flex: 1, borderTop: `1.5px dashed ${T.line}` }} />
      </div>

      <div onKeyDown={onKey}>
        {[
          { v: email, set: setEmail, ph: "you@example.com", type: "email" },
          { v: pass, set: setPass, ph: isSignIn ? "Password" : "Choose a password", type: "password" },
          ...(!isSignIn ? [{ v: confirmPass, set: setConfirmPass, ph: "Confirm password", type: "password" }] : []),
        ].map((f, i) => (
          <input key={i} value={f.v} onChange={e => f.set(e.target.value)} placeholder={f.ph} type={f.type}
            style={{
              width: "100%", border: `1.5px solid ${T.line}`, borderRadius: 14, padding: "14px 16px",
              fontFamily: T.body, fontWeight: 700, fontSize: 15, color: T.ink, background: "#fff",
              outline: "none", marginTop: 10, boxSizing: "border-box",
            }}
            onFocus={e => e.target.style.borderColor = T.accent}
            onBlur={e => e.target.style.borderColor = T.line}
          />
        ))}

        {authError && (
          <div style={{ background: T.soft, color: T.error, padding: "10px 14px", borderRadius: 12, fontSize: 13, marginTop: 12, fontFamily: T.body, fontWeight: 700 }}>
            {authError}
          </div>
        )}

        <button onClick={isSignIn ? handleSignin : handleSignup} disabled={loading} style={{
          width: "100%", marginTop: 16, border: 0, borderRadius: 14, padding: 15,
          background: T.accent, color: "#fff", fontFamily: T.body, fontWeight: 800, fontSize: 15,
          cursor: "pointer", opacity: loading ? 0.6 : 1, boxShadow: `0 16px 30px -14px ${T.accent}`,
        }}>
          {loading ? "Please wait..." : (isSignIn ? "Sign me in" : "Create my account")}
        </button>
      </div>

      {onTryAnonymous && !isSignIn && (
        <div style={{ marginTop: 16, textAlign: "center", fontSize: 12.5, color: T.muted, fontFamily: T.body, fontWeight: 700, lineHeight: 1.5 }}>
          Just looking? <a onClick={onTryAnonymous} style={{ fontWeight: 800, color: T.accent, cursor: "pointer" }}>Try Wovely without an account</a>
        </div>
      )}
      <div style={{ marginTop: 10, textAlign: "center", fontSize: 12.5, color: T.muted, fontFamily: T.body, fontWeight: 700, lineHeight: 1.5 }}>
        By continuing you agree to our <a href="/terms" style={{ color: T.accent, fontWeight: 800, textDecoration: "none" }}>Terms</a> &amp; <a href="/privacy" style={{ color: T.accent, fontWeight: 800, textDecoration: "none" }}>Privacy</a>.
      </div>
    </div>
  );
};

/* ── Main Auth component: landing ⇄ auth screens ── */
const Auth = ({ onEnter, onEnterAsNew, onTryAnonymous }) => {
  const [screen, setScreen] = useState("landing"); // 'landing' | 'auth'
  const [authMode, setAuthMode] = useState("signup");

  // Pricing cadence for the landing toggle. Annual is the default per the
  // mockup (annualDefault: true). Values come from Pricing Canon (locked):
  // $6.99/mo · $54.99/yr ($4.58/mo, "2 months free").
  const [annual, setAnnual] = useState(true);

  const toTop = () => { try { window.scrollTo(0, 0); } catch {} };
  const goLanding = () => { setScreen("landing"); toTop(); };
  const goAuth = (mode) => { setAuthMode(mode); setScreen("auth"); toTop(); };

  // "Go Craft" from the landing: stash the picked tier + cadence exactly like
  // TieredUpgradeModal does, so App.jsx's post-signup auto-checkout fires the
  // real Stripe flow after the account exists.
  const goCraft = () => {
    try {
      sessionStorage.setItem("wovely_pending_upgrade_tier", "craft");
      sessionStorage.setItem("wovely_pending_upgrade_cadence", annual ? "annual" : "monthly");
    } catch {}
    goAuth("signup");
  };

  return (
    <div className="wv-land">
      <style>{LANDING_CSS}</style>
      <PageCord />
      <TopNav
        onLanding={goLanding}
        onSignIn={() => goAuth("signin")}
        onStartFree={onTryAnonymous}
        showLinks={screen === "landing"}
      />
      {screen === "landing" ? (
        <Landing annual={annual} setAnnual={setAnnual} onStartFree={onTryAnonymous} onGoCraft={goCraft} />
      ) : (
        <div className="authwrap">
          <AuthForm key={authMode} initialMode={authMode} onEnter={onEnter} onEnterAsNew={onEnterAsNew} onTryAnonymous={onTryAnonymous} />
        </div>
      )}
    </div>
  );
};

export default Auth;
