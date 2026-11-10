import { env } from "./env";

export const FX_CURRENCIES = ["MXN", "USD", "CAD", "EUR", "GBP"] as const;
export type FxCurrency = (typeof FX_CURRENCIES)[number];

export interface FxRateTable {
  base: FxCurrency;
  rates: Record<FxCurrency, number>;
  /** Timestamp supplied by the provider, normalized to an ISO date. */
  timestamp: string;
  provider: string;
  expiresAt: string;
}

type FrankfurterResponse = {
  amount?: number;
  base?: string;
  date?: string;
  rates?: Record<string, number>;
};

export type FxClientOptions = {
  fetcher?: typeof fetch;
  now?: () => number;
  providerUrl?: string;
  ttlMs?: number;
  baseCurrency?: FxCurrency;
};

const providerName = "Frankfurter (ECB reference rates)";

function assertCurrency(value: string): asserts value is FxCurrency {
  if (!(FX_CURRENCIES as readonly string[]).includes(value)) {
    throw new Error(`Unsupported FX currency: ${value}`);
  }
}

function normalizeDate(date: string): string {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(timestamp)) {
    throw new Error("FX provider returned an invalid date");
  }
  return new Date(timestamp).toISOString();
}

/**
 * Creates a read-only client for Frankfurter's public ECB reference rates.
 * The fetcher and clock are injectable so validation/cache behavior can be tested
 * without making network requests.
 */
export function createFxClient(options: FxClientOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const providerUrl = (options.providerUrl ?? env.fxProviderUrl).replace(/\/$/, "");
  const ttlMs = options.ttlMs ?? env.fxCacheTtlSeconds * 1000;
  const configuredBase = options.baseCurrency ?? env.fxBaseCurrency;
  assertCurrency(configuredBase);
  const base: FxCurrency = configuredBase;
  if (!Number.isFinite(ttlMs) || ttlMs < 1) throw new Error("FX cache TTL must be positive");

  const cache = new Map<string, FxRateTable>();

  async function getRates(): Promise<FxRateTable> {
    const cached = cache.get(base);
    if (cached && Date.parse(cached.expiresAt) > now()) return cached;

    const targets = FX_CURRENCIES.filter((currency) => currency !== base).join(",");
    const url = new URL(`${providerUrl}/latest`);
    url.searchParams.set("from", base);
    url.searchParams.set("to", targets);
    const response = await fetcher(url, { method: "GET", cache: "no-store" });
    let body: FrankfurterResponse;
    try {
      body = (await response.json()) as FrankfurterResponse;
    } catch {
      throw new Error(`FX provider returned invalid JSON (${response.status})`);
    }
    if (!response.ok) throw new Error(`FX provider request failed: ${response.status}`);
    if (body.base !== base || !body.date || !body.rates) {
      throw new Error("FX provider response is missing base, date, or rates");
    }

    const rates = {} as Record<FxCurrency, number>;
    for (const currency of FX_CURRENCIES) {
      const rate = currency === base ? 1 : body.rates[currency];
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
        throw new Error(`FX provider returned no valid rate for ${currency}`);
      }
      rates[currency] = rate;
    }
    const timestamp = normalizeDate(body.date);
    const table: FxRateTable = {
      base,
      rates,
      timestamp,
      provider: providerName,
      expiresAt: new Date(now() + ttlMs).toISOString(),
    };
    cache.set(base, table);
    return table;
  }

  return {
    getRates,
    async getRate(from: string, to: string) {
      assertCurrency(from.toUpperCase());
      assertCurrency(to.toUpperCase());
      const source = from.toUpperCase() as FxCurrency;
      const target = to.toUpperCase() as FxCurrency;
      const table = await getRates();
      return {
        from: source,
        to: target,
        rate: table.rates[target] / table.rates[source],
        timestamp: table.timestamp,
        provider: table.provider,
      };
    },
    async convert(amount: number, from: string, to: string) {
      if (!Number.isFinite(amount) || amount < 0) throw new Error("FX amount must be non-negative");
      const quote = await this.getRate(from, to);
      return { ...quote, amount: amount * quote.rate };
    },
  };
}

export const fx = createFxClient();
