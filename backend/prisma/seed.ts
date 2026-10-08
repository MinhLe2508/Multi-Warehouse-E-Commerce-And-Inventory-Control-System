// Mục đích: Tạo dữ liễu mẫu dùng số lượng

import 'dotenv/config';

import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
});

// Dùng bcrypt với số lượng "salt round" = 10 — Cân bằng giữa độ an toàn và tốc độ hash
const BCRYPT_SALT_ROUNDS = 10;

// Mật khẩu mặc định dùng chung cho toàn bộ User mẫu
const SEED_DEFAULT_PASSWORD = 'FiveTL524';

// Danh sách 3 kho hàng
const WAREHOUSES_SEED_DATA = [
  {
    code: 'WH-HN01',
    name: 'Kho Trung Tâm Hà Nội',
    region: 'Miền Bắc',
    address: 'Khu Công Nghiệp Bắc Thăng Long, Hà Nội',
    capacity: 50000,
  },
  {
    code: 'WH-DN01',
    name: 'Kho Trung Tâm Đà Nẵng',
    region: 'Miền Trung',
    address: 'Khu Công Nghiệp Hòa Khánh, Đà Nẵng',
    capacity: 30000,
  },
  {
    code: 'WH-HCM01',
    name: 'Kho Trung Tâm Hồ Chí Minh',
    region: 'Miền Nam',
    address: 'Khu Công Nghiệp Tân Bình, Thành Phố Hồ Chí Minh',
    capacity: 80000,
  },
];

// Danh sách danh mục sản phẩm
const CATEGORIES_SEED_DATA = [
  { name: 'Điện thoại & Máy tính bảng', slug: 'dien-thoai-may-tinh-bang' },
  { name: 'Laptop & Máy tính', slug: 'laptop-may-tinh' },
  { name: 'Âm thanh', slug: 'am-thanh' },
  { name: 'Thiết bị đeo thông minh', slug: 'thiet-bi-deo-thong-minh' },
  { name: 'Phụ kiện công nghệ', slug: 'phu-kien-cong-nghe' },
  { name: 'Gia dụng thông minh', slug: 'gia-dung-thong-minh' },
  { name: 'Màn hình & Máy chiếu', slug: 'man-hinh-may-chieu' },
  { name: 'Thiết bị lưu trữ', slug: 'thiet-bi-luu-tru' },
];

// -----------------------------------------------------------------------------
// 30 Đoạn tài liệu chính sách cho AI Chatbot RAG. Đây chỉ là nội dung văn bản thô
// Cột "Embedding" (vector 1024 chieu) sẽ được điền sau, bởi 1 script/service riêng gói Google Gemini Embedding API
// (gemini-embedding-001), không điền ở đây vì seed.ts không nên phụ thuộc vào gói API bên ngoài
// -----------------------------------------------------------------------------
const KB_DOCUMENTS_SEED_DATA: Array<{
  title: string;
  docType: string;
  content: string;
}> = [
  {
    title: 'Chính sách đổi trả hàng',
    docType: 'policy',
    content:
      'Khách hàng được đổi trả sản phẩm trong vòng 7 ngày kể từ ngày nhận hàng nếu sản phẩm còn mới, chưa sử dụng, còn đầy đủ bao bì và tem nhãn. Sản phẩm lỗi do nhà sản xuất được đổi mới hoặc hoàn tiền trong vòng 30 ngày.',
  },
  {
    title: 'Chính sách bảo hành',
    docType: 'policy',
    content:
      'Thời gian bảo hành mặc định là 12 tháng kể từ ngày mua, áp dụng cho lỗi phần cứng không do người dùng gây ra. Liên hệ trung tâm bảo hành kèm hóa đơn mua hàng để được hỗ trợ.',
  },
  {
    title: 'Phương thức thanh toán hỗ trợ',
    docType: 'policy',
    content:
      'Hệ thống hỗ trợ 3 phương thức thanh toán: Thanh toán thẻ, thanh toán ví điện tử, và thanh toán khi nhận hàng (COD). Không thu phí phụ thêm cho bất kỳ phương thức nào.',
  },
  {
    title: 'Thời gian giao hàng dự kiến',
    docType: 'policy',
    content:
      'Đơn hàng được giao từ kho gần nhất với địa chỉ nhận hàng. Thời gian giao hàng dự kiến từ 1 đến 3 ngày làm việc đối với nội thành, 3 đến 5 ngày đối với các tỉnh thành khác.',
  },
  {
    title: 'Chính sách hủy đơn hàng',
    docType: 'policy',
    content:
      'Khách hàng có thể hủy đơn hàng miễn phí khi đơn còn ở trạng thái "Chờ thanh toán". Sau khi đơn hàng đã được xác nhận thanh toán thành công, việc hủy đơn cần liên hệ bộ phận chăm sóc khách hàng.',
  },
  {
    title: 'Hướng dẫn tra cứu trạng thái đơn hàng',
    docType: 'faq',
    content:
      'Khách hàng có thể tra cứu trạng thái đơn hàng trong mục "Đơn hàng của tôi" sau khi đăng nhập, hoặc hỏi trực tiếp Chatbot bằng cách cung cấp mã đơn hàng.',
  },
  {
    title: 'Hướng dẫn tạo tài khoản',
    docType: 'faq',
    content:
      'Để tạo tài khoản, khách hàng cần cung cấp Email hợp lệ và đặt mật khẩu có ít nhất 8 ký tự. Hệ thống sẽ gửi Email xác nhận sau khi đăng ký thành công.',
  },
  {
    title: 'Chính sách bảo mật thông tin khách hàng',
    docType: 'policy',
    content:
      'Hệ thống chỉ sử dụng thông tin cá nhân của khách hàng (tên, địa chỉ, số điện thoại) để phục vụ việc giao hàng và liên hệ hỗ trợ, không chia sẻ cho bên thứ ba vì mục đích thương mại.',
  },
  {
    title: 'Cách kiểm tra tình trạng còn hàng',
    docType: 'faq',
    content:
      'Trang chi tiết sản phẩm hiển thị trực tiếp tình trạng còn hàng, được tổng hợp từ tất cả các kho. Nếu sản phẩm tạm thời hết hàng, nút “Mua ngay” sẽ được ẩn và hiển thị thông báo “Hết hàng”.',
  },
  {
    title: 'Quy trình xử lý khi thanh toán bị lỗi',
    docType: 'faq',
    content:
      'Nếu thanh toán bị lỗi, đơn hàng sẽ tự động chuyển sang trạng thái “Đã hủy” và phần tồn kho đã giữ chỗ sẽ được giải phóng ngay lập tức để khách hàng khác có thể mua. Khách hàng có thể thử thanh toán lại hoặc liên hệ bộ phận chăm sóc khách hàng để được hỗ trợ.',
  },
  {
    title: 'Chính sách đối với đơn hàng giao nhầm',
    docType: 'policy',
    content:
      'Trong trường hợp giao nhầm sản phẩm do lỗi từ phía cửa hàng, khách hàng được đổi lại đúng sản phẩm miễn phí và không phải trả thêm phí vận chuyển.',
  },
  {
    title: 'Hướng dẫn liên hệ chăm sóc khách hàng',
    docType: 'faq',
    content:
      'Khách hàng có thể liên hệ bộ phận chăm sóc khách hàng thông qua Chatbot trên Website hoặc Hotline được hiển thị ở cuối trang, trong giờ hành chính từ 8:00 đến 21:00 hằng ngày.',
  },
  {
    title: 'Chính sách giá và khuyến mãi',
    docType: 'policy',
    content:
      'Giá sản phẩm hiển thị trên Website đã bao gồm thuế VAT. Các chương trình khuyến mãi (Giảm giá theo %) được áp dụng trực tiếp trên giá bán và không được cộng dồn với các mã giảm giá khác, trừ khi có thông báo riêng.',
  },
  {
    title: 'Điều kiện áp dụng giao hàng miễn phí',
    docType: 'policy',
    content:
      'Đơn hàng có tổng giá trị từ 500.000 VND trở lên được miễn phí vận chuyển nội thành. Đối với đơn hàng dưới mức này, phí vận chuyển được tính dựa trên khoảng cách đến kho gần nhất.',
  },
  {
    title: 'Hướng dẫn đánh giá sản phẩm',
    docType: 'faq',
    content:
      'Sau khi đơn hàng chuyển sang trạng thái “Đã giao”, khách hàng có thể vào Lịch sử đơn hàng để đánh giá và nhận xét về sản phẩm đã mua.',
  },
  {
    title: 'Chính sách đối với tài khoản bị khóa',
    docType: 'policy',
    content:
      'Tài khoản có thể bị tạm khóa nếu phát hiện dấu hiệu gian lận trong thanh toán hoặc vi phạm điều khoản sử dụng. Khách hàng có thể liên hệ bộ phận chăm sóc khách hàng để được xem xét mở khóa lại.',
  },
  {
    title: 'Hướng dẫn thêm sản phẩm vào giỏ hàng',
    docType: 'faq',
    content:
      'Khách hàng chọn số lượng mong muốn trên trang chi tiết sản phẩm và nhấn “Thêm vào giỏ hàng”. Hệ thống sẽ kiểm tra tồn kho trước khi cho phép thêm sản phẩm vào giỏ hàng.',
  },
  {
    title: 'Quy định về hóa đơn điện tử',
    docType: 'policy',
    content:
      'Hệ thống tự động xuất hóa đơn điện tử cho mọi đơn hàng đã thanh toán thành công và gửi đến email đã đăng ký của khách hàng trong vòng 24 giờ.',
  },
  {
    title: 'Chính sách dành cho khách hàng thân thiết',
    docType: 'policy',
    content:
      'Khách hàng mua hàng thường xuyên có thể được tích điểm và nhận các ưu đãi đặc biệt trong các dịp lễ. Thông tin chi tiết sẽ được thông báo qua Email hoặc trong mục “Khách hàng thân thiết” sau khi đăng nhập.',
  },
  {
    title: 'Hướng dẫn xử lý khi đơn hàng bị giao chậm',
    docType: 'faq',
    content:
      'Nếu đơn hàng bị giao chậm so với thời gian dự kiến, khách hàng có thể tra cứu trạng thái vận chuyển trong mục “Đơn hàng của tôi” hoặc liên hệ Chatbot để được cập nhật tình trạng giao hàng.',
  },
  {
    title: 'Chính sách về số lượng mua tối đa',
    docType: 'policy',
    content:
      'Để đảm bảo công bằng cho mọi khách hàng trong các dịp khuyến mãi lớn, hệ thống có thể giới hạn số lượng mua tối đa của một sản phẩm trong mỗi đơn hàng.',
  },
  {
    title: 'Hướng dẫn cập nhật địa chỉ giao hàng',
    docType: 'faq',
    content:
      'Khách hàng có thể cập nhật hoặc thêm địa chỉ giao hàng mới ngay tại bước thanh toán trước khi hoàn tất đơn hàng.',
  },
  {
    title: 'Chính sách bảo mật thanh toán',
    docType: 'policy',
    content:
      'Mọi giao dịch thanh toán đều được xử lý thông qua cơ chế mô phỏng an toàn, không lưu trữ thông tin thẻ hoặc tài khoản ngân hàng thực tế của khách hàng.',
  },
  {
    title: 'Hướng dẫn xử lý khi sản phẩm hết hàng giữa chừng',
    docType: 'faq',
    content:
      'Trong trường hợp hiếm gặp sản phẩm hết hàng ngay trong lúc đang thanh toán (do khách hàng khác mua trước), hệ thống sẽ báo lỗi và yêu cầu khách hàng điều chỉnh lại số lượng hoặc chọn sản phẩm khác.',
  },
  {
    title: 'Điều kiện đổi trả đối với hàng khuyến mãi',
    docType: 'policy',
    content:
      'Sản phẩm mua trong chương trình khuyến mãi vẫn được áp dụng chính sách đổi trả thông thường, trừ khi trên trang sản phẩm có ghi chú riêng “Không áp dụng đổi trả”.',
  },
  {
    title: 'Hướng dẫn đăng xuất tất cả thiết bị',
    docType: 'faq',
    content:
      'Khách hàng có thể đăng xuất khỏi tất cả thiết bị đang đăng nhập bằng cách đổi mật khẩu trong phần “Cài đặt tài khoản”.',
  },
  {
    title: 'Chính sách riêng cho khách hàng doanh nghiệp',
    docType: 'policy',
    content:
      'Khách hàng doanh nghiệp có nhu cầu mua số lượng lớn vui lòng liên hệ trực tiếp bộ phận kinh doanh để được tư vấn về giá và chính sách giao hàng riêng. Trường hợp này không áp dụng quy trình mua hàng cá nhân thông thường.',
  },
  {
    title: 'Hướng dẫn báo lỗi sản phẩm lỗi',
    docType: 'faq',
    content:
      'Khi phát hiện sản phẩm bị lỗi ngay sau khi nhận hàng, khách hàng nên chụp ảnh/video tình trạng sản phẩm và liên hệ bộ phận chăm sóc khách hàng trong vòng 48 giờ để được hỗ trợ nhanh nhất.',
  },
  {
    title: 'Chính sách xử lý đơn hàng không người nhận',
    docType: 'policy',
    content:
      'Nếu đơn vị vận chuyển không liên hệ được với người nhận sau 3 lần giao hàng, đơn hàng sẽ được hoàn trả về kho và trạng thái đơn hàng sẽ chuyển thành “Đã hủy”.',
  },
  {
    title: 'Giới thiệu tính năng trợ lý AI Chatbot',
    docType: 'faq',
    content:
      'Trợ lý AI có thể hỗ trợ tra cứu trạng thái đơn hàng, kiểm tra tình trạng tồn kho sản phẩm và trả lời các câu hỏi thường gặp. Khi gặp câu hỏi ngoài phạm vi hỗ trợ, Chatbot sẽ đề xuất chuyển tiếp đến nhân viên chăm sóc khách hàng.',
  },
];

// Hàm phụ trợ: Sinh số nguyên ngẫu nhiên trong khoảng [min, max]
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Chọn ngẫu nhiên 1 phần tử từ 1 danh sach — Dùng cho việc gán danh mục ngẫu nhiên cho từng sản phẩm
function pickRandom<T>(items: T[]): T {
  return items[randomInt(0, items.length - 1)];
}

// Sinh danh sách tên sản phẩm mẫu có cấu trúc "Nhóm từ khóa + Số hiệu"
const PRODUCT_NAME_PREFIXES = [
  'Điện thoại thông minh',
  'Máy tính bảng',
  'Laptop văn phòng',
  'Laptop đồ họa',
  'Tai nghe không dây',
  'Loa Bluetooth',
  'Đồng hồ thông minh',
  'Vòng đeo tay theo dõi sức khỏe',
  'Sạc dự phòng',
  'Cáp sạc nhanh',
  'Bàn phím cơ',
  'Chuột không dây',
  'Màn hình máy tính',
  'Máy chiếu mini',
  'Ổ cứng di động',
  'Thẻ nhớ lưu trữ',
  'Camera an ninh',
  'Đèn LED thông minh',
  'Ổ cắm điện thông minh',
  'Robot hút bụi',
];

async function main(): Promise<void> {
  console.log('===== Bắt đầu Seed dữ liệu mẫu =====');

  // Bước 0: Xóa sạch dữ liệu cũ
  console.log('[0/8] Đang xóa dữ liệu cũ...');
  await prisma.chatMessage.deleteMany();
  await prisma.chatSession.deleteMany();
  await prisma.kbDocument.deleteMany();
  await prisma.stockAlert.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.stockReservation.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.inventoryAuditLog.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  // Bước 1: Hash mật khẩu mặc định một lần duy nhất
  console.log('[1/8] Đang Hash mật khẩu mẫu...');
  const defaultPasswordHash = await bcrypt.hash(
    SEED_DEFAULT_PASSWORD,
    BCRYPT_SALT_ROUNDS,
  );

  // Bước 2: Tạo 2 Admin + 2 WAREHOUSE_STAFF + 100 CUSTOMER = 104 user.
  console.log(
    '[2/8] Đang tạo 104 Users (2 Admin, 2 Nhân viên kho, 100 Khách hàng)...',
  );

  await prisma.user.createMany({
    data: [
      {
        email: 'admin1@multiwarehouse.vn',
        passwordHash: defaultPasswordHash,
        fullName: 'Lê Nhật Minh (Admin)',
        role: UserRole.ADMIN,
      },
      {
        email: 'admin2@multiwarehouse.vn',
        passwordHash: defaultPasswordHash,
        fullName: 'Trần Văn Khang (Admin)',
        role: UserRole.ADMIN,
      },
      {
        email: 'staff.hanoi@multiwarehouse.vn',
        passwordHash: defaultPasswordHash,
        fullName: 'Nguyễn Nhật Huy (Staff HN)',
        role: UserRole.WAREHOUSE_STAFF,
      },
      {
        email: 'staff.hcm@multiwarehouse.vn',
        passwordHash: defaultPasswordHash,
        fullName: 'Trương Minh Triết (Staff HCM)',
        role: UserRole.WAREHOUSE_STAFF,
      },
    ],
  });

  // 100 Khách hàng (CUSTOMER) — Sinh Email/Tên theo số thứ tự để đảm bảo UNIQUE trên cột "email", tránh trùng lặp ngẫu nhiên
  const customersData = Array.from({ length: 100 }, (_, index) => {
    const seq = index + 1;
    return {
      email: `customer${seq}@example.com`,
      passwordHash: defaultPasswordHash,
      fullName: `Khách hàng số ${seq}`,
      phone: `09${randomInt(10000000, 99999999)}`,
      role: UserRole.CUSTOMER,
    };
  });
  await prisma.user.createMany({ data: customersData });
  console.log(`      → Đã tạo xong tổng ${await prisma.user.count()} Users.`);

  // Bước 3: Tạo danh mục sản phẩm.
  console.log('[3/8] Đang tạo danh mục sản phẩm...');
  await prisma.category.createMany({ data: CATEGORIES_SEED_DATA });
  const categories = await prisma.category.findMany();

  // Bước 4: Tạo 3 kho hàng.
  console.log('[4/8] Đang tạo 3 kho hàng...');
  await prisma.warehouse.createMany({ data: WAREHOUSES_SEED_DATA });
  const warehouses = await prisma.warehouse.findMany();

  // Bước 5: Tạo 200 sản phẩm, gán ngẫu nhiên vào 1 danh mục và 1 mục giá hợp lý (50.000 VND - 30.000.000 VND)
  console.log('[5/8] Đang tạo 200 sản phẩm...');
  const productsData = Array.from({ length: 200 }, (_, index) => {
    const seq = index + 1;
    const namePrefix = pickRandom(PRODUCT_NAME_PREFIXES);
    const category = pickRandom(categories);
    const basePrice = randomInt(50, 30000) * 1000;
    const hasDiscount = randomInt(1, 100) <= 20;
    const discountPercent = hasDiscount ? randomInt(5, 30) : 0;

    return {
      sku: `SKU-${String(seq).padStart(5, '0')}`,
      name: `${namePrefix} Model ${seq}`,
      slug: `${namePrefix.toLowerCase().replace(/\s+/g, '-')}-model-${seq}`,
      description: `${namePrefix} chính hãng, bảo hành 12 tháng, hỗ trợ đổi trả trong 7 ngày.`,
      basePrice,
      discountPercent,
      categoryId: category.id,
    };
  });
  await prisma.product.createMany({ data: productsData });
  const products = await prisma.product.findMany();

  // Bước 6: Tạo 600 dòng tồn kho
  console.log('[6/8] Đang tạo 600 dòng tồn kho...');
  const inventoryData: Array<{
    productId: string;
    warehouseId: string;
    stock: number;
    reservedStock: number;
    threshold: number | null;
  }> = [];

  for (const product of products) {
    for (const warehouse of warehouses) {
      const isLowStockSample = randomInt(1, 100) <= 5;
      const stock = isLowStockSample ? randomInt(0, 5) : randomInt(10, 500);
      inventoryData.push({
        productId: product.id,
        warehouseId: warehouse.id,
        stock,
        reservedStock: 0,
        threshold: null,
      });
    }
  }

  console.log('      → Đang Insert bảng Raw SQL...');
  for (const row of inventoryData) {
    await prisma.$executeRaw`
      INSERT INTO "inventory" ("product_id", "warehouse_id", "stock", "reserved_stock", "threshold", "updated_at")
      VALUES (${row.productId}::uuid, ${row.warehouseId}::uuid, ${row.stock}, ${row.reservedStock}, ${row.threshold}, NOW())
    `;
  }
  console.log(`      → Đã tạo xong ${inventoryData.length} dòng tồn kho.`);

  // Bước 7: Tạo 30 đoạn tài liệu chính sách cho AI Chatbot RAG.
  // Cột "embedding" (vector 1024 chieu) chưa được điền ở đây
  // Sẽ được 1 script/service riêng (EmbeddingService) gọi Google Gemini Embedding API để điền sau
  // Giữ seed.ts đơn giản và không phụ thuộc gọi API bên ngoài khi chỉ cần seed dữ liệu cơ bản
  console.log(
    '[7/8] Đang tạo 30 đoạn tài liệu chính sách cho AI Chatbot RAG...',
  );
  await prisma.kbDocument.createMany({
    data: KB_DOCUMENTS_SEED_DATA.map((doc) => ({
      title: doc.title,
      docType: doc.docType,
      content: doc.content,
      chunkIndex: 0,
    })),
  });

  // Bước 8: Tổng kết
  console.log('[8/8] Tổng kết dữ liệu đã Seed:');
  console.log(`      - Users: ${await prisma.user.count()}`);
  console.log(`      - Categories: ${await prisma.category.count()}`);
  console.log(`      - Warehouses: ${await prisma.warehouse.count()}`);
  console.log(`      - Products: ${await prisma.product.count()}`);
  console.log(`      - Inventory: ${await prisma.inventory.count()}`);
  console.log(`      - KB Documents: ${await prisma.kbDocument.count()}`);
  console.log(
    `(Mật khẩu đăng nhập cho tất cả User mẫu: "${SEED_DEFAULT_PASSWORD}")`,
  );
}

main()
  .catch((error) => {
    console.error('Lỗi khi Seed mẫu liệu:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
