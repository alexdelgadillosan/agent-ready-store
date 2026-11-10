import Link from "next/link";
import SyncButton from "@/components/SyncButton";

const FEATURES = [
  {
    icon: "◈",
    title: "Your live Shopify catalog",
    body: "Products, variants, prices and stock come directly from Shopify. OmniBuy never invents a product or a variant.",
  },
  {
    icon: "◎",
    title: "A verified buying plan",
    body: "OmniBuy turns intent, budget and preferences into a plan with explicit constraints and an auditable decision trail.",
  },
  {
    icon: "◇",
    title: "A checkout you approve",
    body: "A Decision Proof appears before spending. PayPal handles approval and Shopify completes the order only after payment is confirmed.",
  },
  {
    icon: "◉",
    title: "Stock stays honest",
    body: "Postgres reservations and advisory locks protect inventory while a buyer finishes checkout. Holds last 30 minutes.",
  },
];

const STEPS = [
  {
      title: "Connect your store",
    body: "A custom app token is stored server-side. POST /api/shopify/sync pulls the active catalog and current inventory into Postgres.",
  },
  {
      title: "Let the buyer browse",
    body: "The built-in LLM agent (or any external MCP client) calls search_products and get_product. It never invents a variant ID.",
  },
  {
      title: "Hold stock, calculate the real total",
    body: "create_cart takes an advisory lock, inserts a TTL reservation, creates a Shopify Draft Order and asks Shopify to calculate shipping and tax.",
  },
  {
      title: "The buyer approves payment",
    body: "A real PayPal Orders v2 order is created for the Shopify-calculated total. The buyer signs in to a sandbox account and approves it.",
  },
  {
      title: "Payment becomes a Shopify order",
    body: "complete_checkout captures the PayPal payment and calls draftOrderComplete. The order appears in Shopify admin and on the AG Grid dashboard.",
  },
];

export default function HomePage() {
  return (
    <div className="shell page">
      <section className="hero">
        <span className="eyebrow"><i className="eyebrow-dot" /> LIVE COMMERCE INFRASTRUCTURE</span>
        <h1>
          Let AI decide
          <br />
          <span className="grad">with proof.</span>
        </h1>
        <p className="lead">
          OmniBuy finds the best combination of real products, proves that it
          satisfies your rules, and only spends money after you approve the plan.
        </p>
        <div className="actions">
          <Link href="/chat" className="btn btn-primary">
            Build a verified plan →
          </Link>
          <Link href="/dashboard" className="btn btn-ghost">
            View the merchant side
          </Link>
          <SyncButton />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="section-kicker">01 / THE PROMISE</span>
            <h2>Simple on the surface. Verified underneath.</h2>
            <p>
              Every claim below is backed by a live integration. If a dependency
               is unavailable, OmniBuy says so — it never fills the gap with fake data.
            </p>
          </div>
          <span className="tag tag-green">Built for trust</span>
        </div>
        <div className="grid grid-4">
          {FEATURES.map((feature) => (
            <article className="card" key={feature.title}>
              <div className="card-icon" aria-hidden="true">
                {feature.icon}
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="section-kicker">02 / THE FLOW</span>
            <h2>From intent to order in five honest steps.</h2>
            <p>
              Every step below hits Shopify, PayPal or Postgres. The agent can
              only act through the MCP tools.
            </p>
          </div>
        </div>
        <div className="steps">
          {STEPS.map((step, index) => (
            <div className="step" key={step.title}>
              <span className="step-num">{index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <span>{step.body}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="grid grid-2">
          <div className="callout">
            <h3>Trust is a product feature</h3>
            <p>
              The catalog, stock, draft orders and personal data live in a real
              Shopify development store. Payments are real Orders v2 API calls
              against the PayPal sandbox — the exact integration the hackathon
              requires. Sandbox is not a mock: the same code path runs with a
              live client ID and secret.
            </p>
          </div>
          <div className="card">
            <h3>Bring your own agent</h3>
            <p className="small">
              Point any Streamable HTTP MCP client at:
            </p>
             <p className="mono small mono-accent" style={{ marginTop: 10 }}>
              {`${"${APP_URL}"}/api/mcp`}
            </p>
            <p className="small" style={{ marginTop: 12 }}>
              Add <code className="inline">Authorization: Bearer $MCP_BEARER_TOKEN</code>{" "}
              if the token is configured. Tools: search_products, get_product,
              create_cart, get_cart_status, complete_checkout.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
