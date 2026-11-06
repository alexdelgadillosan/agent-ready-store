import Dashboard from "@/components/Dashboard";

export const metadata = {
  title: "Merchant dashboard · Agent-Ready Store",
};

export default function DashboardPage() {
  return (
    <div className="shell page">
      <div className="page-head">
        <h1>Merchant dashboard</h1>
        <p>
          Orders, available inventory and agent activity read directly from
          Postgres after real Shopify and PayPal operations. No seeded rows.
        </p>
      </div>
      <Dashboard />
    </div>
  );
}
