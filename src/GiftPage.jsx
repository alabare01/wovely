// ─── /gift, GIVE WOVELY FOR A YEAR ───────────────────────────────────────────
//
// The gift page for the grand opening (00 System/_state/wovely-grand-opening.json,
// surface 5). One thing to do: the Stripe gift link, Craft Annual, the
// recipient's email as a custom field on the Stripe page. Set up by hand within
// a business day with a note from Bev. READ FROM STRIPE 2026-09-14 18:2x UTC:
// plink_1UFcAYE7r5ExERfENr7gDqiQ is a RECURRING yearly price (5499, interval
// year) in the buyer's name, so the page says it renews on the giver's card.
// Making it a one-time charge is a Stripe price change and is Adam's call. The price is the one canonical annual
// price from Auth.jsx; the monthly code COZY is not a gift and is not on this
// page, so nobody buys a year at full price thinking the code applied.

import { useBreakpoint, T } from "./theme.jsx";
import PublicPage, { CARD, LABEL, useJsonLd } from "./components/PublicPage.jsx";
import { CRAFT_ANNUAL_TOTAL } from "./Auth.jsx";

export const GIFT_LINK = "https://buy.stripe.com/9B6cN58IIfGldmz4DU33W0g";

export const PAGE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Wovely Craft, one year, as a gift",
  url: "https://wovely.app/gift",
  description:
    "A year of Wovely Craft for a crocheter you love: a hundred patterns, Bev checking every one, and a place kept in every project, sent with a note.",
  offers: { "@type": "Offer", price: CRAFT_ANNUAL_TOTAL, priceCurrency: "USD", url: GIFT_LINK },
};

const STEPS = [
  ["You pay for the year", `$${CRAFT_ANNUAL_TOTAL} for the year, on a secure Stripe page. Put their email in the box marked for it, and yours as the buyer.`],
  ["Bev writes to them", "Within a business day their Wovely account is on Craft for a full year, and they get a note from Bev saying who it is from. If they do not have an account yet, the note walks them through making one, free."],
  ["They open it and go", "A hundred patterns, Bev checking each one, the counter and the repeat dots on every row, and every project's place kept on every device they own. The year is billed to you, not to them, and it renews on your card a year from now unless you cancel first: one click from the receipt Stripe sends you, any time."],
];

export default function GiftPage() {
  const { isMobile } = useBreakpoint();
  useJsonLd(PAGE_SCHEMA);

  const Button = ({ children }) => (
    <a href={GIFT_LINK} style={{
      display: "inline-block", padding: isMobile ? "14px 22px" : "15px 28px", borderRadius: 999,
      background: `linear-gradient(180deg, ${T.accent}, ${T.accentD})`,
      color: "#fff", fontFamily: T.body, fontWeight: 800, fontSize: isMobile ? 15 : 16,
      textDecoration: "none", boxShadow: "0 8px 20px -10px rgba(90,66,160,.7)",
    }}>{children}</a>
  );

  return (
    <PublicPage
      path="/gift"
      h1="Give Wovely for a year"
      intro={
        <>
          For the person who has three blankets going and a paper pattern in every drawer. A year of
          Wovely Craft holds every pattern they love in one warm place, counts rows with them, and Bev
          checks their work. Sent with a note, ready within a business day.
        </>
      }
      closer={{
        title: "Not sure they would use it?",
        body: "Send them the free version first. It holds five patterns, ticks every row, and needs no card. If they are still hooked in a week, come back here.",
        cta: "Try Wovely free",
        note: "No account needed to start",
        askReason: "Not today? Bev will remind you in November, once, and that is all.",
        askWhere: "gift",
      }}
    >
      <div style={{ ...CARD, padding: isMobile ? 20 : 30, marginBottom: 18, background: "#FFF7EC", borderColor: "#F1DFC7" }}>
        <div style={{ ...LABEL, color: "#C96A3B" }}>The gift</div>
        <div style={{ fontFamily: T.disp, fontWeight: 700, fontSize: isMobile ? 24 : 30, color: "#2B1D16", lineHeight: 1.15, margin: "6px 0 8px" }}>
          One year of Wovely Craft, ${CRAFT_ANNUAL_TOTAL}
        </div>
        <p style={{ fontFamily: T.body, fontSize: 15, lineHeight: 1.7, color: "#2B1D16", margin: "0 0 18px", maxWidth: 560 }}>
          A hundred patterns instead of five. BevCheck on every one. Collections for the big projects.
          Their year starts the day Bev switches it on, within a business day of your order.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
          <Button>Give a year of Craft</Button>
          <span style={{ fontFamily: T.body, fontSize: 13, color: "#7A5A45", fontWeight: 600 }}>
            Secure checkout by Stripe. Their email goes in the box on the next page.
          </span>
        </div>
      </div>

      <div style={{ ...CARD, padding: isMobile ? 20 : 28 }}>
        <div style={{ ...LABEL, marginBottom: 14 }}>How it works</div>
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 16 }}>
          {STEPS.map(([t, b], i) => (
            <li key={t} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <span style={{
                flexShrink: 0, width: 30, height: 30, borderRadius: 10, background: T.soft, color: T.accent,
                fontFamily: T.body, fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
              }}>{i + 1}</span>
              <div>
                <div style={{ fontFamily: T.disp, fontWeight: 700, fontSize: 17, color: T.ink, marginBottom: 3 }}>{t}</div>
                <div style={{ fontFamily: T.body, fontSize: 14.5, lineHeight: 1.65, color: T.ink2 }}>{b}</div>
              </div>
            </li>
          ))}
        </ol>
        <div style={{ marginTop: 22, fontFamily: T.body, fontSize: 13.5, lineHeight: 1.6, color: T.muted }}>
          Questions before you buy, or a recipient who already has Craft: <a href="mailto:support@wovely.app" style={{ color: T.accent, fontWeight: 700 }}>support@wovely.app</a>, and Bev answers.
        </div>
      </div>
    </PublicPage>
  );
}
