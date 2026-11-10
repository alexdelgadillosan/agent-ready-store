import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "OmniBuy AI · Verified Autonomous Commerce",
  description:
    "OmniBuy AI finds, verifies and purchases real products within the buyer's rules.",
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
              <span>Omni<span className="brand-accent">Buy</span> <small>AI</small></span>
            </Link>
            <nav className="nav">
              <Link href="/chat">Start a purchase</Link>
              <Link href="/dashboard">Merchant view</Link>
              <ThemeToggle />
              <a
                href="https://modelcontextprotocol.io"
                target="_blank"
                rel="noreferrer"
              >
                API / MCP ↗
              </a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="footer">
          <div className="shell footer-inner">
            <span>
              Made with <span aria-label="love">♥</span> by{" "}
              <a
                href="https://alexdelgadillo.dev"
                target="_blank"
                rel="noreferrer"
              >
                Alex Delgadillo
              </a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
