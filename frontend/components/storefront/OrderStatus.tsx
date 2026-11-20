"use client";

import type { OrderState } from "@/shared/lib/liveOrders";
import { useShopCopy } from "./ShopUi";

export const orderLabels = {
  PENDING_PAYMENT: ["Chờ thanh toán", "Awaiting payment"],
  CONFIRMED: ["Đã xác nhận", "Confirmed"],
  SHIPPING: ["Đang giao", "Shipping"],
  DELIVERED: ["Đã giao", "Delivered"],
  CANCELLED: ["Đã hủy", "Cancelled"],
} as const;

export const orderDate = (value: string) => new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
}).format(new Date(value));

export function OrderStatus({ status }: { status: OrderState }) {
  const tx = useShopCopy();
  const [vi, en] = orderLabels[status];
  const tone = status === "PENDING_PAYMENT" ? "warning" : status === "CANCELLED" ? "neutral" : status === "SHIPPING" ? "blue" : "success";
  return <span className={"mm-pill " + tone}><span aria-hidden="true" />{tx(vi, en)}</span>;
}
