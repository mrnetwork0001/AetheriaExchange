import type { Metadata } from "next";
import { ReceiptsView } from "./ReceiptsView";

export const metadata: Metadata = {
  title: "Settlement Receipts · Aetheria Exchange",
  description:
    "The venue's public audit trail - every market resolution and refund as an onchain transaction you can verify on OKLink.",
};

export default function ReceiptsPage() {
  return <ReceiptsView />;
}
