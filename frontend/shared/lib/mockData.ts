import type {
  Category,
  Product,
  ProductPage,
  ProductQuery,
  Warehouse,
  WarehouseStock,
} from "@/shared/types/product";
import type { Language } from "@/shared/lib/dictionary";
import { normalizeText } from "@/shared/lib/utils";

/* ------------------------------------------------------------------ */
/* Kho                                                                 */
/* ------------------------------------------------------------------ */

export const WAREHOUSES: Warehouse[] = [
  { id: "wh-hn", name: "Kho Hà Nội", nameEn: "Hanoi Warehouse" },
  { id: "wh-dn", name: "Kho Đà Nẵng", nameEn: "Da Nang Warehouse" },
  { id: "wh-hcm", name: "Kho TP.HCM", nameEn: "Ho Chi Minh City Warehouse" },
];

/** Tạo mảng tồn kho theo thứ tự [Hà Nội, Đà Nẵng, TP.HCM] */
function stock(hn: number, dn: number, hcm: number): WarehouseStock[] {
  return [hn, dn, hcm].map((quantity, i) => ({
    warehouseId: WAREHOUSES[i].id,
    warehouseName: WAREHOUSES[i].name,
    quantity,
  }));
}

/* ------------------------------------------------------------------ */
/* Danh mục                                                            */
/* ------------------------------------------------------------------ */

export const CATEGORIES: Category[] = [
  { id: "grocery", name: { vi: "Tạp hóa", en: "Grocery" }, icon: "🛒" },
  { id: "beverages", name: { vi: "Đồ uống", en: "Beverages" }, icon: "🥤" },
  { id: "household", name: { vi: "Gia dụng", en: "Home & Kitchen" }, icon: "🏠" },
  { id: "personal-care", name: { vi: "Chăm sóc cá nhân", en: "Personal care" }, icon: "🧴" },
  { id: "stationery", name: { vi: "Văn phòng phẩm", en: "Stationery" }, icon: "✏️" },
];

/* ------------------------------------------------------------------ */
/* Ảnh placeholder (SVG data URI: không cần mạng, không cần cấu hình   */
/* next.config). Khi có API thật, chỉ cần thay bằng URL ảnh thật.      */
/* ------------------------------------------------------------------ */

const CATEGORY_COLORS: Record<string, [string, string]> = {
  grocery: ["#eef2ff", "#c7d2fe"],
  beverages: ["#f5f3ff", "#ddd6fe"],
  household: ["#eff6ff", "#bfdbfe"],
  "personal-care": ["#fdf4ff", "#f5d0fe"],
  stationery: ["#f0f9ff", "#bae6fd"],
};

function placeholder(emoji: string, category: string): string {
  const [from, to] = CATEGORY_COLORS[category] ?? ["#eef2ff", "#c7d2fe"];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
    `</linearGradient></defs>` +
    `<rect width="600" height="600" fill="url(#g)"/>` +
    `<text x="300" y="310" font-size="220" text-anchor="middle" dominant-baseline="central">${emoji}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function product(
  id: string,
  name: string,
  price: number,
  category: string,
  emoji: string,
  description: string,
  stockByWarehouse: WarehouseStock[],
): Product {
  return { id, name, price, image: placeholder(emoji, category), category, description, stockByWarehouse };
}

/* ------------------------------------------------------------------ */
/* 24 sản phẩm                                                         */
/* Giá là số nguyên VND. stock(HN, ĐN, HCM).                           */
/* - Hết hàng ở 1 kho: p-002, p-005, p-007, p-008, p-011, p-017, p-019 */
/* - Hết hàng ở TẤT CẢ kho: p-004, p-014, p-024                        */
/* - Tồn kho rất thấp (test giới hạn số lượng): p-015                  */
/* ------------------------------------------------------------------ */

export const PRODUCTS: Product[] = [
  // Tạp hóa
  product("p-001", "Gạo thơm ST25 túi 5kg", 185000, "grocery", "🌾",
    "Gạo ST25 hạt dài, cơm dẻo thơm tự nhiên, đóng túi 5kg tiện lợi cho gia đình 4 người.",
    stock(120, 80, 150)),
  product("p-002", "Dầu ăn đậu nành chai 1 lít", 59000, "grocery", "🫒",
    "Dầu ăn tinh luyện từ đậu nành, ít cholesterol, phù hợp chiên xào hằng ngày.",
    stock(200, 0, 180)),
  product("p-003", "Nước mắm cá cơm chai 500ml", 38000, "grocery", "🍶",
    "Nước mắm truyền thống độ đạm 30°N, vị đậm đà, dùng chấm và nêm nếm.",
    stock(90, 60, 110)),
  product("p-004", "Mì gói thùng 30 gói", 118000, "grocery", "🍜",
    "Mì ăn liền vị tôm chua cay, thùng 30 gói, tiện dự trữ cho cả tháng.",
    stock(0, 0, 0)),
  product("p-005", "Đường tinh luyện túi 1kg", 27500, "grocery", "🧂",
    "Đường trắng tinh luyện, hạt mịn, tan nhanh, dùng cho nấu ăn và pha chế.",
    stock(150, 130, 0)),

  // Đồ uống
  product("p-006", "Cà phê hòa tan 3in1 hộp 21 gói", 52000, "beverages", "☕",
    "Cà phê hòa tan vị đậm đà, pha nhanh trong 30 giây, hộp 21 gói x 16g.",
    stock(75, 40, 95)),
  product("p-007", "Trà xanh đóng chai thùng 24 chai", 215000, "beverages", "🍵",
    "Trà xanh không đường, chai 455ml, thanh mát, thùng 24 chai.",
    stock(30, 12, 0)),
  product("p-008", "Nước suối thùng 24 chai 500ml", 98000, "beverages", "💧",
    "Nước uống tinh khiết đóng chai 500ml, thùng 24 chai.",
    stock(0, 55, 80)),
  product("p-009", "Sữa tươi tiệt trùng thùng 12 hộp 1 lít", 335000, "beverages", "🥛",
    "Sữa tươi nguyên chất 100%, tiệt trùng, không đường, thùng 12 hộp 1 lít.",
    stock(45, 30, 60)),

  // Gia dụng
  product("p-010", "Nồi cơm điện 1.8 lít", 890000, "household", "🍚",
    "Nồi cơm điện nắp gài lòng niêu chống dính, công suất 700W, nấu ngon cho 4-6 người.",
    stock(15, 8, 20)),
  product("p-011", "Ấm siêu tốc inox 1.7 lít", 320000, "household", "🫖",
    "Ấm đun nước siêu tốc inox 304, tự ngắt khi sôi, công suất 1800W.",
    stock(25, 0, 30)),
  product("p-012", "Chảo chống dính 28cm", 245000, "household", "🍳",
    "Chảo chống dính đáy từ dùng được mọi loại bếp, tay cầm cách nhiệt.",
    stock(40, 22, 35)),
  product("p-013", "Bộ 6 hộp nhựa đựng thực phẩm", 129000, "household", "🥡",
    "Bộ hộp nhựa PP an toàn, có nắp kín, dùng được trong lò vi sóng và ngăn mát.",
    stock(60, 45, 70)),
  product("p-014", "Quạt đứng 3 tốc độ", 750000, "household", "🌀",
    "Quạt đứng thân cao điều chỉnh được, 3 mức gió, motor êm và bền.",
    stock(0, 0, 0)),
  product("p-015", "Bình giữ nhiệt inox 750ml", 199000, "household", "🥤",
    "Bình giữ nhiệt inox 304 hai lớp, giữ nóng 12 giờ, giữ lạnh 24 giờ. Số lượng có hạn.",
    stock(3, 2, 1)),

  // Chăm sóc cá nhân
  product("p-016", "Dầu gội thảo dược chai 650ml", 142000, "personal-care", "🧴",
    "Dầu gội chiết xuất bồ kết và gừng, giúp tóc chắc khỏe, giảm gãy rụng.",
    stock(100, 85, 120)),
  product("p-017", "Sữa tắm dưỡng ẩm chai 800ml", 135000, "personal-care", "🛁",
    "Sữa tắm hương hoa nhẹ nhàng, dưỡng ẩm suốt ngày, phù hợp mọi loại da.",
    stock(70, 0, 90)),
  product("p-018", "Kem đánh răng than hoạt tính tuýp 150g", 45000, "personal-care", "🦷",
    "Kem đánh răng than hoạt tính giúp làm trắng răng và giữ hơi thở thơm mát.",
    stock(180, 150, 200)),
  product("p-019", "Bàn chải đánh răng lông mềm (vỉ 3 cái)", 69000, "personal-care", "🪥",
    "Bàn chải lông mềm đầu nhỏ, làm sạch kẽ răng nhẹ nhàng, vỉ 3 cái.",
    stock(90, 70, 0)),
  product("p-020", "Nước rửa tay diệt khuẩn chai 500ml", 58000, "personal-care", "🧼",
    "Nước rửa tay diệt 99.9% vi khuẩn, hương chanh, dưỡng da tay mềm mịn.",
    stock(110, 95, 130)),

  // Văn phòng phẩm
  product("p-021", "Bút bi xanh hộp 20 cây", 78000, "stationery", "🖊️",
    "Bút bi mực xanh nét 0.5mm, viết êm không lem, hộp 20 cây.",
    stock(200, 160, 220)),
  product("p-022", "Vở kẻ ngang 200 trang (lốc 5 quyển)", 95000, "stationery", "📓",
    "Vở giấy trắng định lượng 80gsm, kẻ ngang rõ nét, lốc 5 quyển.",
    stock(85, 60, 75)),
  product("p-023", "Giấy in A4 70gsm ram 500 tờ", 89000, "stationery", "📄",
    "Giấy in A4 trắng mịn, định lượng 70gsm, in hai mặt không lem, ram 500 tờ.",
    stock(40, 25, 55)),
  product("p-024", "Bảng trắng treo tường 60x90cm", 275000, "stationery", "📋",
    "Bảng trắng khung nhôm, bề mặt chống bám mực, kèm khay đựng bút.",
    stock(0, 0, 0)),
];

/** id các sản phẩm hiển thị ở mục "Sản phẩm nổi bật" trên trang chủ */
export const FEATURED_PRODUCT_IDS: string[] = [
  "p-001", "p-004", "p-006", "p-010", "p-012", "p-016", "p-018", "p-021",
];

/* ------------------------------------------------------------------ */
/* "Mock API": các hàm dưới đây thay thế cho gọi API thật.             */
/* Khi nối API: chuyển consumers sang fetch/hook có loading và error. */
/* Không đổi hàm đồng bộ thành async mà giữ nguyên nơi gọi khi render. */
/* ------------------------------------------------------------------ */

export const DEFAULT_PAGE_SIZE = 8;

export function getWarehouseName(id: string, language: Language, fallback = id): string {
  const warehouse = WAREHOUSES.find((w) => w.id === id);
  if (!warehouse) return fallback;
  return language === "en" ? warehouse.nameEn ?? warehouse.name : warehouse.name;
}

export function getRelatedProducts(product: Product, limit = 4): Product[] {
  return PRODUCTS.filter((p) => p.category === product.category && p.id !== product.id).slice(0, limit);
}

export function getCategoryCount(id: string): number {
  return PRODUCTS.filter((p) => p.category === id).length;
}

export function getCategories(): Category[] {
  return CATEGORIES;
}

export function getProductById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function getFeaturedProducts(): Product[] {
  return FEATURED_PRODUCT_IDS.map((id) => getProductById(id)).filter(
    (p): p is Product => p !== undefined,
  );
}

/** Tương ứng GET /products?category=&search=&sort=&page=&pageSize= */
export function queryProducts(query: ProductQuery = {}): ProductPage {
  const {
    category,
    search = "",
    sort = "default",
    page = 1,
    pageSize: requestedPageSize = DEFAULT_PAGE_SIZE,
  } = query;

  const pageSize = Number.isSafeInteger(requestedPageSize) && requestedPageSize > 0 ? requestedPageSize : DEFAULT_PAGE_SIZE;
  const requestedPage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  let items = PRODUCTS;

  if (category && category !== "all") {
    items = items.filter((p) => p.category === category);
  }

  const keyword = normalizeText(search);
  if (keyword) {
    items = items.filter((p) => normalizeText(p.name).includes(keyword));
  }

  if (sort === "price-asc") {
    items = [...items].sort((a, b) => a.price - b.price);
  } else if (sort === "price-desc") {
    items = [...items].sort((a, b) => b.price - a.price);
  }

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const start = (currentPage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    total,
    page: currentPage,
    pageSize,
    totalPages,
  };
}
