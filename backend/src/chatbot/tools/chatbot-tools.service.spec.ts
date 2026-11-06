import { Prisma, UserRole } from '@prisma/client';
import { ChatbotToolsService } from './chatbot-tools.service';
import { CHATBOT_TOOLS } from './chatbot-tools.definition';
import { PrismaService } from '../../prisma/prisma.service';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';

function makeOrder(code: string) {
  return {
    orderCode: code,
    status: 'SHIPPING',
    grandTotal: new Prisma.Decimal('350000'),
    shippingFee: new Prisma.Decimal('30000'),
    currency: 'VND',
    shippingRegion: 'Hà Nội',
    cancelledReason: null,
    createdAt: new Date('2026-11-01T02:00:00Z'),
    confirmedAt: new Date('2026-11-01T02:05:00Z'),
    cancelledAt: null,
    items: [
      {
        productName: 'Chuột G102',
        sku: 'SKU-1',
        quantity: 1,
        lineTotal: new Prisma.Decimal('320000'),
      },
    ],
    statusHistory: [
      { toStatus: 'SHIPPING', createdAt: new Date('2026-11-02T00:00:00Z') },
    ],
  };
}

function makeProduct() {
  const wh = (code: string, region: string, isActive = true) => ({
    code,
    name: `Kho ${code}`,
    region,
    isActive,
    defaultLowStockThreshold: 10,
  });
  return {
    id: PRODUCT_ID,
    sku: 'SKU-1',
    name: 'Chuột G102',
    isActive: true,
    inventory: [
      {
        stock: 20,
        reservedStock: 5,
        availableStock: 15,
        threshold: null,
        warehouse: wh('HN01', 'Hà Nội'),
      },
      {
        stock: 3,
        reservedStock: 0,
        availableStock: 3,
        threshold: 5,
        warehouse: wh('HCM01', 'TP.HCM'),
      },
      {
        stock: 0,
        reservedStock: 0,
        availableStock: 0,
        threshold: null,
        warehouse: wh('DN01', 'Đà Nẵng'),
      },
    ],
  };
}

describe('ChatbotToolsService', () => {
  let service: ChatbotToolsService;
  let prisma: {
    order: { findMany: jest.Mock };
    product: { findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      order: { findMany: jest.fn() },
      product: { findFirst: jest.fn() },
    };
    service = new ChatbotToolsService(prisma as unknown as PrismaService);
  });

  describe('ChatbotToolsDefinition', () => {
    it('lookupOrder KHÔNG cho LLM truyền userId', () => {
      const lookup = CHATBOT_TOOLS.find((t) => t.name === 'lookupOrder');
      expect(lookup).toBeDefined();
      expect(Object.keys(lookup!.input_schema.properties ?? {})).not.toContain(
        'userId',
      );
    });
  });

  describe('lookupOrder — phân quyền', () => {
    it('khách vãng lai -> AUTH_REQUIRED, không truy vấn DB', async () => {
      const res = await service.execute('lookupOrder', {}, {});
      expect(res).toMatchObject({ ok: false, error: 'AUTH_REQUIRED' });
      expect(prisma.order.findMany).not.toHaveBeenCalled();
    });

    it('luôn lọc theo userId của người đang hỏi, bỏ qua userId do LLM chèn vào input', async () => {
      prisma.order.findMany.mockResolvedValue([makeOrder('ORD-AAAA1111')]);

      await service.execute(
        'lookupOrder',
        { userId: USER_B },
        { userId: USER_A, role: UserRole.CUSTOMER },
      );

      const args = prisma.order.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ userId: USER_A });
    });

    it('mã đơn của người khác -> NOT_FOUND (không lộ sự tồn tại)', async () => {
      prisma.order.findMany.mockResolvedValue([]); // vì WHERE userId = A nên đơn của B không khớp

      const res = await service.execute(
        'lookupOrder',
        { orderCode: 'ord-bbbb2222' },
        { userId: USER_A, role: UserRole.CUSTOMER },
      );

      expect(res).toMatchObject({ ok: false, error: 'NOT_FOUND' });
      const args = prisma.order.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ userId: USER_A, orderCode: 'ORD-BBBB2222' });
      expect(args.take).toBe(1);
    });

    it('từ chối orderCode sai định dạng (chống injection qua input LLM)', async () => {
      const res = await service.execute(
        'lookupOrder',
        { orderCode: "x' OR 1=1 --" },
        { userId: USER_A },
      );
      expect(res).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
      expect(prisma.order.findMany).not.toHaveBeenCalled();
    });

    it('giới hạn limit tối đa 5 và trả dữ liệu không chứa địa chỉ/SĐT', async () => {
      prisma.order.findMany.mockResolvedValue([makeOrder('ORD-AAAA1111')]);

      const res = await service.execute(
        'lookupOrder',
        { limit: 999 },
        { userId: USER_A },
      );

      expect(prisma.order.findMany.mock.calls[0][0].take).toBe(5);
      expect(res.ok).toBe(true);
      const json = JSON.stringify(res);
      expect(json).toContain('ORD-AAAA1111');
      expect(json).toContain('Đang giao hàng');
      expect(json).not.toContain('shippingPhone');
      expect(json).not.toContain('shippingAddress');
      const select = prisma.order.findMany.mock.calls[0][0].select;
      expect(select.shippingPhone).toBeUndefined();
      expect(select.shippingAddress).toBeUndefined();
    });
  });

  describe('checkInventory — phân quyền', () => {
    it('yêu cầu productId hoặc keyword', async () => {
      const res = await service.execute('checkInventory', {}, {});
      expect(res).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    });

    it('productId không phải UUID -> INVALID_INPUT', async () => {
      const res = await service.execute(
        'checkInventory',
        { productId: 'abc' },
        {},
      );
      expect(res).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
      expect(prisma.product.findFirst).not.toHaveBeenCalled();
    });

    it('khách: chỉ sản phẩm đang bán + kho đang hoạt động, dữ liệu tổng hợp theo khu vực', async () => {
      prisma.product.findFirst.mockResolvedValue(makeProduct());

      const res = await service.execute(
        'checkInventory',
        { productId: PRODUCT_ID },
        {},
      );

      const args = prisma.product.findFirst.mock.calls[0][0];
      expect(args.where).toMatchObject({ id: PRODUCT_ID, isActive: true });
      expect(args.select.inventory.where).toEqual({
        warehouse: { isActive: true },
      });

      expect(res.ok).toBe(true);
      const data = (res as { data: Record<string, unknown> }).data;
      expect(data.totalAvailable).toBe(18);
      expect(data.regions).toEqual(
        expect.arrayContaining([
          { region: 'Hà Nội', status: 'IN_STOCK' },
          { region: 'Đà Nẵng', status: 'OUT_OF_STOCK' },
        ]),
      );
      const json = JSON.stringify(res);
      expect(json).not.toContain('reservedStock');
      expect(json).not.toContain('HN01');
      expect(data.warehouses).toBeUndefined();
    });

    it('ADMIN/STAFF: thấy chi tiết từng kho kèm mức cảnh báo', async () => {
      prisma.product.findFirst.mockResolvedValue(makeProduct());

      const res = await service.execute(
        'checkInventory',
        { productId: PRODUCT_ID },
        { userId: USER_A, role: UserRole.WAREHOUSE_STAFF },
      );

      const args = prisma.product.findFirst.mock.calls[0][0];
      expect(args.where.isActive).toBeUndefined();
      const data = (
        res as { data: { warehouses: Array<Record<string, unknown>> } }
      ).data;
      expect(data.warehouses).toHaveLength(3);
      expect(data.warehouses[0]).toMatchObject({
        warehouseCode: 'HN01',
        reservedStock: 5,
        level: 'IN_STOCK',
      });
      expect(data.warehouses[1]).toMatchObject({
        warehouseCode: 'HCM01',
        level: 'LOW_STOCK',
      });
      expect(data.warehouses[2]).toMatchObject({
        warehouseCode: 'DN01',
        level: 'OUT_OF_STOCK',
      });
    });

    it('tìm theo keyword (tên/SKU) khi không có productId', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      const res = await service.execute(
        'checkInventory',
        { keyword: 'G102' },
        {},
      );
      expect(res).toMatchObject({ ok: false, error: 'NOT_FOUND' });
      expect(prisma.product.findFirst.mock.calls[0][0].where.OR).toHaveLength(
        2,
      );
    });
  });

  it('tool không xác định -> UNKNOWN_TOOL', async () => {
    const res = await service.execute(
      'deleteAllOrders',
      {},
      { userId: USER_A },
    );
    expect(res).toMatchObject({ ok: false, error: 'UNKNOWN_TOOL' });
  });

  it('lỗi DB không làm crash, trả INTERNAL_ERROR', async () => {
    prisma.order.findMany.mockRejectedValue(new Error('db down'));
    const res = await service.execute('lookupOrder', {}, { userId: USER_A });
    expect(res).toMatchObject({ ok: false, error: 'INTERNAL_ERROR' });
  });
});
