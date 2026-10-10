import type { Metadata } from "next";
import ConfirmationView from "@/components/storefront/ConfirmationView";

export const metadata: Metadata = {
  title: "Đặt hàng thành công",
};

export default function ConfirmationPage() {
  return <ConfirmationView />;
}
