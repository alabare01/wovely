// BevGauge — Wovely "Bev Aesthetic v1.0" (Session 54 redesign)
// Two variants:
//   variant="hero"     — full-page report. Structure mirrors approved Claude
//                        Design artifact (bev_gauge_approved.html) 1:1.
//   variant="compact"  — summary gauge for crowded modals. Matches pre-S54
//                        geometry exactly; only the arc palette is new.
// Needle angle math is app-driven in both variants:
//   HIGH score = RIGHT (PASS), LOW score = LEFT (ISSUES). Flipped from the
//   original orientation in S67 — user mental model is "needle pegs right
//   when you crushed it."

const ADVISORY_IDS = new Set(["translation", "structure"]);

// --- Legacy exports (kept for callsite compatibility) ---

// Pre-calculated needle endpoints from pivot (100,100), length 58px.
// After the S67 flip: pass: 322° → (146, 64)   warning: 270° → (100, 42)   issues: 218° → (54, 64)
export const NEEDLE_END = { pass: "146 64", warning: "100 42", issues: "54 64" };

/**
 * Derive a state string from any BevCheck result shape.
 * New API returns result.state directly.
 * Old API returns result.overall ("valid"|"review"|"issues") + result.score.
 */
export const deriveState = (result) => {
  if (!result) return "warning";
  if (result.state === "pass" || result.state === "warning" || result.state === "issues") return result.state;
  if (result.overall === "valid") return "pass";
  if (result.overall === "issues") return "issues";
  if (result.overall === "review") return "warning";
  if (typeof result.score === "number") {
    if (result.score >= 80) return "pass";
    if (result.score >= 60) return "warning";
    return "issues";
  }
  return "warning";
};

/** Sentence-case a label: uppercase first char, lowercase the rest */
export const sentenceCase = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

/** Determine tier with fallback to id-based lookup */
export const checkTier = (c) => c.tier || (ADVISORY_IDS.has(c.id) ? "advisory" : "core");

// --- Shared palette ---

const ZONE = { pass: "#A4C2C3", warning: "#E2D985", issues: "#CEA0A4" };
const NAVY = "#2E2748";
const LAVENDER = "#7B6AD4";

// --- Internal helpers ---

const scoreToState = (s) => (s >= 80 ? "pass" : s >= 60 ? "warning" : "issues");
const STATE_LABEL = { pass: "Looks Good", warning: "Heads Up", issues: "Issues Found" };

// App semantics: HIGH score = RIGHT (pass), LOW score = LEFT (issues).
// 0% → 180° (leftmost), 100% → 360° (rightmost), 68% → 302.4° (upper-right of top).
const scoreToAngle = (s) => 180 + Math.max(0, Math.min(100, s)) * 1.8;

// Discrete legacy-state angles (match existing three zones)
const LEGACY_ANGLE = { pass: 322, warning: 270, issues: 218 };

/**
 * BevGauge
 * Props:
 *   variant     "hero" (default) | "compact"
 *   score       number [0..100] — drives needle position (both variants) and
 *                                 hero "XX%" readout (hero only). Derives
 *                                 state internally, wins over `state` prop.
 *   state       "pass"|"warning"|"issues" — fallback when score is absent.
 *   issueCount  number — hero-only caption pluralization. Ignored in compact.
 */
const BevGauge = ({ variant = "hero", state: stateProp, score, issueCount = 0 }) => {
  const hasScore = typeof score === "number" && !Number.isNaN(score);

  if (hasScore && stateProp != null && import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.warn("[BevGauge] Both `score` and `state` were passed — `score` takes precedence.");
  }

  const state = hasScore ? scoreToState(score) : (stateProp || "warning");
  const label = STATE_LABEL[state] ?? "Heads Up";
  const angleDeg = hasScore ? scoreToAngle(score) : (LEGACY_ANGLE[state] ?? 270);

  if (variant === "compact") {
    return <CompactGauge state={state} label={label} angleDeg={angleDeg} />;
  }

  return <HeroGauge state={state} label={label} angleDeg={angleDeg} hasScore={hasScore} score={score} issueCount={issueCount} />;
};

export default BevGauge;

// =============================================================
//  Compact variant — pre-S54 geometry, new pastel arc palette.
//  Used inside crowded import-validation modals.
// =============================================================
const CompactGauge = ({ state, label, angleDeg }) => {
  const rad = (angleDeg * Math.PI) / 180;
  const tipX = (100 + 58 * Math.cos(rad)).toFixed(2);
  const tipY = (100 + 58 * Math.sin(rad)).toFixed(2);

  return (
    <div style={{ textAlign: "center" }}>
      <svg viewBox="0 0 200 110" style={{ width: "100%", maxWidth: 280, display: "block", margin: "0 auto" }}>
        <defs>
          <linearGradient id="bevCompactGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={ZONE.issues} />
            <stop offset="50%" stopColor={ZONE.warning} />
            <stop offset="100%" stopColor={ZONE.pass} />
          </linearGradient>
          <clipPath id="bevCompactClip"><circle cx="100" cy="78" r="18" /></clipPath>
        </defs>
        {/* White edge arc */}
        <path d="M 16 100 A 84 84 0 0 1 184 100" fill="none" stroke="#fff" strokeWidth="22" strokeLinecap="round" />
        {/* Background arc */}
        <path d="M 16 100 A 84 84 0 0 1 184 100" fill="none" stroke="#ECE6F8" strokeWidth="18" strokeLinecap="round" />
        {/* Colored arc (new pastel palette) */}
        <path d="M 16 100 A 84 84 0 0 1 184 100" fill="none" stroke="url(#bevCompactGrad)" strokeWidth="18" strokeLinecap="round" />
        {/* Needle */}
        <path d={`M 100 100 L ${tipX} ${tipY}`} stroke={LAVENDER} strokeWidth="3" strokeLinecap="round" fill="none" />
        {/* Pivot white backing */}
        <circle cx="100" cy="100" r="8" fill="#fff" />
        {/* Bev image */}
        <image href="/bev_neutral.png" x="82" y="60" width="36" height="36" clipPath="url(#bevCompactClip)" preserveAspectRatio="xMidYMid slice" />
        {/* Pivot dot */}
        <circle cx="100" cy="100" r="6" fill={LAVENDER} />
      </svg>
      {/* Zone labels row — ISSUES on left, PASS on right (S67 flip) */}
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", maxWidth: 280, margin: "4px auto 0" }}>
        <span style={{ fontFamily: "'Nunito', sans-serif", fontSize: 10, fontWeight: state === "issues" ? 700 : 600, color: LAVENDER, opacity: state === "issues" ? 1 : 0.5 }}>ISSUES</span>
        <span style={{ fontFamily: "'Nunito', sans-serif", fontSize: 10, fontWeight: state === "pass" ? 700 : 600, color: LAVENDER, opacity: state === "pass" ? 1 : 0.5 }}>PASS</span>
      </div>
      {/* State label — navy for all states (rose #CEA0A4 fails AA at 18px on #F5F2FF; revisit later) */}
      <div style={{ fontFamily: "'Fredoka', serif", fontSize: 18, fontWeight: 700, color: NAVY, marginTop: 4 }}>{label}</div>
    </div>
  );
};

// =============================================================
//  Hero variant — full-page report, approved Claude Design 1:1.
// =============================================================
const HeroGauge = ({ state, label, angleDeg, hasScore, score, issueCount }) => {
  // Needle geometry (viewBox 480×240, pivot 240,180, shaft 128, tail 18)
  const CX = 240, CY = 180, SHAFT = 128, TAIL = 18;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const tipX = (CX + SHAFT * cos).toFixed(2);
  const tipY = (CY + SHAFT * sin).toFixed(2);
  const tailX = (CX - TAIL * cos).toFixed(2);
  const tailY = (CY - TAIL * sin).toFixed(2);

  const scoreText = hasScore ? Math.round(score) : null;
  const issueNoun = issueCount === 1 ? "thing" : "things";
  const showCaption = issueCount > 0;

  const a11yLabel = hasScore
    ? `Bev's read, ${Math.round(score)} out of 100${showCaption ? `. Bev spotted ${issueCount} ${issueNoun} worth a second look.` : ""}`
    : `Bev's read, ${label.toLowerCase()}${showCaption ? `. Bev spotted ${issueCount} ${issueNoun} worth a second look.` : ""}`;

  return (
    <div
      style={{
        position: "relative",
        background: "rgba(255,255,255,0.86)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.75)",
        borderRadius: 24,
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.95) inset, 0 2px 4px rgba(0,0,0,0.04), 0 18px 44px rgba(90,66,160,0.12), 0 36px 80px rgba(123,106,212,0.18)",
        padding: "28px 36px 32px",
        maxWidth: 440,
        width: "100%",
        margin: "0 auto",
      }}
    >
      {/* Row 1: BevCheck pill — left-aligned, dot + text */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "'Nunito', sans-serif",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: LAVENDER,
          padding: "3px 10px 3px 8px",
          borderRadius: 99,
          background: "rgba(123,106,212,0.12)",
          marginBottom: 8,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: LAVENDER,
            boxShadow: "0 0 0 3px rgba(123,106,212,0.18)",
          }}
        />
        BevCheck
      </span>

      {/* Row 2: Title */}
      <h3
        style={{
          fontFamily: "'Fredoka', Georgia, serif",
          fontWeight: 700,
          fontSize: 26,
          letterSpacing: "-0.015em",
          color: NAVY,
          lineHeight: 1,
          margin: "0 0 22px",
        }}
      >
        Bev's Read
      </h3>

      {/* Row 3: Gauge SVG */}
      <svg
        viewBox="0 0 480 240"
        role="img"
        aria-label={a11yLabel}
        style={{ display: "block", width: "100%", overflow: "visible" }}
      >
        <defs>
          <linearGradient id="bevGSem" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={ZONE.issues} />
            <stop offset="50%" stopColor={ZONE.warning} />
            <stop offset="100%" stopColor={ZONE.pass} />
          </linearGradient>
          <radialGradient id="bevGSpec" cx="151.8" cy="58.65" r="42" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
            <stop offset="35%" stopColor="rgba(255,255,255,0.45)" />
            <stop offset="70%" stopColor="rgba(255,255,255,0.08)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          <linearGradient id="bevGRimLight" x1="0.15" y1="0.05" x2="0.75" y2="0.4">
            <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
            <stop offset="30%" stopColor="rgba(255,255,255,0.35)" />
            <stop offset="70%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <filter id="bevArcLift" x="-20%" y="-30%" width="140%" height="220%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="4" />
            <feOffset dy="5" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.28" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="bevNeedleShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" />
            <feOffset dx="1" dy="3" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.45" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id="bevGaugeInterior">
            <path d="M 90 180 A 150 150 0 0 1 390 180 L 390 192 L 90 192 Z" />
          </clipPath>
          <clipPath id="bevClip">
            <circle cx="240" cy="132" r="36" />
          </clipPath>
          <radialGradient id="bevFade" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(123,106,212,0.22)" />
            <stop offset="70%" stopColor="rgba(123,106,212,0.06)" />
            <stop offset="100%" stopColor="rgba(123,106,212,0)" />
          </radialGradient>
        </defs>

        {/* Interior wash + Bev on background layer */}
        <g clipPath="url(#bevGaugeInterior)">
          <rect x="90" y="30" width="300" height="160" fill="rgba(248,246,255,0.85)" />
          <circle cx="240" cy="140" r="95" fill="url(#bevFade)" />
          <g clipPath="url(#bevClip)" opacity="0.8">
            <image href="/bev_neutral.png" x="204" y="96" width="72" height="72" preserveAspectRatio="xMidYMid slice" />
          </g>
        </g>

        {/* Track */}
        <path d="M 90 180 A 150 150 0 0 1 390 180" fill="none" stroke="rgba(237,228,247,0.95)" strokeWidth="24" strokeLinecap="round" />

        {/* Colored arc (glass transmission) */}
        <g filter="url(#bevArcLift)">
          <path d="M 90 180 A 150 150 0 0 1 390 180" fill="none" stroke="url(#bevGSem)" strokeWidth="24" strokeLinecap="round" opacity="0.84" />
        </g>

        {/* Inner rim lavender glow — offset DOWN to sit on inside edge */}
        <path d="M 90 180 A 150 150 0 0 1 390 180" fill="none" stroke="rgba(201,184,232,0.55)" strokeWidth="1.8" strokeLinecap="round" transform="translate(0,10.5)" />

        {/* Specular highlight — localized hotspot upper-left */}
        <path d="M 90 180 A 150 150 0 0 1 390 180" fill="none" stroke="url(#bevGSpec)" strokeWidth="24" strokeLinecap="round" />

        {/* Outer rim light — thin bright line on top-outer edge */}
        <path d="M 90 180 A 150 150 0 0 1 390 180" fill="none" stroke="url(#bevGRimLight)" strokeWidth="1.2" strokeLinecap="round" transform="translate(0,-10.5)" />

        {/* Ticks — flush inside the 24px stroke band */}
        <g stroke="#2E2748" strokeLinecap="round">
          {/* MAJOR 0/25/50/75/100 */}
          <line x1="94" y1="180" x2="102" y2="180" strokeWidth="2" />
          <line x1="136.76" y1="76.76" x2="142.42" y2="82.42" strokeWidth="2" />
          <line x1="240" y1="34" x2="240" y2="42" strokeWidth="2" />
          <line x1="343.24" y1="76.76" x2="337.58" y2="82.42" strokeWidth="2" />
          <line x1="386" y1="180" x2="378" y2="180" strokeWidth="2" />
          {/* MINOR 12.5/37.5/62.5/87.5 */}
          <g strokeWidth="1.2" opacity="0.45">
            <line x1="107.04" y1="124.88" x2="110.74" y2="126.41" />
            <line x1="184.88" y1="52.96" x2="186.41" y2="56.66" />
            <line x1="295.12" y1="52.96" x2="293.59" y2="56.66" />
            <line x1="372.96" y1="124.88" x2="369.26" y2="126.41" />
          </g>
        </g>

        {/* Zone labels — navy text with colored dots. ISSUES left, PASS right (S67 flip) */}
        <g fontFamily="Nunito,sans-serif" fontSize="11" fontWeight="700" letterSpacing="0.14em" fill={NAVY}>
          <circle cx="26" cy="180" r="4" fill={ZONE.issues} />
          <text x="54" y="184" textAnchor="middle">ISSUES</text>
          <circle cx="240" cy="6" r="4" fill={ZONE.warning} />
          <text x="240" y="20" textAnchor="middle">HEADS UP</text>
          <circle cx="454" cy="180" r="4" fill={ZONE.pass} />
          <text x="426" y="184" textAnchor="middle">PASS</text>
        </g>

        {/* Endpoint labels */}
        <g fontFamily="Nunito,sans-serif" fontSize="10" fontWeight="600" fill="#726A92">
          <text x="94" y="208" textAnchor="middle">0%</text>
          <text x="386" y="208" textAnchor="middle">100%</text>
        </g>

        {/* Needle — shaft, tail, three-ring hub */}
        <g filter="url(#bevNeedleShadow)">
          <path d={`M ${CX} ${CY} L ${tipX} ${tipY}`} stroke="#C9A84C" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d={`M ${CX} ${CY} L ${tailX} ${tailY}`} stroke="#C9A84C" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7" />
          <circle cx={CX} cy={CY} r="11" fill="#fff" stroke={NAVY} strokeWidth="1.5" />
          <circle cx={CX} cy={CY} r="5.5" fill="#C9A84C" />
          <circle cx={CX} cy={CY} r="2.2" fill={NAVY} />
        </g>
      </svg>

      {/* Row 4: Hero % */}
      {scoreText != null && (
        <div
          style={{
            textAlign: "center",
            marginTop: 14,
            fontFamily: "'Fredoka', serif",
            fontWeight: 700,
            color: NAVY,
            fontSize: 64,
            lineHeight: 1,
            letterSpacing: "-0.03em",
          }}
        >
          {scoreText}
          <small style={{ fontSize: 28, color: "#726A92", fontWeight: 400, marginLeft: 2 }}>%</small>
        </div>
      )}

      {/* Row 5: Supporting caption */}
      {showCaption && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid rgba(237,228,247,0.8)",
            textAlign: "center",
            fontFamily: "'Fredoka', serif",
            fontStyle: "italic",
            fontSize: 17,
            lineHeight: 1.4,
            color: "#726A92",
          }}
        >
          Bev spotted{" "}
          <em style={{ fontStyle: "normal", color: NAVY, fontWeight: 600 }}>
            {issueCount} {issueNoun}
          </em>{" "}
          worth a second look.
        </div>
      )}
    </div>
  );
};
