"use client";

import { useState } from "react";

type SyncState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; products: number; variants: number }
  | { status: "error"; message: string };

export default function SyncButton() {
  const [state, setState] = useState<SyncState>({ status: "idle" });

  async function sync() {
    setState({ status: "loading" });

    try {
      const response = await fetch("/api/shopify/sync", { method: "POST" });
      const json = (await response.json()) as {
        ok?: boolean;
        synced?: { products: number; variants: number };
        error?: string;
      };

      if (!response.ok || !json.ok || !json.synced) {
        setState({
          status: "error",
          message: json.error ?? `Sync failed with HTTP ${response.status}`,
        });
        return;
      }

      setState({
        status: "done",
        products: json.synced.products,
        variants: json.synced.variants,
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <div className="stack">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={sync}
        disabled={state.status === "loading"}
      >
        {state.status === "loading"
          ? "Syncing from Shopify…"
          : "Sync Shopify catalog"}
      </button>
      {state.status === "done" ? (
        <span className="status-line">
          <span className="dot dot-green" />
          Synced {state.products} products · {state.variants} variants from the
          live Admin API
        </span>
      ) : null}
      {state.status === "error" ? (
        <div className="error-box">{state.message}</div>
      ) : null}
    </div>
  );
}
