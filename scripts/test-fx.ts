import assert from "node:assert/strict";
import { createFxClient } from "../lib/fx";

let calls = 0;
let clock = 1_000_000;
const client = createFxClient({
  now: () => clock,
  ttlMs: 1_000,
  fetcher: async (input) => {
    calls += 1;
    const url = String(input);
    assert.match(url, /from=EUR/);
    return new Response(JSON.stringify({
      base: "EUR",
      date: "2026-11-06",
      rates: { MXN: 20, USD: 2, CAD: 3, GBP: 0.5 },
    }), { status: 200 });
  },
});

async function main() {
  const first = await client.convert(10, "usd", "mxn");
  assert.equal(first.amount, 100);
  assert.equal(first.provider, "Frankfurter (ECB reference rates)");
  assert.equal(first.timestamp, "2026-11-06T00:00:00.000Z");
  await client.getRates();
  assert.equal(calls, 1, "fresh rates should be served from cache");
  clock += 1_001;
  await client.getRates();
  assert.equal(calls, 2, "expired rates should be refreshed");

  await assert.rejects(() => client.getRate("JPY", "USD"), /Unsupported FX currency/);
  await assert.rejects(() => client.convert(-1, "USD", "EUR"), /non-negative/);
  console.log("FX tests passed");
}

void main();
