"use client";

import { useCallback, useEffect, useRef } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { useCartStore } from "@/store/useCartStore";

/** Refresh on opening cart, membership changes, returning to tab and manual retry. */
export function useCartSync() {
  const hydrated = useHydrated();
  const ids = useCartStore((state) => JSON.stringify(state.items.map((item) => item.productId).sort()));
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(() => {
    controller.current?.abort();
    controller.current = new AbortController();
    void useCartStore.getState().refreshCatalog(controller.current.signal);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.current?.abort();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hydrated, ids, refresh]);
  return refresh;
}
