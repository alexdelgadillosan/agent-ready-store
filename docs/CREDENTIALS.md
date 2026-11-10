# Credentials walkthrough

Everything below is free for development. You only need four services, and all values go into `.env.local` (gitignored). Do not commit them.

| Variable | Where it comes from |
|---|---|
| `SHOPIFY_SHOP` | Your development store domain, e.g. `agent-demo.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | Shopify custom app Admin API token (`shpat_…`) |
| `PAYPAL_CLIENT_ID` | PayPal sandbox app |
| `PAYPAL_CLIENT_SECRET` | PayPal sandbox app |
| `LLM_API_KEY` | OpenAI, Groq, OpenRouter or another OpenAI-compatible provider |

---

## 1. Shopify development store

1. Open the Shopify Dev Dashboard: <https://dev.shopify.com/dashboard> (or <https://partners.shopify.com>).
2. Create a **development store**. No paid plan is required.
3. In the store admin, create **8–12 products** so search and stock look real:
   - At least one product with multiple variants (for example sizes or colors).
   - For every variant, enable **Track quantity** and set a non-zero **Available** quantity.
   - Prefer turning off **Continue selling when out of stock**, so Shopify refuses to oversell.
4. Add a few descriptive titles and descriptions. The agent searches title and description; the demo is much better with real copy than with "Product 1".

Your `SHOPIFY_SHOP` is the domain shown in the browser, for example `agent-demo.myshopify.com`. Do **not** include `https://` or a trailing slash.

### 2. Shopify custom app

1. In the store admin: **Settings → Apps and sales channels → Develop apps**.
2. **Create an app**, name it `OmniBuy AI`.
3. Open **Configuration → Admin API integration** and enable these scopes:

   ```
   read_products
   read_inventory
   write_draft_orders
   ```

   These are the only scopes the code uses. It does not write inventory or read customer orders directly; completing a draft order creates the Shopify order.

4. **Save**, then **Install app**.
5. Open **API credentials** and copy the **Admin API access token**. It is shown once. Store it as `SHOPIFY_ACCESS_TOKEN`.

If the store is brand new, the app may need a minute before the token works.

### 3. PayPal sandbox app

1. Open <https://developer.paypal.com/dashboard/applications/sandbox>.
2. **Create App**, name it `OmniBuy AI`.
3. Copy the **Client ID** and **Secret** into `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
4. Create a **sandbox buyer account** at <https://developer.paypal.com/dashboard/accounts>:
   - Type: **Personal**
   - Country: your choice
   - Note the generated email and password. You will use them to approve the payment.
5. Keep `PAYPAL_ENV=sandbox`.

The sandbox is the production Orders v2 API with test credentials. It is not a mock.

### 4. LLM with tool calling

The agent needs an **OpenAI-compatible** `POST /chat/completions` endpoint that supports `tools` and `tool_calls`. Anthropic's native API is not compatible.

Recommended options:

| Provider | `LLM_BASE_URL` | `LLM_MODEL` |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4.1-mini` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4.1-mini` |

Create the key in the provider's dashboard and set `LLM_API_KEY`. Tool calling reliability matters more than raw model size for this demo; `gpt-4.1-mini` is the safest default.

### 5. Fill `.env.local`

```dotenv
DATABASE_URL=postgres://alex@localhost:5432/agent_ready_store_dev
APP_URL=http://localhost:3100
PAYPAL_ENV=sandbox

SHOPIFY_SHOP=agent-demo.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_...
SHOPIFY_API_VERSION=2026-10

PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...

LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=...
LLM_MODEL=gpt-4.1-mini

# Optional
MCP_BEARER_TOKEN=
```

### 6. Verify before the demo

Restart the dev server so Next.js reloads `.env.local`, then:

```bash
curl -s http://localhost:3100/api/health
curl -s -X POST http://localhost:3100/api/shopify/sync
npm run verify -- http://localhost:3100
```

`/api/health` must show `shopify`, `paypal`, `llm` and `database` all `true`. The sync must return a non-zero product and variant count. Then open `/chat` and complete one sandbox purchase.

---

## Security

- `.env.local` is gitignored. Never paste secrets into the repo, the README, a screenshot or the video.
- The Shopify token grants Admin API access to the store. Use a development store, not a live merchant store.
- Rotate the PayPal secret and LLM key after the hackathon if the deployment is public.
- Set `MCP_BEARER_TOKEN` on a public deployment so only your agent can call the tools.
