import Chat from "@/components/Chat";

export const metadata = {
  title: "Buyer agent · Agent-Ready Store",
};

export default function ChatPage() {
  return (
    <div className="shell page">
      <div className="page-head">
        <h1>Buyer agent</h1>
        <p>
          A real LLM with tool calling against the connected store. Ask for a
          product, give a shipping address, and approve the PayPal sandbox
          payment. Every tool call is visible on the right.
        </p>
      </div>
      <Chat />
    </div>
  );
}
