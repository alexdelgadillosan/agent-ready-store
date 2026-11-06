# Devpost submission draft

**Project:** Agent-Ready Store
**Track:** Agentic Commerce
**Repo:** [GitHub URL]
**Demo:** [Render URL]
**Video:** [YouTube URL, under 3 minutes]

---

## Tagline

Your Shopify store, ready for AI buyers — a real MCP server, a real LLM agent and real PayPal checkout.

## The problem

AI agents can research products, but they still cannot buy from an ordinary Shopify store. Scraping a storefront is brittle and handing checkout back to a human breaks the agent workflow. The largest platforms are building closed agentic checkout for themselves, leaving independent merchants without a practical way to sell to agents.

## The solution

Agent-Ready Store connects a Shopify store to an MCP endpoint that any agent can use. The agent searches a real catalog, sees live available stock, reserves inventory atomically, creates a real Shopify Draft Order with Shopify-calculated totals, and starts a real PayPal Orders v2 checkout. When the buyer approves, the payment is captured and the draft order becomes a real order in Shopify admin.

No early access. No mocked catalog. No scripted payment result.

## How it works

1. **Catalog sync** — Shopify Admin GraphQL API (`2026-10`) pulls products, variants, prices, images and inventory into Postgres.
2. **MCP tools** — five tools over Streamable HTTP:
   - `search_products`
   - `get_product`
   - `create_cart`
   - `get_cart_status`
   - `complete_checkout`
3. **Inventory reservations** — `create_cart` takes `pg_advisory_xact_lock(hashtext(variant_id))`, validates available stock, and inserts a 10-minute reservation. Two agents cannot reserve the last unit.
4. **Real cart totals** — a Shopify Draft Order is created for the requested variants and address. Shopify computes subtotal and tax, and the demo store uses an explicit free-shipping line. The PayPal order uses that exact total.
5. **Real payment** — PayPal Orders v2 create → buyer approval → capture, with `PayPal-Request-Id` idempotency.
6. **Real order** — `draftOrderComplete(paymentPending: false)` creates the order in Shopify. The PayPal capture ID is stored and shown on the AG Grid dashboard.
7. **Single finalizer** — a cart moves `open → processing → paid` atomically, so the return page and an optional webhook cannot double-capture.

## Why PayPal

PayPal is the payment layer that already has buyer trust and a sandbox that behaves like production. Orders v2 gives us server-side amount control, an approval URL, idempotent capture and a webhook path. The same code runs against live credentials by changing one environment variable.

## Built with

- Next.js 15.5, React 19, TypeScript
- Postgres + Drizzle ORM
- `mcp-handler` + `@modelcontextprotocol/server` + Zod 4
- Shopify Admin GraphQL API `2026-10`
- PayPal Orders v2 (sandbox)
- OpenAI-compatible chat completions with tool calling
- AG Grid Community 36 (Quartz theming)
- Render

## What is real vs. sandbox

Everything is real except the PayPal money, which is sandbox money because the hackathon requires it. The catalog, stock, draft orders, order records and dashboard come from a live Shopify development store and a live Postgres database. There is no seed script and no fake endpoint. If a dependency is unavailable, the feature is cut rather than simulated.

## Challenges

- **Overselling under concurrency.** Solved with per-variant advisory locks and TTL reservations, verified by a race test that asserts exactly one winner for the last unit.
- **Double capture.** Solved with an atomic cart status claim plus PayPal idempotency keys.
- **Real totals.** A draft order is created before payment so PayPal charges the Shopify-calculated total, not a client-supplied one.
- **Limited previews.** Early-access agent checkout programs were not used or claimed; the project is deliberately built on public APIs that work today.

## What is next

- Shopify OAuth for multi-merchant onboarding.
- Native Shopify and PayPal webhooks instead of polling.
- Merchant approval rules for high-value carts.
- More payment methods behind the same MCP contract.

## Honest limitations

- Single merchant via a custom-app token (OAuth is out of scope).
- The demo has no admin authentication; protect the deployment before production.
- Channel3 is not integrated because no real API key was available.
- Sandbox payments only in the submission.

## Links

- Repository: [GitHub URL]
- Hosted demo: [Render URL]
- Video: [YouTube URL]
- License: MIT
