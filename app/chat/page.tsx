import Chat from "@/components/Chat";

export const metadata = {
  title: "Plan a verified purchase · OmniBuy AI",
};

export default function ChatPage() {
  return (
    <div className="shell page">
      <div className="page-head">
          <span className="section-kicker">OMNIBUY AI / VERIFIED PURCHASE</span>
          <h1>Describe the purchase. We’ll prove the decision.</h1>
        <p>
          Give OmniBuy your need, budget and constraints. It searches the live
          catalog, verifies the plan, explains the trade-offs and asks for your
          approval before PayPal checkout. Every tool call is visible on the right.
        </p>
      </div>
      <Chat />
    </div>
  );
}
