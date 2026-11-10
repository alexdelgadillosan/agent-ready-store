import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentCart · Commerce for AI buyers",
  description:
    "AgentCart connects Shopify inventory to real AI buyers and PayPal checkout.",
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
              <span className="brand-mark" aria-hidden="true"><span /></span>
              <span>Agent<span className="brand-accent">Cart</span></span>
            </Link>
            <nav className="nav">
              <Link href="/chat">Shop with AI</Link>
              <Link href="/dashboard">Merchant view</Link>
              <ThemeToggle />
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
               AgentCart · Shopify Admin API + MCP + PayPal Orders v2
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
