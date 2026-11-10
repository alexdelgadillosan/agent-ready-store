import Chat from "@/components/Chat";

export const metadata = {
  title: "Shop with AI · AgentCart",
};

export default function ChatPage() {
  return (
    <div className="shell page">
      <div className="page-head">
          <span className="section-kicker">AGENTCART / SHOPPING</span>
          <h1>Tell us what you need.</h1>
        <p>
          A real AI buyer with live Shopify tools. Ask for a
          product, give a shipping address, and approve the PayPal sandbox
          payment. Every tool call is visible on the right.
        </p>
      </div>
      <Chat />
    </div>
  );
}
