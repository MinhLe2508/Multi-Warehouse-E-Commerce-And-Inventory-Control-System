import type { Product } from "@/shared/types/product";

export const LOW_STOCK_THRESHOLD = 10;

/** 125000 -> "125.000 ₫" (tự định dạng để server và client luôn cho kết quả giống nhau) */
export function formatVND(amount: number): string {
  const rounded = Math.round(amount);
  return `${rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} ₫`;
}

/** Tổng tồn kho của sản phẩm trên tất cả các kho */
export function getTotalStock(product: Product): number {
  return product.stockByWarehouse.reduce((sum, s) => sum + s.quantity, 0);
}

/** Hết hàng ở TẤT CẢ các kho */
export function isOutOfStock(product: Product): boolean {
  return getTotalStock(product) <= 0;
}

/** Bỏ dấu tiếng Việt + chữ thường, dùng cho tìm kiếm ("gao" tìm được "Gạo") */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .trim();
}
