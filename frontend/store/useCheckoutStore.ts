"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Order, PaymentMethod, ShippingInfo } from "@/shared/types/order";

import { isOrder, isPaymentMethod, isRecord, isShippingInfo } from "@/shared/lib/storage";

import { expireMockOrder, settleMockPayment } from "@/shared/lib/mockOrders";

export const EMPTY_SHIPPING: ShippingInfo = {
  fullName: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  note: "",
};

interface CheckoutState {
  shipping: ShippingInfo;
  payment: PaymentMethod;
  /** Đơn hàng vừa đặt, dùng cho trang Confirmation */
  lastOrder: Order | null;
  settlePayment: (orderId: string, result: "SUCCESS" | "FAILED") => void;
  expireOrder: () => void;
  setShipping: (shipping: ShippingInfo) => void;
  setPayment: (payment: PaymentMethod) => void;
  setLastOrder: (order: Order | null) => void;
}

/** Lưu thông tin giao hàng + đơn vừa đặt vào localStorage (tải lại trang không mất) */
export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set, get) => ({
      shipping: EMPTY_SHIPPING,
      payment: "MOCK_CARD",
      lastOrder: null,
      settlePayment: (orderId, result) => set((state) => ({
        lastOrder: state.lastOrder?.id === orderId ? settleMockPayment(state.lastOrder, result) : state.lastOrder,
      })),
      expireOrder: () => {
        const current = get().lastOrder;
        if (!current) return;
        const next = expireMockOrder(current);
        if (next !== current) set({ lastOrder: next });
      },
      setShipping: (shipping) => set({ shipping }),
      setPayment: (payment) => set({ payment }),
      setLastOrder: (lastOrder) => set({ lastOrder }),
    }),
    {
      name: "multimart-checkout",
      partialize: (state) => ({ shipping: state.shipping, payment: state.payment, lastOrder: state.lastOrder }),
      merge: (persisted, current) => {
        if (!isRecord(persisted)) return current;
        return {
          ...current,
          shipping: isShippingInfo(persisted.shipping) ? persisted.shipping : EMPTY_SHIPPING,
          payment: isPaymentMethod(persisted.payment) ? persisted.payment : "MOCK_CARD",
          lastOrder: isOrder(persisted.lastOrder) ? expireMockOrder(persisted.lastOrder) : null,
        };
      },
    },
  ),
);
