"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthError, authRequest } from "@/shared/lib/authApi";
import { authenticatedRequest } from "@/store/useAuthStore";

export const SHOP_NOTIFICATIONS_CHANGED = "multimart:notifications";

export function useShopResource<T>(
  path: string | null, { identity = "", interval = 0, publicRead = false, event, keepOnNetworkError = false }: {
    identity?: string; interval?: number; publicRead?: boolean; event?: string;
    keepOnNetworkError?: boolean;
  } = {},
) {
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const key = JSON.stringify([path, identity]);
  const [state, setState] = useState<{ key: string; data?: T; error?: unknown }>();
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    const request = publicRead ? authRequest : authenticatedRequest;
    request<T>(path).then(
      (data) => { if (!cancelled) setState({ key, data }); },
      (error: unknown) => {
        if (cancelled) return;
        const keep = keepOnNetworkError && error instanceof AuthError && (error.status === 0 || error.status >= 500);
        setState((previous) => ({ key, error, data: keep && previous?.key === key ? previous.data : undefined }));
      },
    );
    return () => { cancelled = true; };
  }, [keepOnNetworkError, key, path, publicRead, revision]);

  useEffect(() => {
    if (!path) return;
    const timer = interval > 0 ? window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, interval) : undefined;
    if (event) window.addEventListener(event, refresh);
    return () => {
      if (timer !== undefined) window.clearInterval(timer);
      if (event) window.removeEventListener(event, refresh);
    };
  }, [event, interval, path, refresh]);
  const current = state?.key === key && path ? state : undefined;
  return { data: current?.data, error: current?.error, loading: Boolean(path) && !current, refresh };
}
