"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Product } from "@/shared/types/product";
import { CatalogError, fetchProduct, MOCK_CATALOG } from "@/shared/lib/catalogApi";
import {
  changeQuantity, reconcileCart, restoreCart, toCartItem,
  type CartItem, type CatalogResult,
} from "@/shared/lib/cartModel";
export type { CartItem } from "@/shared/lib/cartModel";

interface CartState {
  items: CartItem[];
  syncStatus: "idle" | "loading" | "ready" | "error";
  storageError: boolean;
  addItem: (product: Product, quantity?: number) => number;
  setQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
  refreshCatalog: (signal: AbortSignal) => Promise<void>;
}

let requestVersion = 0;
let storageFailed = false;
// Keep the cart usable in memory when storage is unavailable or full.
const storage = createJSONStorage(() => ({
  getItem: (key: string) => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) JSON.parse(raw);
      return raw;
    } catch { storageFailed = true; return null; }
  },
  setItem: (key: string, value: string) => {
    try { localStorage.setItem(key, value); }
    catch {
      storageFailed = true;
      queueMicrotask(() => {
        if (!useCartStore.getState().storageError) useCartStore.setState({ storageError: true });
      });
    }
  },
  removeItem: (key: string) => { try { localStorage.removeItem(key); } catch { storageFailed = true; } },
}));

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [], syncStatus: "idle", storageError: false,
      addItem: (product, quantity = 1) => {
        if (!Number.isSafeInteger(quantity) || quantity < 1) return 0;
        const item = toCartItem(product, quantity);
        if (!item.unitPrice || !Number.isSafeInteger(item.maxStock) || item.maxStock <= 0) return 0;
        const existing = get().items.find((row) => row.productId === product.id);
        const current = existing?.quantity ?? 0;
        const next = Math.min(current + quantity, item.maxStock);
        const added = next - current;
        if (added <= 0) return 0;
        set((state) => ({ items: existing
          ? state.items.map((row) => row.productId === product.id ? { ...item, quantity: next } : row)
          : [...state.items, { ...item, quantity: next }],
        }));
        return added;
      },
      setQuantity: (productId, quantity) => set((state) => ({
        items: state.items.map((item) => item.productId === productId ? changeQuantity(item, quantity) : item),
      })),
      removeItem: (productId) => set((state) => ({ items: state.items.filter((item) => item.productId !== productId) })),
      clearCart: () => { requestVersion++; set({ items: [], syncStatus: "idle" }); },
      refreshCatalog: async (signal) => {
        const version = ++requestVersion;
        const ids = get().items.map((item) => item.productId);
        if (!ids.length) { set({ syncStatus: "idle" }); return; }
        set({ syncStatus: "loading" });
        const results: CatalogResult[] = [];
        // Bound concurrency so a restored large cart cannot flood the API.
        for (let start = 0; start < ids.length; start += 6) {
          const batch = await Promise.all(ids.slice(start, start + 6).map(async (id): Promise<CatalogResult> => {
            try {
              const timeout = AbortSignal.timeout(10000);
              const product = await fetchProduct(id, AbortSignal.any([signal, timeout]));
              return { id, kind: "available", product };
            } catch (error) {
              return { id, kind: error instanceof CatalogError && error.status === 404 ? "unavailable" : "error" };
            }
          }));
          if (signal.aborted || version !== requestVersion) return;
          results.push(...batch);
        }
        set((state) => ({
          items: reconcileCart(state.items, results),
          syncStatus: results.some((result) => result.kind === "error") ? "error" : "ready",
        }));
      },
    }),
    {
      name: MOCK_CATALOG ? "multimart-cart" : "multimart-api-cart",
      storage,
      partialize: (state) => ({ items: state.items }),
      merge: (persisted, current) => ({ ...current, items: restoreCart(persisted), storageError: storageFailed }),
    },
  ),
);

export const selectTotalItems = (state: CartState): number =>
  state.items.reduce((sum, item) => sum + item.quantity, 0);
// Kept for the existing mock checkout; real pricing remains owned by P3.
export const selectSubtotal = (state: CartState): number =>
  state.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
