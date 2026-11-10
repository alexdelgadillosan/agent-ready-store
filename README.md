# AgentCart

**Real agentic commerce for Shopify.** A public MCP server, a real LLM buyer, real inventory reservations, real Shopify Draft Orders and real PayPal Orders v2 checkout — with a merchant dashboard built on AG Grid.

> Most “agentic commerce” demos script a fake catalog and fake a payment. This one does not. If a dependency is unavailable, the feature is cut. It is never replaced by mock data.

---

## Why this exists

AI agents can research products, but they still cannot reliably buy from an ordinary Shopify store. Scraping a storefront is brittle, and handing checkout back to a human breaks the workflow. The big platforms are shipping their own closed agentic checkout; independent merchants are left out.

Agent-Ready Store gives any Shopify merchant the missing layer **today**, without waiting for Store Sync, ACP, UCP or any early-access program:

- a standards-based **MCP endpoint** that any agent can call,
- **atomic inventory reservations** so agents cannot oversell,
- **Shopify Draft Orders** for real totals and a real order record,
- **PayPal Orders v2** for a real payment flow,
- and a **dashboard** that shows the money, stock and agent activity.

No claims of integration with ChatGPT or Gemini. No early-access features. No mocked endpoints.

---

## What is real (and what “sandbox” means)

| Component | Implementation |
|---|---|
| Catalog, variants, prices, images | Shopify Admin GraphQL API (`2026-10`), cached in Postgres |
| Inventory | Shopify `inventoryQuantity` + Postgres reservations with per-variant advisory locks |
| Cart totals | Shopify `draftOrderCreate` (subtotal and tax computed by Shopify; explicit free-shipping line) |
| Order | Shopify `draftOrderComplete(paymentPending: false)` — a real order in the Shopify admin |
| Payment | PayPal Orders v2 **sandbox**: create order → buyer approves → capture |
| Buyer agent | OpenAI-compatible chat completions with real function/tool calling |
| Agent interface | MCP Streamable HTTP at `/api/mcp` with five core tools |
| Dashboard | Next.js UI + AG Grid Community reading Postgres |

**Sandbox is not a mock.** The PayPal sandbox is the production Orders v2 API with test credentials. The same code runs against live credentials by changing `PAYPAL_ENV=live`; the hackathon requires sandbox for submissions.

There is **no seed script, no fake product list, no simulated payment result and no hardcoded order**.

### Catalog Hub

Catalog Hub accepts the documented CSV and JSON contracts at `/api/catalog-hub/import`.
Use `mode: "preview"` before committing an import. Imported products can then be
reviewed with `POST /api/catalog-hub/publish` using `mode: "dry-run"`; only an
explicit `mode: "commit"` publishes active Shopify products, images, variants and
inventory. Fixtures are never publishable production data.

Publishing requires a real source and valid provenance. Brand catalogs are not
generated or copied from an unverified dataset: add only sources for which the
merchant has permission or an explicit feed/API license. The generic importer
supports any brand once its authorized CSV/JSON feed is available.

### Currency policy

The intended Shopify store currency is **USD**. Set the store's base currency in
Shopify Admin before production use; the Admin API flow does not silently change
that store setting. AgentCart's Frankfurter/BCE rates are dated display/reference
quotes only. Shopify remains the source of truth for Draft Order totals and PayPal
is charged only with the amount and currency returned by Shopify.

---

## Architecture

```
                    ┌──────────────────────────────┐
                    │ Shopify development store    │
                    │ products · stock · orders    │
                    └──────────────┬───────────────┘
                                   │ Admin GraphQL API
                                   ▼
┌──────────────────────────────────────────────────────────────┐
│ Next.js 15 on Render                                         │
│                                                              │
│  /api/shopify/sync ──► catalog cache (Postgres)              │
│                                                              │
│  /api/mcp ───────────► MCP server (Streamable HTTP)          │
│      search_products · get_product · create_cart             │
│      get_cart_status · complete_checkout                     │
│                                                              │
│  /api/agent ─────────► LLM tool-calling loop                 │
│                                                              │
│  checkout: reservations (advisory lock, TTL)                 │
│            + Shopify Draft Order                             │
│            + PayPal Orders v2                                │
│                                                              │
│  /dashboard ─────────► AG Grid (orders, stock, events)       │
└───────────────┬──────────────────────────────┬───────────────┘
                │ SQL                          │ HTTPS
                ▼                              ▼
         Render Postgres                 PayPal sandbox
```

### Purchase lifecycle

1. `POST /api/shopify/sync` pulls the active catalog and inventory from Shopify.
2. An MCP client or the built-in agent calls `search_products`.
3. `create_cart`:
   - validates limits and available stock,
   - takes `pg_advisory_xact_lock(hashtext(variant_id))` per variant,
    - inserts `reservations` with the configured checkout TTL (30 minutes by default),
   - creates a Shopify Draft Order and calculates real totals,
   - creates a PayPal order for that exact total.
4. The buyer opens the PayPal approval URL and approves with a sandbox buyer account.
5. The return page calls `POST /api/checkout/complete`, which:
   - claims the cart atomically (`open → processing`),
   - captures the PayPal order with an idempotency key,
   - completes the Shopify Draft Order,
   - persists the order, consumes reservations and decrements cached stock.
6. The order appears in Shopify admin and on `/dashboard`.

If capture or Shopify completion fails, the cart returns to `open` so the operation can be retried. If the reservation expired before capture, the order is refused and the hold is released.

---

## Stack

- **Next.js 15.5** (App Router) + **React 19** + TypeScript
- **Postgres** (Render) + **Drizzle ORM**
- **MCP**: `mcp-handler@2` + `@modelcontextprotocol/server@2` + Zod 4
- **Shopify Admin GraphQL API** `2026-10`
- **PayPal Orders v2** via raw REST (no mock SDK wrapper)
- **LLM**: any OpenAI-compatible `/chat/completions` endpoint with tool calling
- **AG Grid Community 36** with the Quartz theming API
- **Render** web service + Postgres

---

## Repository layout

```
app/
  page.tsx                     landing page + catalog sync trigger
  chat/page.tsx                buyer agent UI
  dashboard/page.tsx           merchant dashboard
  checkout/return/page.tsx     PayPal return + capture page
  api/
    health/route.ts            configuration + database health
    shopify/sync/route.ts      catalog and inventory sync
    mcp/route.ts               MCP Streamable HTTP endpoint
    agent/route.ts             LLM tool-calling loop
    dashboard/route.ts         dashboard data
    cart/status/route.ts       cart + order status
    checkout/complete/route.ts capture + complete Shopify order
    paypal/webhook/route.ts    optional PayPal webhook handler
components/                    Chat, Dashboard, AG Grid, return page
lib/
  shopify.ts                   Admin GraphQL, draft orders, stock cache
  paypal.ts                    OAuth, create/capture/webhook verification
  fx.ts                        ECB reference FX rates via Frankfurter, TTL cache
  reservations.ts              advisory-lock reservations + TTL
  tools.ts                     shared tool implementations
  mcp.ts                       MCP tool registration
  agent.ts                     OpenAI-compatible tool-calling loop
  schema.ts                    Drizzle tables
scripts/verify.mjs             live health + MCP tool verification
```

---

## Prerequisites

- Node.js 20+ (developed on 22)
- A Shopify **development store** and a custom app token
- A PayPal Developer app in **sandbox** plus a sandbox buyer account
- An OpenAI-compatible LLM API key
- Postgres (local Docker or Render)

### Shopify custom app

In Shopify admin → **Settings → Apps and sales channels → Develop apps → Create an app**, enable Admin API scopes:

```
read_products
read_inventory
write_draft_orders
```

These are the only scopes the code uses. Install the app and copy the **Admin API access token** (`shpat_…`).

Create 8–12 products in the store. For each variant, enable **Track quantity** and set stock; untracked variants return `null` inventory and are cached as zero.

A complete walkthrough for Shopify, PayPal and the LLM key is in [docs/CREDENTIALS.md](./docs/CREDENTIALS.md).

### PayPal sandbox

1. Create an app at <https://developer.paypal.com/dashboard/applications/sandbox>.
2. Copy the **Client ID** and **Secret**.
3. Create or use a **sandbox personal (buyer) account** under Testing Tools → Sandbox Accounts. You will log in with those credentials when approving a payment.

### LLM

Any provider with an OpenAI-compatible chat completions API and tool calling works. Set `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL`. The default model is `gpt-4.1-mini`.

---

## Setup

```bash
git clone <your-repo-url> agent-ready-store
cd agent-ready-store
npm install
cp .env.example .env.local
```

Fill `.env.local`, then create the schema:

```bash
npm run db:push
```

Start the app:

```bash
npm run dev
```

Sync the real catalog:

```bash
curl -X POST http://localhost:3000/api/shopify/sync
```

Check configuration and the MCP endpoint:

```bash
curl http://localhost:3000/api/health
npm run verify -- http://localhost:3000
```

Run the real reservation race test against the local database:

```bash
npm run test:reservations
```

It inserts a temporary variant with one unit of stock, races two reservations, asserts that exactly one wins, releases the holds and deletes the test rows.

Open <http://localhost:3000/chat>, ask for a product, provide a shipping address, then approve the PayPal sandbox payment. The return page captures it and the order shows up in Shopify admin and on `/dashboard`.

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SHOPIFY_SHOP` | yes | `your-store.myshopify.com` (no protocol) |
| `SHOPIFY_ACCESS_TOKEN` | yes | Custom app Admin API token |
| `SHOPIFY_API_VERSION` | no | Defaults to `2026-10` |
| `SHOPIFY_WEBHOOK_SECRET` | no | Reserved for future Shopify webhooks |
| `PAYPAL_CLIENT_ID` | yes | Sandbox app client ID |
| `PAYPAL_CLIENT_SECRET` | yes | Sandbox app secret |
| `PAYPAL_ENV` | no | `sandbox` (default) or `live` |
| `PAYPAL_WEBHOOK_ID` | no | Enables webhook signature verification |
| `DATABASE_URL` | yes | Postgres connection string |
| `LLM_BASE_URL` | no | Defaults to `https://api.openai.com/v1` |
| `LLM_API_KEY` | yes | Provider API key |
| `LLM_MODEL` | no | Defaults to `gpt-4.1-mini` |
| `APP_URL` | yes | Public URL used for PayPal return/cancel URLs |
| `MCP_BEARER_TOKEN` | no | If set, `/api/mcp` requires this bearer token |
| `FX_PROVIDER_URL` | no | Defaults to Frankfurter `https://api.frankfurter.app` |
| `FX_CACHE_TTL_SECONDS` | no | In-memory cache TTL, 60–86400 seconds; default `900` |
| `FX_BASE_CURRENCY` | no | Base currency for the table; default `EUR` |

The Shopify token, PayPal secret, LLM key and database URL never reach the browser.

### FX reference rates and limits

`lib/fx.ts` reads the public Frankfurter API, which publishes ECB reference rates, for
`MXN`, `USD`, `CAD`, `EUR` and `GBP`. Each returned table includes the provider and
the provider's date (`timestamp`). Rates are cached in process memory until the
configured TTL expires; a restart, deploy, or multiple app instances create separate
caches. The client rejects missing, non-positive, or malformed rates and never
invents a fallback value.

These are reference/display rates, not guaranteed settlement, card, tax, or Shopify
Markets rates. FX is intentionally not connected to Shopify checkout, Draft Orders,
PayPal amounts, or Catalog Hub schema yet. Do not use `convert` to charge a buyer
without a separately agreed pricing/rounding policy and a provider appropriate for
financial settlement. Run the offline checks with `npm run test:fx`.

---

## MCP endpoint

```
POST {APP_URL}/api/mcp
Content-Type: application/json
Accept: application/json, text/event-stream
Authorization: Bearer <MCP_BEARER_TOKEN>   # only if configured
```

### Tools

| Tool | Purpose |
|---|---|
| `search_products` | Search cached Shopify catalog with live available stock |
| `get_product` | Full product detail by Shopify GID or UUID |
| `create_cart` | Reserve stock, create Draft Order, calculate totals, create PayPal order |
| `get_cart_status` | Cart totals, expiry and resulting order |
| `complete_checkout` | Capture approved PayPal order and complete the Shopify order |

Example `search_products` call:

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_products","arguments":{"query":"coffee","in_stock_only":true,"limit":5}}}'
```

Example `create_cart` arguments:

```json
{
  "items": [{ "variant_id": "gid://shopify/ProductVariant/123", "quantity": 2 }],
  "buyer": {
    "email": "buyer@example.com",
    "name": "Alex Buyer",
    "address": {
      "address1": "1 Market St",
      "city": "San Francisco",
      "province": "CA",
      "country": "US",
      "zip": "94105"
    }
  }
}
```

The response contains `approval_url`, `total_cents`, `currency`, `expires_at` and the Shopify draft order ID.

### Hard limits

- Maximum **10 units per variant** per cart.
- Maximum **$500** (50,000 cents) per cart.
- Reservation TTL **10 minutes**; expired holds are released and late capture is refused.
- One capture per PayPal order; `PayPal-Request-Id` provides idempotency.
- One finalizer per cart via an atomic `open → processing` claim.
- The agent cannot bypass these rules; they are enforced in shared server code used by both MCP and the built-in agent.

---

## Dashboard

`/dashboard` reads Postgres directly:

- captured revenue and paid order count,
- Shopify order name and PayPal capture ID,
- available inventory (cached stock minus active reservations),
- recent agent tool calls from `agent_events`.

AG Grid Community is registered with `AllCommunityModule` and themed with the Quartz theming API. No enterprise license is required.

---

## Deployment on Render

1. Push the repository to GitHub.
2. Create a **Postgres** instance on Render and copy its internal connection string.
3. Create a **Web Service**:
   - build command: `npm install && npm run build`
   - start command: `npm run start`
   - health check path: `/api/health`

   Or deploy the included `render.yaml` blueprint, which provisions the web service and database together.
4. Add every variable from `.env.example`. Set `APP_URL` to the Render URL and `PAYPAL_ENV=sandbox`.
5. Run the schema migration once from your machine against the Render database:
   ```bash
   DATABASE_URL="<render-external-url>" npm run db:push
   ```
6. Deploy, open `/api/health`, then run:
   ```bash
   npm run verify -- https://your-service.onrender.com
   ```
7. Trigger a catalog sync and complete one sandbox purchase end-to-end.

### Optional PayPal webhook

Set `PAYPAL_WEBHOOK_ID` and subscribe the sandbox app to `CHECKOUT.ORDER.APPROVED` at `{APP_URL}/api/paypal/webhook`. Signature verification uses PayPal's `verify-webhook-signature` endpoint. The return page already finalizes purchases; the webhook is a redundant server-side path for clients that close the browser.

---

## Verification checklist

- [ ] `GET /api/health` returns `ok: true`.
- [ ] `npm run test:reservations` passes against the local database.
- [ ] `POST /api/shopify/sync` reports a non-zero product/variant count.
- [ ] `npm run verify` lists all five MCP tools.
- [ ] `search_products` returns a variant GID that exists in Shopify.
- [ ] A cart reserves stock and a second agent cannot reserve the same unit.
- [ ] PayPal approval → return page → capture ID + Shopify order name.
- [ ] The order exists in Shopify admin with the correct total.
- [ ] `/dashboard` shows the order, capture ID and reduced availability.
- [ ] An expired cart is refused and its hold is released.

---

## Honest scope and limitations

- **Single merchant.** The MVP uses one Shopify custom-app token. OAuth multi-merchant is deliberately out of scope; the token is still real.
- **Sandbox payments.** Required by the hackathon. `PAYPAL_ENV=live` switches the same code to live PayPal, but live use requires compliance and real credentials.
- **Free shipping in the demo.** The Draft Order carries an explicit free-shipping line. A store that charges shipping needs a rate-selection step before the PayPal order is created.
- **Polling, not webhooks, for stock.** The dashboard reads the cached stock and active reservations; run a sync after external inventory changes. The optional PayPal webhook is implemented, Shopify webhooks are not.
- **No early-access claims.** Store Sync, Agent Ready, ACP and UCP are not used or implied.
- **No public admin auth.** `/api/shopify/sync`, `/api/dashboard` and the checkout return endpoint are reachable without a session in this demo. The MCP endpoint can be protected with `MCP_BEARER_TOKEN`. Add authentication before running a real merchant storefront.
- **Automated coverage is narrow.** `scripts/verify.mjs` checks health and MCP discovery; `scripts/test-reservations.ts` checks the overselling invariant against Postgres. Shopify, PayPal and LLM calls are verified end-to-end manually because they need real credentials.

---

## License

MIT. See [LICENSE](./LICENSE).

Built for the **PayPal AI Hackathon 2026 — Build what's next with PayPal and AI**.
