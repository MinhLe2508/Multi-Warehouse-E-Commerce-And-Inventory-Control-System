export const DEMO_WAREHOUSES = [
  {
    code: 'WH-HN01',
    name: 'Kho Trung tâm Hà Nội',
    region: 'Miền Bắc',
    address: 'Khu công nghiệp Bắc Thăng Long, Hà Nội',
    capacity: 800,
    defaultLowStockThreshold: 8,
  },
  {
    code: 'WH-DN01',
    name: 'Kho Trung tâm Đà Nẵng',
    region: 'Miền Trung',
    address: 'Khu công nghiệp Hòa Khánh, Đà Nẵng',
    capacity: 450,
    defaultLowStockThreshold: 6,
  },
  {
    code: 'WH-HCM01',
    name: 'Kho Trung tâm Hồ Chí Minh',
    region: 'Miền Nam',
    address: 'Khu công nghiệp Tân Bình, TP. Hồ Chí Minh',
    capacity: 1000,
    defaultLowStockThreshold: 10,
  },
] as const;

export const DEMO_CATEGORIES = [
  { name: 'Điện thoại & Máy tính bảng', slug: 'dien-thoai-may-tinh-bang' },
  { name: 'Laptop & Máy tính', slug: 'laptop-may-tinh' },
  { name: 'Âm thanh', slug: 'am-thanh' },
  { name: 'Thiết bị đeo thông minh', slug: 'thiet-bi-deo-thong-minh' },
  { name: 'Phụ kiện công nghệ', slug: 'phu-kien-cong-nghe' },
  { name: 'Gia dụng thông minh', slug: 'gia-dung-thong-minh' },
  { name: 'Màn hình & Máy chiếu', slug: 'man-hinh-may-chieu' },
  { name: 'Thiết bị lưu trữ', slug: 'thiet-bi-luu-tru' },
] as const;

type DemoCategory = (typeof DEMO_CATEGORIES)[number]['slug'];
export type DemoWarehouseCode = (typeof DEMO_WAREHOUSES)[number]['code'];

interface DemoProduct {
  sku: string;
  legacySku: string;
  slug: string;
  name: string;
  description: string;
  category: DemoCategory;
  basePrice: number;
  costPrice: number;
  stock: Record<DemoWarehouseCode, number>;
}

// Giá demo tính theo VND. Ảnh lấy từ frontend/public/products/<slug>.webp.
export const DEMO_PRODUCTS: readonly DemoProduct[] = [
  {
    sku: 'MOB-IP18DUO-256',
    legacySku: 'DEMO-PHONE-18D',
    slug: 'iphone18duo',
    name: 'iPhone 18 Duo 256 GB',
    description:
      'Điện thoại minh họa với màn hình OLED 6,3 inch, bộ nhớ 256 GB và cụm camera kép.',
    category: 'dien-thoai-may-tinh-bang',
    basePrice: 22_990_000,
    costPrice: 19_600_000,
    stock: { 'WH-HN01': 28, 'WH-DN01': 12, 'WH-HCM01': 44 },
  },
  {
    sku: 'TAB-NOVAAIR-11',
    legacySku: 'DEMO-TAB-AIR11',
    slug: 'nova-tab-air-11',
    name: 'Máy tính bảng Nova Tab Air 11',
    description:
      'Máy tính bảng 11 inch, bộ nhớ 128 GB, phù hợp ghi chú và xem nội dung.',
    category: 'dien-thoai-may-tinh-bang',
    basePrice: 7_490_000,
    costPrice: 6_050_000,
    stock: { 'WH-HN01': 24, 'WH-DN01': 11, 'WH-HCM01': 36 },
  },
  {
    sku: 'LAP-NOVABOOK-A14',
    legacySku: 'DEMO-NBOOK-A14',
    slug: 'novabook-air-14',
    name: 'Laptop NovaBook Air 14',
    description:
      'Laptop 14 inch mỏng nhẹ với RAM 16 GB và SSD 512 GB cho học tập, làm việc.',
    category: 'laptop-may-tinh',
    basePrice: 17_490_000,
    costPrice: 14_900_000,
    stock: { 'WH-HN01': 24, 'WH-DN01': 13, 'WH-HCM01': 36 },
  },
  {
    sku: 'LAP-NOVABOOK-P16',
    legacySku: 'DEMO-NBOOK-P16',
    slug: 'novabook-pro-16',
    name: 'Laptop NovaBook Pro 16',
    description:
      'Laptop 16 inch với RAM 32 GB và SSD 1 TB cho thiết kế, dựng video và đa nhiệm.',
    category: 'laptop-may-tinh',
    basePrice: 28_990_000,
    costPrice: 24_700_000,
    stock: { 'WH-HN01': 14, 'WH-DN01': 4, 'WH-HCM01': 22 },
  },
  {
    sku: 'AUD-AIRBEAM-BUDS2',
    legacySku: 'DEMO-BUDS-2',
    slug: 'airbeam-buds-2',
    name: 'Tai nghe AirBeam Buds 2',
    description:
      'Tai nghe Bluetooth in-ear kèm hộp sạc USB-C, dùng để nghe nhạc và gọi thoại.',
    category: 'am-thanh',
    basePrice: 1_290_000,
    costPrice: 890_000,
    stock: { 'WH-HN01': 68, 'WH-DN01': 36, 'WH-HCM01': 72 },
  },
  {
    sku: 'AUD-WAVE-MINI',
    legacySku: 'DEMO-WAVE-MINI',
    slug: 'wave-mini',
    name: 'Loa Bluetooth Wave Mini',
    description: 'Loa di động vỏ lưới, có dây đeo và cổng sạc USB-C.',
    category: 'am-thanh',
    basePrice: 1_590_000,
    costPrice: 1_120_000,
    stock: { 'WH-HN01': 40, 'WH-DN01': 20, 'WH-HCM01': 56 },
  },
  {
    sku: 'WRB-PULSE-WATCH-S',
    legacySku: 'DEMO-PULSE-WATCH',
    slug: 'pulse-watch-s',
    name: 'Đồng hồ Pulse Watch S',
    description:
      'Đồng hồ thông minh mặt vuông với dây silicone, theo dõi vận động và nhận thông báo.',
    category: 'thiet-bi-deo-thong-minh',
    basePrice: 2_490_000,
    costPrice: 1_790_000,
    stock: { 'WH-HN01': 6, 'WH-DN01': 9, 'WH-HCM01': 32 },
  },
  {
    sku: 'WRB-PULSE-BAND-FIT',
    legacySku: 'DEMO-PULSE-BAND',
    slug: 'pulse-band-fit',
    name: 'Vòng đeo Pulse Band Fit',
    description:
      'Vòng đeo nhẹ theo dõi bước chân, thời gian ngủ và hoạt động hằng ngày.',
    category: 'thiet-bi-deo-thong-minh',
    basePrice: 690_000,
    costPrice: 440_000,
    stock: { 'WH-HN01': 32, 'WH-DN01': 17, 'WH-HCM01': 48 },
  },
  {
    sku: 'ACC-GAN-65W',
    legacySku: 'DEMO-GAN-65W',
    slug: 'sac-gan-65w',
    name: 'Củ sạc GaN 65 W',
    description:
      'Củ sạc gọn với hai cổng USB-C, công suất tối đa 65 W khi dùng một cổng.',
    category: 'phu-kien-cong-nghe',
    basePrice: 790_000,
    costPrice: 540_000,
    stock: { 'WH-HN01': 60, 'WH-DN01': 27, 'WH-HCM01': 86 },
  },
  {
    sku: 'ACC-SWIFT-M3',
    legacySku: 'DEMO-SWIFT-M3',
    slug: 'chuot-swift-m3',
    name: 'Chuột không dây Swift M3',
    description:
      'Chuột công thái học nhỏ gọn, có nút bên và kết nối không dây 2,4 GHz.',
    category: 'phu-kien-cong-nghe',
    basePrice: 490_000,
    costPrice: 320_000,
    stock: { 'WH-HN01': 54, 'WH-DN01': 24, 'WH-HCM01': 68 },
  },
  {
    sku: 'SMH-HOMEVIEW-C2',
    legacySku: 'DEMO-HOME-C2',
    slug: 'homeview-c2',
    name: 'Camera HomeView C2',
    description:
      'Camera Wi-Fi trong nhà với video 1080p, chân đế để bàn và chế độ quan sát ban đêm.',
    category: 'gia-dung-thong-minh',
    basePrice: 690_000,
    costPrice: 480_000,
    stock: { 'WH-HN01': 30, 'WH-DN01': 5, 'WH-HCM01': 48 },
  },
  {
    sku: 'SMH-SWEEP-R5',
    legacySku: 'DEMO-SWEEP-R5',
    slug: 'sweep-r5',
    name: 'Robot hút bụi Sweep R5',
    description:
      'Robot hút bụi có cảm biến LiDAR lập bản đồ và hẹn lịch dọn dẹp theo phòng.',
    category: 'gia-dung-thong-minh',
    basePrice: 6_490_000,
    costPrice: 5_150_000,
    stock: { 'WH-HN01': 22, 'WH-DN01': 11, 'WH-HCM01': 30 },
  },
  {
    sku: 'DSP-NOVAVIEW-27QHD',
    legacySku: 'DEMO-VIEW-27',
    slug: 'novaview-27-qhd',
    name: 'Màn hình NovaView 27 QHD',
    description:
      'Màn hình IPS 27 inch, độ phân giải 2560 × 1440, có cổng HDMI và DisplayPort.',
    category: 'man-hinh-may-chieu',
    basePrice: 5_490_000,
    costPrice: 4_350_000,
    stock: { 'WH-HN01': 24, 'WH-DN01': 14, 'WH-HCM01': 33 },
  },
  {
    sku: 'DSP-POCKETBEAM-MINI',
    legacySku: 'DEMO-BEAM-MINI',
    slug: 'pocketbeam-mini',
    name: 'Máy chiếu PocketBeam Mini',
    description: 'Máy chiếu nhỏ gọn cho phòng tối, hỗ trợ đầu vào HDMI.',
    category: 'man-hinh-may-chieu',
    basePrice: 3_490_000,
    costPrice: 2_700_000,
    stock: { 'WH-HN01': 0, 'WH-DN01': 0, 'WH-HCM01': 0 },
  },
  {
    sku: 'STG-SWIFT-SSD1TB',
    legacySku: 'DEMO-SSD-1TB',
    slug: 'ssd-swift-1tb',
    name: 'SSD di động Swift 1 TB',
    description: 'Ổ SSD gắn ngoài vỏ nhôm, dung lượng 1 TB, kết nối USB-C.',
    category: 'thiet-bi-luu-tru',
    basePrice: 1_790_000,
    costPrice: 1_310_000,
    stock: { 'WH-HN01': 45, 'WH-DN01': 25, 'WH-HCM01': 55 },
  },
  {
    sku: 'STG-SDPRO-128',
    legacySku: 'DEMO-SD-128',
    slug: 'the-nho-pro-128gb',
    name: 'Thẻ nhớ SD Pro 128 GB',
    description:
      'Thẻ SDXC 128 GB tốc độ UHS-I cho máy ảnh và thiết bị ghi hình.',
    category: 'thiet-bi-luu-tru',
    basePrice: 349_000,
    costPrice: 240_000,
    stock: { 'WH-HN01': 36, 'WH-DN01': 18, 'WH-HCM01': 52 },
  },
];
