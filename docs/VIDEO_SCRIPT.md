# Three-minute demo script

Rules: one continuous real run, no acting, human voice, show the Shopify admin and the PayPal sandbox. Record at 1080p. Keep it under 3:00.

| Time | Shot | Voice-over |
|---|---|---|
| 0:00–0:15 | Landing page | “AI agents can research products, but they still can’t buy from an ordinary Shopify store. Scraping is brittle, and handing checkout back to a human defeats the point.” |
| 0:15–0:30 | Architecture section / README | “Agent-Ready Store gives any Shopify merchant a real MCP endpoint, real inventory reservations and real PayPal checkout — no early access, no mocks.” |
| 0:30–0:45 | Shopify admin product list, then click **Sync Shopify catalog** | “This is a live Shopify development store. One sync pulls the real catalog, variants, prices and stock into Postgres.” |
| 0:45–1:05 | `/chat`, type “What products do you have?” | “Here is the buyer agent. It’s a real LLM using tool calling. It has no hardcoded catalog; it must call `search_products`.” |
| 1:05–1:20 | Open **Tool trace**, show `search_products` result | “The trace shows the actual MCP tool call and the real Shopify variants and stock that came back.” |
| 1:20–1:40 | Type a request with quantity, email and address | “I’ll ask for two units, give a shipping address and a two-letter country code. The agent calls `create_cart`.” |
| 1:40–1:55 | Cart card with PayPal button; show totals | “`create_cart` reserved the stock with a Postgres advisory lock, created a Shopify Draft Order, and created a PayPal order for the Shopify-calculated total.” |
| 1:55–2:15 | Click **Pay with PayPal**, log in with the sandbox buyer, approve | “This is the PayPal sandbox. The buyer approves the payment. No real money moves, but this is the production Orders v2 flow.” |
| 2:15–2:30 | Return page with capture ID and Shopify order name | “The return page captures the payment and calls `draftOrderComplete`. One cart, one finalizer, idempotent capture.” |
| 2:30–2:45 | Shopify admin order detail | “Here is the real order in Shopify admin, with the same total and the agent tag. This is the part a mocked demo never shows.” |
| 2:45–2:58 | `/dashboard` AG Grid | “The dashboard reads Postgres: captured revenue, the PayPal capture ID, live availability and every agent tool call.” |
| 2:58–3:00 | Landing page | “Agent-Ready Store: real products, real stock, real PayPal. Works today.” |

## Recording checklist

- [ ] `GET /api/health` returns `ok: true` before recording.
- [ ] Catalog synced and visible in the dashboard.
- [ ] Sandbox buyer account ready; test one approval before the take.
- [ ] Browser zoom at 100%; hide bookmarks and personal tabs.
- [ ] Close DevTools and terminal output with secrets.
- [ ] Record the Shopify admin order and PayPal confirmation, not just the app.
- [ ] Keep the final cut under 3:00.
- [ ] Upload to YouTube as public or unlisted, and paste the URL into Devpost and README.
