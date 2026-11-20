import 'dotenv/config';

import { PrismaClient, UserRole, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { InventoryAlertService } from '../src/inventory/inventory-alert.service';
import {
  DEMO_CATEGORIES,
  DEMO_PRODUCTS,
  DEMO_WAREHOUSES,
  type DemoWarehouseCode,
} from './demo-catalog';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const DEMO_ACCOUNTS = [
  { username: 'admin', fullName: 'Admin Demo', role: UserRole.ADMIN },
  {
    username: 'staff',
    fullName: 'Nhân viên kho Demo',
    role: UserRole.WAREHOUSE_STAFF,
  },
  {
    username: 'customer',
    fullName: 'Khách hàng Demo',
    role: UserRole.CUSTOMER,
  },
] as const;

// Các đoạn chính sách dùng được với tìm kiếm từ khóa ngay sau khi seed.
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
      'Bản demo có hai phương thức thanh toán: thẻ mô phỏng và ví điện tử mô phỏng.',
  },
  {
    title: 'Thời gian giao hàng dự kiến',
    docType: 'policy',
    content:
      'Đơn hàng được ưu tiên phân bổ từ kho cùng khu vực giao hàng nếu có đủ tồn khả dụng. Thời gian giao hàng dự kiến từ 1 đến 3 ngày làm việc đối với nội thành, 3 đến 5 ngày làm việc đối với các tỉnh thành khác.',
  },
  {
    title: 'Chính sách hủy đơn hàng',
    docType: 'policy',
    content:
      'Để yêu cầu hủy đơn ở trạng thái "Chờ thanh toán", khách hàng có thể liên hệ bộ phận chăm sóc khách hàng. Khi đã hết thời gian giữ hàng, hệ thống tự động hủy đơn đang chờ thanh toán.',
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
      'Để đăng ký tài khoản, khách hàng cung cấp họ tên, số điện thoại và địa chỉ Gmail hợp lệ. Hệ thống sẽ gửi liên kết xác thực có hiệu lực trong 60 giây. Khách hàng mở liên kết để xác thực Gmail và thiết lập mật khẩu. Nếu liên kết hết hạn, khách hàng có thể yêu cầu gửi lại email xác thực tại trang đăng ký.',
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
      'Khi thanh toán mô phỏng bị từ chối, đơn vẫn ở trạng thái “Chờ thanh toán”. Khách hàng có thể thử lại trên cùng đơn trước thời điểm hết hạn ban đầu. Khi hết hạn, hệ thống hủy đơn và giải phóng phần hàng đã giữ chỗ.',
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
      'Bản demo miễn phí vận chuyển cho mọi đơn hàng ở cả nội thành và các tỉnh. Phí vận chuyển là 0 VND.',
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

async function seedCatalog(tx: Prisma.TransactionClient) {
  await tx.category.createMany({
    data: [...DEMO_CATEGORIES],
    skipDuplicates: true,
  });
  const categories = await tx.category.findMany({
    where: { slug: { in: DEMO_CATEGORIES.map(({ slug }) => slug) } },
    select: { slug: true, id: true },
  });
  const categoryIds = new Map(categories.map(({ slug, id }) => [slug, id]));

  await tx.product.createMany({
    data: DEMO_PRODUCTS.map(
      ({ sku, slug, name, description, category, basePrice, costPrice }) => ({
        sku,
        slug,
        name,
        description,
        basePrice,
        costPrice,
        categoryId: categoryIds.get(category),
        imageUrl: `/products/${slug}.webp`,
      }),
    ),
    skipDuplicates: true,
  });
  const products = await tx.product.findMany({
    where: { sku: { in: DEMO_PRODUCTS.map(({ sku }) => sku) } },
    select: { sku: true, id: true },
  });
  const productIds = new Map(products.map(({ sku, id }) => [sku, id]));

  await tx.warehouse.createMany({
    data: [...DEMO_WAREHOUSES],
    skipDuplicates: true,
  });
  // Nhất quán với luồng nhập kho, khóa kho trước khi kiểm tra sức chứa.
  const warehouses = await tx.$queryRaw<
    { id: string; code: DemoWarehouseCode; capacity: number | null }[]
  >`
    SELECT id, code, capacity
      FROM warehouses
     WHERE code = ANY(${DEMO_WAREHOUSES.map(({ code }) => code)}::text[])
     ORDER BY id
       FOR UPDATE
  `;
  const existingTotals = await tx.inventory.groupBy({
    by: ['warehouseId'],
    where: { warehouseId: { in: warehouses.map(({ id }) => id) } },
    _sum: { stock: true },
  });
  const warehouseStock = new Map(
    existingTotals.map(({ warehouseId, _sum }) => [
      warehouseId,
      _sum.stock ?? 0,
    ]),
  );
  const newInventoryIds: bigint[] = [];
  const auditRows: Prisma.InventoryAuditLogCreateManyInput[] = [];

  for (const product of DEMO_PRODUCTS) {
    const productId = productIds.get(product.sku);
    if (!productId) {
      throw new Error(`Không tạo được sản phẩm demo ${product.sku}.`);
    }

    for (const warehouse of warehouses) {
      const stock = product.stock[warehouse.code];
      const [inventory] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO inventory (product_id, warehouse_id, stock, last_restocked_at, updated_at)
        VALUES (
          ${productId}::uuid, ${warehouse.id}::uuid, ${stock},
          CASE WHEN ${stock}::integer > 0 THEN NOW() END, NOW()
        )
        ON CONFLICT (product_id, warehouse_id) DO NOTHING
        RETURNING id
      `;
      if (!inventory) continue;

      const total = (warehouseStock.get(warehouse.id) ?? 0) + stock;
      if (
        stock > 0 &&
        warehouse.capacity !== null &&
        total > warehouse.capacity
      ) {
        throw new Error(
          `Kho ${warehouse.code} không đủ sức chứa cho dữ liệu mẫu. Hãy chạy seed trên CSDL demo riêng.`,
        );
      }
      warehouseStock.set(warehouse.id, total);
      newInventoryIds.push(inventory.id);
      if (stock > 0) {
        auditRows.push({
          inventoryId: inventory.id,
          reason: 'RESTOCK',
          stockBefore: 0,
          stockAfter: stock,
          reservedBefore: 0,
          reservedAfter: 0,
          quantityDelta: stock,
          referenceType: 'demo_seed',
          note: 'Nhập tồn đầu kỳ cho dữ liệu demo',
        });
      }
    }
  }

  if (auditRows.length > 0)
    await tx.inventoryAuditLog.createMany({ data: auditRows });
  await new InventoryAlertService().evaluate(tx, newInventoryIds);
}

async function seedKnowledge(tx: Prisma.TransactionClient) {
  const legacyDemoContent = new Map([
    [
      'Phương thức thanh toán hỗ trợ',
      'Hệ thống hỗ trợ 3 phương thức thanh toán: Thanh toán thẻ, thanh toán ví điện tử, và thanh toán khi nhận hàng (COD). Không thu phí phụ thêm cho bất kỳ phương thức nào.',
    ],
    [
      'Thời gian giao hàng dự kiến',
      'Đơn hàng được giao từ kho gần nhất với địa chỉ nhận hàng. Thời gian giao hàng dự kiến từ 1 đến 3 ngày làm việc đối với nội thành, 3 đến 5 ngày đối với các tỉnh thành khác.',
    ],
    [
      'Chính sách hủy đơn hàng',
      'Khách hàng có thể hủy đơn hàng miễn phí khi đơn còn ở trạng thái "Chờ thanh toán". Sau khi đơn hàng đã được xác nhận thanh toán thành công, việc hủy đơn cần liên hệ bộ phận chăm sóc khách hàng.',
    ],
    [
      'Điều kiện áp dụng giao hàng miễn phí',
      'Đơn hàng có tổng giá trị từ 500.000 VND trở lên được miễn phí vận chuyển nội thành. Đối với đơn hàng dưới mức này, phí vận chuyển được tính dựa trên khoảng cách đến kho gần nhất.',
    ],
    [
      'Quy trình xử lý khi thanh toán bị lỗi',
      'Nếu thanh toán bị lỗi, đơn hàng sẽ tự động chuyển sang trạng thái “Đã hủy” và phần tồn kho đã giữ chỗ sẽ được giải phóng ngay lập tức để khách hàng khác có thể mua. Khách hàng có thể thử thanh toán lại hoặc liên hệ bộ phận chăm sóc khách hàng để được hỗ trợ.',
    ],
  ]);
  for (const doc of KB_DOCUMENTS_SEED_DATA) {
    const existing = await tx.kbDocument.findFirst({
      where: {
        title: doc.title,
        docType: doc.docType,
        chunkIndex: 0,
      },
    });

    if (!existing) {
      await tx.kbDocument.create({
        data: {
          title: doc.title,
          docType: doc.docType,
          content: doc.content,
          chunkIndex: 0,
        },
      });
    } else if (existing.content === legacyDemoContent.get(doc.title)) {
      // Chỉ thay nội dung demo cũ và làm mới vector ở lần đồng bộ tiếp theo.
      await tx.$executeRaw`
        UPDATE kb_documents
        SET content = ${doc.content}, embedding = NULL, updated_at = NOW()
        WHERE id = ${existing.id}::uuid AND content = ${existing.content}
      `;
    }
  }
}

async function main() {
  if (process.env.ALLOW_DEMO_SEED?.toLowerCase() !== 'true') {
    throw new Error(
      'Hãy bật ALLOW_DEMO_SEED=true khi chạy seed trên CSDL demo.',
    );
  }

  const passwords = await Promise.all(
    DEMO_ACCOUNTS.map(({ username }) => bcrypt.hash(username, 10)),
  );
  const verifiedAt = new Date();
  await prisma.$transaction(
    async (tx) => {
      let newDemoStaff: string | undefined;
      for (const [index, account] of DEMO_ACCOUNTS.entries()) {
        const createAssignment = account.role === UserRole.WAREHOUSE_STAFF &&
          !(await tx.user.findUnique({ where: { username: account.username }, select: { id: true } }));
        const user = await tx.user.upsert({
          where: { username: account.username },
          update: {},
          create: {
            ...account,
            email: `${account.username}@demo.example.test`,
            passwordHash: passwords[index],
            emailVerifiedAt: verifiedAt,
            isActive: true,
            mustChangePassword: false,
          },
          select: { id: true, role: true, email: true },
        });
        if (user.role !== account.role) {
          throw new Error(
            `Tên đăng nhập "${account.username}" đã được dùng cho vai trò khác.`,
          );
        }
        if (createAssignment && user.email === 'staff@demo.example.test') newDemoStaff = user.id;
      }
      await seedCatalog(tx);
      if (newDemoStaff) {
        const warehouses = await tx.warehouse.findMany({
          where: { isActive: true, code: { in: ['WH-HN01', 'WH-HCM01'] } },
          select: { id: true },
        });
        await tx.warehouseStaffAssignment.createMany({
          data: warehouses.map(({ id: warehouseId }) => ({ userId: newDemoStaff!, warehouseId })),
          skipDuplicates: true,
        });
      }
      await seedKnowledge(tx);
    },
    { timeout: 30_000 },
  );

  console.log('Đã nạp dữ liệu demo cho admin, staff và customer.');
  console.log(
    `${DEMO_PRODUCTS.length} sản phẩm, ${DEMO_WAREHOUSES.length} kho và ${KB_DOCUMENTS_SEED_DATA.length} tài liệu RAG.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('Không nạp được dữ liệu demo:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
