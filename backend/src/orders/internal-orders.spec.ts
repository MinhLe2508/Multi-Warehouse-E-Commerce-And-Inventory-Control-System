import 'reflect-metadata';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ParseUUIDPipe,
  ValidationPipe,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { ROLES_KEY } from '../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import { PasswordChangedGuard } from '../core/guards/password-changed.guard';
import { RolesGuard } from '../core/guards/roles.guard';
import { InternalOrderQueryDto } from './dto/internal-order-query.dto';
import { InternalOrderController } from './internal-orders.controller';
import { InternalOrdersService } from './internal-orders.service';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const CODE = 'ORD-1A2B3C4D5E6F7A8B9C0D';

const dec = (v: string) => new Prisma.Decimal(v);
const row = (over: Record<string, unknown> = {}) => ({
  orderCode: CODE,
  status: 'CONFIRMED',
  subtotal: dec('200000'),
  discountTotal: dec('0'),
  shippingFee: dec('0'),
  grandTotal: dec('200000'),
  currency: 'VND',
  shippingRegion: 'Miền Nam',
  cancelledReason: null,
  createdAt: new Date('2026-11-05T01:00:00Z'),
  confirmedAt: new Date('2026-11-05T01:05:00Z'),
  cancelledAt: null,
  items: [
    {
      productName: 'Áo thun',
      sku: 'SKU-1',
      quantity: 2,
      unitPrice: dec('100000'),
      discountAmount: dec('0'),
      lineTotal: dec('200000'),
    },
  ],
  statusHistory: [
    {
      fromStatus: 'PENDING_PAYMENT',
      toStatus: 'CONFIRMED',
      createdAt: new Date('2026-11-05T01:05:00Z'),
    },
    {
      fromStatus: null,
      toStatus: 'PENDING_PAYMENT',
      createdAt: new Date('2026-11-05T01:00:00Z'),
    },
  ],
  ...over,
});

describe('InternalOrdersService - STT 29', () => {
  const prisma = { order: { findMany: jest.fn() } };
  const service = new InternalOrdersService(prisma as never);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.order.findMany.mockResolvedValue([row()]);
  });

  it('luôn lọc theo userId và sắp xếp mới nhất trước', async () => {
    await service.findForUser(USER_A);
    const arg = prisma.order.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: USER_A });
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    expect(arg.take).toBe(3);
  });

  it('có orderCode: vẫn giữ điều kiện userId, chuẩn hóa chữ hoa, take 1', async () => {
    await service.findForUser(USER_A, {
      orderCode: `  ${CODE.toLowerCase()} `,
    });
    const arg = prisma.order.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: USER_A, orderCode: CODE });
    expect(arg.take).toBe(1);
  });

  it('đơn của người khác trả 404 giống đơn không tồn tại', async () => {
    // DB không có dòng nào khớp (userId, orderCode) vì đơn thuộc USER_B.
    prisma.order.findMany.mockResolvedValue([]);
    await expect(
      service.findForUser(USER_A, { orderCode: CODE }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('chưa có đơn nào: trả danh sách rỗng, không lỗi', async () => {
    prisma.order.findMany.mockResolvedValue([]);
    await expect(service.findForUser(USER_A)).resolves.toEqual({ orders: [] });
  });

  it.each([
    [undefined, 3],
    [1, 1],
    [5, 5],
    [99, 5],
    [0, 1],
    [Number.NaN, 3],
  ])('limit %p -> take %p', async (limit, take) => {
    await service.findForUser(USER_A, { limit });
    expect(prisma.order.findMany.mock.calls[0][0].take).toBe(take);
  });

  it('select là allow-list: không có PII giao hàng hay id nội bộ', async () => {
    await service.findForUser(USER_A);
    const { select } = prisma.order.findMany.mock.calls[0][0];
    for (const banned of [
      'shippingRecipient',
      'shippingPhone',
      'shippingAddress',
      'userId',
      'id',
      'reservationExpiresAt',
      'payments',
      'reservations',
      'user',
    ]) {
      expect(select).not.toHaveProperty(banned);
    }
    expect(Object.keys(select.items.select)).not.toEqual(
      expect.arrayContaining(['inventoryId']),
    );
    expect(select.items.select).not.toHaveProperty('warehouseId');
    expect(select.statusHistory.select).not.toHaveProperty('actorId');
    expect(select.statusHistory.select).not.toHaveProperty('reason');
  });

  it('serialize: tiền dạng chuỗi 2 số lẻ, ngày ISO, nhãn tiếng Việt', async () => {
    const { orders } = await service.findForUser(USER_A);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      orderCode: CODE,
      status: 'CONFIRMED',
      statusLabel: 'Đã xác nhận',
      grandTotal: '200000.00',
      confirmedAt: '2026-11-05T01:05:00.000Z',
      cancelledAt: null,
      lastStatusChangeAt: '2026-11-05T01:05:00.000Z',
    });
    expect(orders[0].items[0]).toEqual({
      productName: 'Áo thun',
      sku: 'SKU-1',
      quantity: 2,
      unitPrice: '100000.00',
      discountAmount: '0.00',
      lineTotal: '200000.00',
    });
    expect(orders[0].statusHistory[0]).toEqual({
      fromStatus: 'PENDING_PAYMENT',
      toStatus: 'CONFIRMED',
      at: '2026-11-05T01:05:00.000Z',
    });
    expect(JSON.stringify(orders)).not.toMatch(/actor|phone|address/i);
  });
});

describe('InternalOrderController - STT 29', () => {
  const svc = { findForUser: jest.fn() };
  const controller = new InternalOrderController(svc as never);
  const user = (userId: string) =>
    ({
      userId,
      username: 'u',
      email: 'u@x.vn',
      role: UserRole.CUSTOMER,
      mustChangePassword: false,
    }) as never;

  beforeEach(() => {
    jest.resetAllMocks();
    svc.findForUser.mockResolvedValue({ orders: [] });
  });

  it('chủ tài khoản: gọi service với userId từ JWT và query', async () => {
    const q = { orderCode: CODE, limit: 2 } as InternalOrderQueryDto;
    await expect(controller.list(user(USER_A), USER_A, q)).resolves.toEqual({
      orders: [],
    });
    expect(svc.findForUser).toHaveBeenCalledWith(USER_A, q);
  });

  it('userId trên URL khác JWT: 403 và KHÔNG chạm vào service/DB', () => {
    expect(() => controller.list(user(USER_A), USER_B, {})).toThrow(
      ForbiddenException,
    );
    expect(svc.findForUser).not.toHaveBeenCalled();
  });

  it('gắn đủ guard theo thứ tự JWT -> đổi mật khẩu -> vai trò, chỉ CUSTOMER', () => {
    expect(Reflect.getMetadata('__guards__', InternalOrderController)).toEqual([
      JwtAuthGuard,
      PasswordChangedGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, InternalOrderController)).toEqual([
      UserRole.CUSTOMER,
    ]);
    expect(Reflect.getMetadata('path', InternalOrderController)).toBe(
      'internal/orders',
    );
  });

  it('RolesGuard chặn ADMIN / WAREHOUSE_STAFF', () => {
    const guard = new RolesGuard({
      getAllAndOverride: () => [UserRole.CUSTOMER],
    } as never);
    const ctx = (role: UserRole) =>
      ({
        getHandler: () => undefined,
        getClass: () => undefined,
        switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      }) as never;
    expect(guard.canActivate(ctx(UserRole.CUSTOMER))).toBe(true);
    expect(guard.canActivate(ctx(UserRole.ADMIN))).toBe(false);
    expect(guard.canActivate(ctx(UserRole.WAREHOUSE_STAFF))).toBe(false);
  });

  it('userId không phải UUID bị ParseUUIDPipe từ chối (400)', async () => {
    const pipe = new ParseUUIDPipe();
    await expect(
      pipe.transform('abc', { type: 'param', data: 'userId' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('InternalOrderQueryDto - STT 29', () => {
  // Cấu hình giống main.ts.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const run = (q: unknown) =>
    pipe.transform(q, { type: 'query', metatype: InternalOrderQueryDto });

  it('query rỗng hợp lệ', async () => {
    await expect(run({})).resolves.toMatchObject({});
  });

  it('chuẩn hóa orderCode và ép limit từ chuỗi sang số', async () => {
    await expect(
      run({ orderCode: ` ${CODE.toLowerCase()} `, limit: '2' }),
    ).resolves.toMatchObject({ orderCode: CODE, limit: 2 });
  });

  it('chuỗi rỗng coi như không truyền', async () => {
    const r = (await run({
      orderCode: '',
      limit: '',
    })) as InternalOrderQueryDto;
    expect(r.orderCode).toBeUndefined();
    expect(r.limit).toBeUndefined();
  });

  it.each([
    [{ orderCode: 'abc' }],
    [{ orderCode: "ORD-1'; DROP TABLE orders;--" }],
    [{ limit: '0' }],
    [{ limit: '6' }],
    [{ limit: '1.5' }],
    [{ limit: 'abc' }],
    [{ userId: USER_B }], // không cho truyền userId qua query
    [{ foo: 'bar' }],
  ])('từ chối %j', async (q) => {
    await expect(run(q)).rejects.toBeInstanceOf(BadRequestException);
  });
});
