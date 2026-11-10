import { Suspense } from "react";
import CheckoutReturn from "@/components/CheckoutReturn";

export const metadata = {
  title: "Checkout · OmniBuy AI",
};

export default function CheckoutReturnPage() {
  return (
    <Suspense
      fallback={
        <div className="shell page">
          <div className="card">Loading checkout…</div>
        </div>
      }
    >
      <CheckoutReturn />
    </Suspense>
  );
}
