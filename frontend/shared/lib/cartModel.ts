import type { Product } from "../types/product";

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  unitPrice?: string;
  image: string;
  quantity: number;
  maxStock: number;
  catalogStatus?: "unchecked" | "available" | "unavailable" | "error";
  priceChanged?: boolean;
}

const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const integer = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** Only accept NUMERIC(14,2)-compatible, non-negative decimal amounts. */
export function decimalPrice(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{1,12}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
}

export function toCartItem(product: Product, quantity: number): CartItem {
  return {
    productId: product.id, name: product.name, price: product.price,
    unitPrice: decimalPrice(product.basePrice ?? String(product.price)) ?? undefined,
    image: product.image, quantity,
    maxStock: product.stockByWarehouse.reduce((sum, stock) => sum + stock.quantity, 0),
    catalogStatus: "available",
  };
}

/** Persisted values are only a display snapshot; always revalidate against catalog. */
export function restoreCart(value: unknown): CartItem[] {
  if (!record(value) || !Array.isArray(value.items)) return [];
  const items = new Map<string, CartItem>();
  for (const row of value.items) {
    if (!record(row) || typeof row.productId !== "string" || !row.productId.trim() ||
      typeof row.name !== "string" || typeof row.image !== "string" ||
      !integer(row.quantity) || row.quantity < 1 || !integer(row.maxStock) ||
      typeof row.price !== "number" || !Number.isFinite(row.price) || row.price < 0) continue;
    const unitPrice = decimalPrice(row.unitPrice ?? String(row.price));
    if (!unitPrice) continue;
    const quantity = (items.get(row.productId)?.quantity ?? 0) + row.quantity;
    if (!Number.isSafeInteger(quantity)) continue;
    items.set(row.productId, {
      productId: row.productId, name: row.name, image: row.image,
      price: Number(unitPrice), unitPrice, quantity, maxStock: row.maxStock,
      catalogStatus: "unchecked",
    });
  }
  return [...items.values()];
}

export type CatalogResult =
  | { id: string; kind: "available"; product: Product }
  | { id: string; kind: "unavailable" | "error" };

/** Apply to CURRENT items: do not resurrect removed rows or overwrite quantity edits. */
export function reconcileCart(items: CartItem[], results: CatalogResult[]): CartItem[] {
  const byId = new Map(results.map((result) => [result.id, result]));
  return items.map((item) => {
    const result = byId.get(item.productId);
    if (!result) return item;
    if (result.kind !== "available") return {
      ...item, catalogStatus: result.kind,
      maxStock: result.kind === "unavailable" ? 0 : item.maxStock,
    };
    const updated = toCartItem(result.product, item.quantity);
    return { ...updated, priceChanged: (item.unitPrice ?? decimalPrice(String(item.price))) !== updated.unitPrice };
  });
}

export function cartHasProblem(items: CartItem[]): boolean {
  return items.some((item) => item.catalogStatus !== "available" || item.maxStock <= 0 || item.quantity > item.maxStock);
}

/** Preview only. Exact integer cents avoid floating-point errors in cart display. */
export function cartAmount(items: CartItem[]): string {
  const cents = items.reduce((sum, item) => {
    const price = decimalPrice(item.unitPrice ?? String(item.price));
    if (!price || !integer(item.quantity)) return sum;
    return sum + BigInt(price.replace(".", "")) * BigInt(item.quantity);
  }, BigInt(0));
  return `${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
}

export function changeQuantity(item: CartItem, quantity: number): CartItem {
  if (!Number.isSafeInteger(quantity) || quantity < 1) return item;
  // Let users reduce stale/error rows, but never increase past the known stock.
  if (quantity >= item.quantity && (item.catalogStatus !== "available" || quantity > item.maxStock)) return item;
  return { ...item, quantity };
}
