"use client";

import type { ColDef } from "ag-grid-community";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

const DataGrid = dynamic<{
  rowData: unknown[];
  columnDefs: ColDef[];
  emptyText?: string;
}>(() => import("./DataGrid"), {
  ssr: false,
  loading: () => <div className="empty">Loading grid…</div>,
});

type OrderRow = {
  id: string;
  shopify_order_name: string | null;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  paypal_capture_id: string | null;
};

type InventoryRow = {
  product: string;
  variant: string;
  sku: string;
  price: number;
  currency: string;
  stock: number;
};

type EventRow = {
  id: string;
  tool: string;
  created_at: string;
};

type DashboardData = {
  revenue: number;
  orderCount: number;
  productCount: number;
  orders: OrderRow[];
  inventory: InventoryRow[];
  events: EventRow[];
};

const orderColumns: ColDef[] = [
  {
    field: "shopify_order_name",
    headerName: "Shopify order",
    minWidth: 140,
    valueFormatter: (params) => params.value ?? "—",
  },
  {
    field: "amount",
    headerName: "Amount",
    minWidth: 120,
    valueFormatter: (params) =>
      typeof params.value === "number"
        ? `${params.data?.currency ?? ""} ${params.value.toFixed(2)}`.trim()
        : "—",
  },
  {
    field: "status",
    headerName: "Status",
    minWidth: 100,
  },
  {
    field: "paypal_capture_id",
    headerName: "PayPal capture",
    minWidth: 220,
    flex: 1,
    valueFormatter: (params) => params.value ?? "—",
  },
  {
    field: "created_at",
    headerName: "Created",
    minWidth: 190,
    valueFormatter: (params) =>
      params.value ? new Date(params.value as string).toLocaleString() : "—",
  },
];

const inventoryColumns: ColDef[] = [
  { field: "product", headerName: "Product", minWidth: 220, flex: 1 },
  { field: "variant", headerName: "Variant", minWidth: 140 },
  { field: "sku", headerName: "SKU", minWidth: 140 },
  {
    field: "stock",
    headerName: "Available",
    minWidth: 110,
  },
  {
    field: "price",
    headerName: "Price",
    minWidth: 120,
    valueFormatter: (params) =>
      typeof params.value === "number"
        ? `${params.data?.currency ?? ""} ${params.value.toFixed(2)}`.trim()
        : "—",
  },
];

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const json = (await response.json()) as DashboardData & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(json.error ?? `HTTP ${response.status}`);
      }

      setData(json);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 18 }}>
        <span className="status-line">
          <span
            className={`dot ${
              error ? "dot-red" : loading ? "dot-amber" : "dot-green"
            }`}
          />
          {loading
            ? "Reading Postgres…"
            : error
              ? "Dashboard unavailable"
              : "Live data from Postgres"}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="grid grid-4">
        <div className="card">
          <div className="stat-label">Captured revenue</div>
          <div className="stat-value">
            {data ? `$${data.revenue.toFixed(2)}` : "—"}
          </div>
          <div className="dim small">Sum of paid orders</div>
        </div>
        <div className="card">
          <div className="stat-label">Paid orders</div>
          <div className="stat-value">{data ? data.orderCount : "—"}</div>
          <div className="dim small">Shopify draft orders completed</div>
        </div>
        <div className="card">
          <div className="stat-label">Products</div>
          <div className="stat-value">{data ? data.productCount : "—"}</div>
          <div className="dim small">Synced from Shopify</div>
        </div>
        <div className="card">
          <div className="stat-label">Agent tool calls</div>
          <div className="stat-value">{data ? data.events.length : "—"}</div>
          <div className="dim small">Persisted in agent_events</div>
        </div>
      </div>

      <section className="dash-section">
        <h2>Orders</h2>
        <DataGrid
          rowData={(data?.orders ?? []) as unknown[]}
          columnDefs={orderColumns}
          emptyText="No paid orders yet. Complete a PayPal sandbox checkout from the buyer agent."
        />
      </section>

      <section className="dash-section">
        <h2>Inventory and live availability</h2>
        <DataGrid
          rowData={(data?.inventory ?? []) as unknown[]}
          columnDefs={inventoryColumns}
          emptyText="No catalog cached yet. Run a Shopify sync from the home page."
        />
      </section>

      <section className="dash-section">
        <h2>Recent agent activity</h2>
        {data && data.events.length > 0 ? (
          <div className="card">
            <div className="stack">
              {data.events.map((event) => (
                <div className="row-between small" key={event.id}>
                   <span className="mono mono-accent">
                    {event.tool}
                  </span>
                  <span className="dim">
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty">
            No agent events yet. Ask the buyer agent for a product.
          </div>
        )}
      </section>
    </div>
  );
}
