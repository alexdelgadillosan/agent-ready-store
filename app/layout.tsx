import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent-Ready Store",
  description:
    "Real MCP commerce for Shopify: a real LLM buyer, real inventory reservations, and real PayPal sandbox checkout.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="shell site-header-inner">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden="true" />
              <span>Agent-Ready Store</span>
            </Link>
            <nav className="nav">
              <Link href="/chat">Buyer agent</Link>
              <Link href="/dashboard">Merchant dashboard</Link>
              <Link href="/api/health">Health</Link>
              <a
                href="https://modelcontextprotocol.io"
                target="_blank"
                rel="noreferrer"
              >
                MCP ↗
              </a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="footer">
          <div className="shell footer-inner">
            <span>
              Agent-Ready Store · Shopify Admin API + MCP + PayPal Orders v2
            </span>
            <span>
              No mocks. No simulated catalog. Sandbox payments only.
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
