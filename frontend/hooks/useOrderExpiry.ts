"use client";

import { useEffect } from "react";
import { useCheckoutStore } from "@/store/useCheckoutStore";

/** Đồng bộ trạng thái demo khi trang mở; backend thật phải chạy cron độc lập. */
export function useOrderExpiry() {
  const expireOrder = useCheckoutStore((state) => state.expireOrder);
  useEffect(() => {
    expireOrder();
    const interval = setInterval(expireOrder, 1000);
    return () => clearInterval(interval);
  }, [expireOrder]);
}
