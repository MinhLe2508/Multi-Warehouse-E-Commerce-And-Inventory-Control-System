"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product } from "@/shared/types/product";
import { getProductById } from "@/shared/lib/mockData";
import { getTotalStock } from "@/shared/lib/utils";
import { isRecord } from "@/shared/lib/storage";

export interface CartItem {
  productId: string;
  name: string;
  /** Giá VND, số nguyên */
  price: number;
  image: string;
  quantity: number;
  maxStock: number;
}

interface CartState {
  items: CartItem[];
  addItem: (product: Product, quantity?: number) => number;
  setQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
}

function cartItem(product: Product, quantity: number): CartItem {
  return {
    productId: product.id, name: product.name, price: product.price,
    image: product.image, quantity, maxStock: getTotalStock(product),
  };
}

/** Hỗ trợ key cũ; bỏ dữ liệu hỏng, gộp id trùng, lấy giá từ catalog mock. */
function restoreItems(persisted: unknown): CartItem[] {
  if (!isRecord(persisted) || !Array.isArray(persisted.items)) return [];
  const result = new Map<string, CartItem>();
  for (const value of persisted.items) {
    if (!isRecord(value) || typeof value.productId !== "string" ||
      typeof value.quantity !== "number" || !Number.isSafeInteger(value.quantity) ||
      value.quantity < 1) continue;
    const product = getProductById(value.productId);
    if (!product) continue;
    const quantity = (result.get(product.id)?.quantity ?? 0) + value.quantity;
    if (!Number.isSafeInteger(quantity)) continue;
    // Không âm thầm kẹp giỏ stale: CartView cảnh báo, đặt hàng trả 409.
    result.set(product.id, cartItem(product, quantity));
  }
  return [...result.values()];
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (product, quantity = 1) => {
        if (!Number.isFinite(quantity) || quantity < 1) return 0;
        const maxStock = getTotalStock(product);
        if (maxStock <= 0) return 0;
        const existing = get().items.find((item) => item.productId === product.id);
        const current = existing?.quantity ?? 0;
        const next = Math.min(current + Math.floor(quantity), maxStock);
        const added = next - current;
        if (added <= 0) return 0;
        const updated = cartItem(product, next);
        set((state) => ({
          items: existing
            ? state.items.map((item) => item.productId === product.id ? updated : item)
            : [...state.items, updated],
        }));
        return added;
      },
      setQuantity: (productId, quantity) => {
        if (!Number.isFinite(quantity)) return;
        const product = getProductById(productId);
        const maxStock = product ? getTotalStock(product) : 0;
        if (!product || maxStock <= 0) return;
        const next = Math.min(Math.max(1, Math.floor(quantity)), maxStock);
        set((state) => ({
          items: state.items.map((item) => item.productId === productId ? cartItem(product, next) : item),
        }));
      },
      removeItem: (productId) => set((state) => ({
        items: state.items.filter((item) => item.productId !== productId),
      })),
      clearCart: () => set({ items: [] }),
    }),
    {
      name: "multimart-cart",
      partialize: (state) => ({ items: state.items }),
      merge: (persisted, current) => ({ ...current, items: restoreItems(persisted) }),
    },
  ),
);

export const selectTotalItems = (state: CartState): number =>
  state.items.reduce((sum, item) => sum + item.quantity, 0);
export const selectSubtotal = (state: CartState): number =>
  state.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
