import Link from "next/link";
import SyncButton from "@/components/SyncButton";

const FEATURES = [
  {
    icon: "◈",
    title: "Real Shopify catalog",
    body: "Products, variants, prices, images and stock come from the Shopify Admin GraphQL API and are cached in Postgres. Nothing is seeded or hardcoded.",
  },
  {
    icon: "◎",
    title: "Real MCP server",
    body: "Five tools are served over Streamable HTTP at /api/mcp. Any MCP client can discover the catalog, reserve stock, create a cart and capture payment.",
  },
  {
    icon: "◇",
    title: "Real PayPal checkout",
    body: "Orders v2 creates and captures a sandbox payment with idempotency keys. A real Shopify Draft Order is completed with paymentPending=false.",
  },
  {
    icon: "◉",
    title: "No overselling",
    body: "Reservations run inside a Postgres transaction with an advisory lock per variant and a 10-minute TTL. Available stock subtracts active holds.",
  },
];

const STEPS = [
  {
    title: "Connect a Shopify store",
    body: "A custom app token is stored server-side. POST /api/shopify/sync pulls the active catalog and current inventory into Postgres.",
  },
  {
    title: "The agent discovers products",
    body: "The built-in LLM agent (or any external MCP client) calls search_products and get_product. It never invents a variant ID.",
  },
  {
    title: "Inventory is reserved, totals are real",
    body: "create_cart takes an advisory lock, inserts a TTL reservation, creates a Shopify Draft Order and asks Shopify to calculate shipping and tax.",
  },
  {
    title: "The buyer approves PayPal",
    body: "A real PayPal Orders v2 order is created for the Shopify-calculated total. The buyer signs in to a sandbox account and approves it.",
  },
  {
    title: "Payment capture becomes a Shopify order",
    body: "complete_checkout captures the PayPal payment and calls draftOrderComplete. The order appears in Shopify admin and on the AG Grid dashboard.",
  },
];

export default function HomePage() {
  return (
    <div className="shell page">
      <section className="hero">
        <span className="eyebrow">PayPal AI Hackathon 2026 · Agentic Commerce</span>
        <h1>
          Your Shopify store,
          <br />
          <span className="grad">ready for AI buyers.</span>
        </h1>
        <p className="lead">
          Agent-Ready Store gives any Shopify merchant a real MCP endpoint, a
          real LLM buyer and real PayPal checkout — with live inventory, draft
          orders and payment capture. No early access, no mocked catalog, no
          scripted demo.
        </p>
        <div className="actions">
          <Link href="/chat" className="btn btn-primary">
            Talk to the buyer agent →
          </Link>
          <Link href="/dashboard" className="btn btn-ghost">
            Open merchant dashboard
          </Link>
          <SyncButton />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>Everything is wired to a live system</h2>
            <p>
              If a dependency is unavailable, the feature is cut. It is never
              replaced by fake data.
            </p>
          </div>
          <span className="tag tag-green">Zero simulation</span>
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
            <h2>How a purchase actually happens</h2>
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
            <h3>What “real” means here</h3>
            <p>
              The catalog, stock, draft orders and personal data live in a real
              Shopify development store. Payments are real Orders v2 API calls
              against the PayPal sandbox — the exact integration the hackathon
              requires. Sandbox is not a mock: the same code path runs with a
              live client ID and secret.
            </p>
          </div>
          <div className="card">
            <h3>Connect an external agent</h3>
            <p className="small">
              Point any Streamable HTTP MCP client at:
            </p>
            <p className="mono small" style={{ marginTop: 10, color: "#bcd0ff" }}>
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
