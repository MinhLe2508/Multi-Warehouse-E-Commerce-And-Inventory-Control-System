"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * false khi render trên server và ở lần render đầu tiên của client,
 * true sau khi hydrate xong. Dùng để tránh lỗi "hydration mismatch"
 * với dữ liệu lấy từ localStorage (giỏ hàng, ngôn ngữ).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
