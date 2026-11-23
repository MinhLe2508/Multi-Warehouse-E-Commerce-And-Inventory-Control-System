"use client";

import { useEffect, useState } from "react";
import type { Line } from "@/shared/lib/liveOrders";
import type { CheckoutQuote } from "@/shared/types/checkout";
import { authenticatedRequest } from "@/store/useAuthStore";

export function useCheckoutQuote(items: Line[], promotionId: string, enabled: boolean) {
  const body = JSON.stringify({ items, ...(promotionId && { promotionId }) });
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; data?: CheckoutQuote; error?: unknown }>();
  const key = revision + ":" + body;
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void authenticatedRequest<CheckoutQuote>("/orders/quote", JSON.parse(body)).then(
      (data) => { if (active) setState({ key, data }); },
      (error: unknown) => { if (active) setState({ key, error }); },
    );
    return () => { active = false; };
  }, [body, enabled, key]);

  const current = enabled && state?.key === key ? state : undefined;
  return { ...current, loading: enabled && !current, refresh: () => setRevision((value) => value + 1) };
}
