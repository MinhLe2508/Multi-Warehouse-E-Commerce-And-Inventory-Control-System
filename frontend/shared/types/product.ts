/** Kho hàng */
export interface Warehouse {
  id: string;
  name: string;
  nameEn?: string;
}

/** Tồn kho của một sản phẩm tại một kho */
export interface WarehouseStock {
  warehouseId: string;
  warehouseName: string;
  quantity: number;
}

export interface Product {
  id: string;
  name: string;
  /** Giá VND, SỐ NGUYÊN (không dùng số thực) */
  price: number;
  /** URL ảnh (hiện là placeholder, sau này là URL từ API) */
  image: string;
  /** id của Category (ví dụ "grocery") */
  category: string;
  description: string;
  stockByWarehouse: WarehouseStock[];
}

export interface Category {
  id: string;
  name: { vi: string; en: string };
  /** Emoji dùng làm icon tạm */
  icon: string;
}

export type ProductSort = "default" | "price-asc" | "price-desc";

/** Tham số truy vấn — khớp với GET /products?category=&search=&sort=&page=&pageSize= */
export interface ProductQuery {
  category?: string;
  search?: string;
  sort?: ProductSort;
  /** Bắt đầu từ 1 */
  page?: number;
  pageSize?: number;
}

export interface ProductPage {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
