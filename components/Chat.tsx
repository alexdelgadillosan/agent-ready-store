"use client";

import { useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AgentStep = {
  tool: string;
  input: unknown;
  output: unknown;
  ok: boolean;
};

type AgentCart = {
  cart_id: string;
  approval_url: string;
  total_cents: number;
  currency: string;
};

type AgentResponse = {
  reply?: string;
  steps?: AgentStep[];
  cart?: AgentCart | null;
  error?: string;
};

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hi — I’m AgentCart’s buyer agent. I can search the live catalog, check stock, build a cart and start PayPal checkout. What are you looking for?",
};

const SAMPLES = [
  "What products do you have?",
  "Show me something under $30",
  "I need a gift for a coffee lover",
];

function renderWithLinks(text: string) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return parts.map((part, index) =>
    /^https?:\/\//.test(part) ? (
      <a key={index} href={part} target="_blank" rel="noreferrer">
        {part}
      </a>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [cart, setCart] = useState<AgentCart | null>(null);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) {
      return;
    }

    const next: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];

    setMessages(next);
    setInput("");
    setError(null);
    setSteps([]);
    setCart(null);
    setLoading(true);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      const json = (await response.json()) as AgentResponse;

      if (!response.ok) {
        throw new Error(json.error ?? `Agent failed with HTTP ${response.status}`);
      }

      setMessages([
        ...next,
        {
          role: "assistant",
          content:
            json.reply?.trim() ||
            "I finished the tool calls but have no text reply. Check the tool trace.",
        },
      ]);
      setSteps(json.steps ?? []);
      setCart(json.cart ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setMessages(next);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-layout">
      <section className="card chat-panel">
        <div className="chat-head">
          <div>
            <strong>Buyer agent</strong>
            <div>
              <span>LLM tool calling · real Shopify catalog · PayPal sandbox</span>
            </div>
          </div>
          <span className={`tag ${loading ? "tag-blue" : "tag-green"}`}>
            {loading ? "Thinking…" : "Live"}
          </span>
        </div>

        <div className="messages">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`msg ${
                message.role === "user" ? "msg-user" : "msg-assistant"
              }`}
            >
              {message.role === "assistant"
                ? renderWithLinks(message.content)
                : message.content}
            </div>
          ))}

          {cart ? (
            <div className="card" style={{ alignSelf: "stretch", padding: 16 }}>
              <div className="row-between">
                <strong>PayPal order ready</strong>
                <span className="tag tag-blue">
                  {cart.currency} {(cart.total_cents / 100).toFixed(2)}
                </span>
              </div>
              <p className="small" style={{ margin: "8px 0 12px" }}>
                Inventory is reserved for 30 minutes and a Shopify Draft Order
                exists. Approve the payment in the PayPal sandbox to capture it
                and create the real Shopify order.
              </p>
              <a
                className="btn btn-paypal btn-sm"
                href={cart.approval_url}
                target="_blank"
                rel="noreferrer"
              >
                Pay with PayPal →
              </a>
            </div>
          ) : null}

          {error ? <div className="error-box">{error}</div> : null}
        </div>

        <div className="chat-samples">
          {SAMPLES.map((sample) => (
            <button
              key={sample}
              type="button"
              className="sample"
              onClick={() => void send(sample)}
              disabled={loading}
            >
              {sample}
            </button>
          ))}
        </div>

        <div className="chat-input">
          <textarea
            value={input}
            placeholder="Ask for a product, quantity and delivery address…"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            disabled={loading}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void send(input)}
            disabled={loading || input.trim().length === 0}
          >
            {loading ? "…" : "Send"}
          </button>
        </div>
      </section>

      <aside className="side-card">
        <div className="card">
          <h3>Tool trace</h3>
          <p className="small" style={{ marginBottom: 12 }}>
            Every call below was executed against the real backend and logged to
            Postgres.
          </p>
          {steps.length === 0 ? (
            <p className="dim small">No tool calls yet.</p>
          ) : (
            <div className="trace-list">
              {steps.map((step, index) => (
                <details className="trace-item" key={`${step.tool}-${index}`}>
                  <summary>
                    <span className={step.ok ? "trace-ok" : "trace-fail"}>
                      {step.ok ? "✓" : "✕"}
                    </span>{" "}
                    {step.tool}
                  </summary>
                  <pre>{JSON.stringify({ input: step.input, output: step.output }, null, 2)}</pre>
                </details>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Hard limits</h3>
          <p className="small">
             Max 10 units per variant, max $500 per cart, 30-minute reservation
            TTL, and one capture per PayPal order. The agent cannot bypass these;
            they are enforced server-side.
          </p>
        </div>

        <div className="card">
          <h3>Checkout flow</h3>
          <p className="small">
            create_cart → PayPal approval → return page captures the payment →
            Shopify Draft Order completes → order appears on the dashboard. The
            return page is the only place that finalizes a payment.
          </p>
        </div>
      </aside>
    </div>
  );
}
