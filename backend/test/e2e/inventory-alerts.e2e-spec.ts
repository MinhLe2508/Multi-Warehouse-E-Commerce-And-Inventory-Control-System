import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { AlertStatus, NotificationType, UserRole } from '@prisma/client';
import { AdminAlertsController } from '../../src/admin/alerts/admin-alerts.controller';
import { InventoryChangeEmitter } from '../../src/inventory/inventory-change-emitter.service';
import { HttpExceptionFilter } from '../../src/core/filters/http-exception.filter';
import { JwtAuthGuard } from '../../src/core/guards/jwt-auth.guard';
import { PasswordChangedGuard } from '../../src/core/guards/password-changed.guard';
import { RolesGuard } from '../../src/core/guards/roles.guard';
import {
  InventoryPubSubService,
  type LowStockEvent,
} from '../../src/inventory/inventory-pubsub.service';
import {
  InventoryService,
  type StockAlertView,
} from '../../src/inventory/inventory.service';
import { LowStockNotifierService } from '../../src/notifications/low-stock-notifier.service';
import { NotificationsGateway } from '../../src/notifications/notifications.gateway';
import { PrismaService } from '../../src/prisma/prisma.service';

interface InMemoryAlertRecord {
  id: bigint;
  inventoryId: string;
  warehouseId: string;
  productId: string;
  availableAtTrigger: number;
  thresholdAtTrigger: number;
  status: AlertStatus;
  triggeredAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  warehouse: {
    id: string;
    code: string;
    name: string;
  };
  product: {
    id: string;
    sku: string;
    name: string;
  };
}

interface InMemoryNotificationRecord {
  id: bigint;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  referenceType: string | null;
  referenceId: string | null;
}

interface SimulatedHttpResponse<T = Record<string, unknown>> {
  status: number;
  body: T;
}

async function invokeHttp<T = Record<string, unknown>>(
  app: INestApplication,
  options: {
    method: 'GET' | 'PATCH' | 'POST';
    url: string;
    headers?: Record<string, string>;
  },
): Promise<SimulatedHttpResponse<T>> {
  const expressInstance = app.getHttpAdapter().getInstance() as (
    req: IncomingMessage,
    res: ServerResponse,
  ) => void;

  return new Promise<SimulatedHttpResponse<T>>((resolve, reject) => {
    const socket = new Socket();
    const req = new IncomingMessage(socket);
    req.method = options.method;
    req.url = options.url;
    req.headers = {};
    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        req.headers[k.toLowerCase()] = v;
      }
    }

    const res = new ServerResponse(req);
    const chunks: Buffer[] = [];

    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);

    res.write = ((chunk: unknown, ...args: unknown[]) => {
      if (chunk) {
        chunks.push(
          Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(
                typeof chunk === 'string' ? chunk : JSON.stringify(chunk),
              ),
        );
      }
      return (origWrite as (...a: unknown[]) => boolean)(chunk, ...args);
    }) as typeof res.write;

    res.end = ((chunk?: unknown, ...args: unknown[]) => {
      if (chunk && typeof chunk !== 'function') {
        chunks.push(
          Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(
                typeof chunk === 'string' ? chunk : JSON.stringify(chunk),
              ),
        );
      }
      (origEnd as (...a: unknown[]) => ServerResponse)(chunk, ...args);
      const raw = Buffer.concat(chunks).toString('utf8');
      let parsed: unknown = raw;
      try {
        parsed = raw ? JSON.parse(raw) : {};
      } catch {
        // keep raw string
      }
      socket.destroy();
      resolve({
        status: res.statusCode,
        body: parsed as T,
      });
      return res;
    }) as typeof res.end;

    try {
      expressInstance(req, res);
      req.push(null);
    } catch (err) {
      socket.destroy();
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

describe('Inventory Alerts & LowStockNotifier E2E (F121)', () => {
  let app: INestApplication;
  let notifierService: LowStockNotifierService;
  let lowStockListener: ((event: LowStockEvent) => void) | null = null;

  const warehouseId = '550e8400-e29b-41d4-a716-446655440000';
  const productId = '660e8400-e29b-41d4-a716-446655440001';
  const adminUserId = '770e8400-e29b-41d4-a716-446655440002';

  let alertsStore: InMemoryAlertRecord[] = [];
  let notificationsStore: InMemoryNotificationRecord[] = [];
  let nextAlertId = 1n;
  let nextNotificationId = 100n;

  const gatewayMock = {
    emitLowStockAlert: jest.fn(),
    emitInventoryChanged: jest.fn(),
  };
  const changes = {
    publishInventory: jest.fn().mockResolvedValue(undefined),
  };

  const pubsubMock = {
    onLowStock: jest.fn((listener: (event: LowStockEvent) => void) => {
      lowStockListener = listener;
      return () => {
        lowStockListener = null;
      };
    }),
    onInventoryChanged: jest.fn(() => () => undefined),
    publishLowStock: jest.fn(async (event: LowStockEvent) => {
      await Promise.resolve();
      if (lowStockListener) {
        lowStockListener(event);
        return 1;
      }
      return 0;
    }),
    publishInventoryChanged: jest.fn(async () => {
      await Promise.resolve();
      return 1;
    }),
  };

  function toAlertView(record: InMemoryAlertRecord): StockAlertView {
    return {
      id: record.id.toString(),
      inventoryId: record.inventoryId,
      status: record.status,
      alertLevel: record.availableAtTrigger <= 0 ? 'CRITICAL' : 'WARNING',
      availableAtTrigger: record.availableAtTrigger,
      thresholdAtTrigger: record.thresholdAtTrigger,
      triggeredAt: record.triggeredAt,
      resolvedAt: record.resolvedAt,
      resolvedBy: record.resolvedBy,
      product: record.product,
      warehouse: record.warehouse,
    };
  }

  const inventoryServiceMock = {
    findOpenAlerts: jest.fn(async () => {
      await Promise.resolve();
      return alertsStore
        .filter((a) => a.status === AlertStatus.OPEN)
        .map(toAlertView);
    }),
    findAlerts: jest.fn(
      async (query: {
        status?: 'OPEN' | 'RESOLVED';
        alertLevel?: 'WARNING' | 'CRITICAL';
        warehouseId?: string;
        limit?: number;
        offset?: number;
      }) => {
        await Promise.resolve();
        const filtered = alertsStore.filter((a) => {
          if (query.status && a.status !== query.status) return false;
          if (query.warehouseId && a.warehouseId !== query.warehouseId)
            return false;
          if (
            query.alertLevel &&
            toAlertView(a).alertLevel !== query.alertLevel
          )
            return false;
          return true;
        });
        const limit = query.limit ?? 50;
        const offset = query.offset ?? 0;
        const openAlerts = alertsStore.filter(
          (a) => a.status === AlertStatus.OPEN,
        );
        return {
          total: filtered.length,
          limit,
          offset,
          summary: {
            openCount: openAlerts.length,
            criticalCount: openAlerts.filter((a) => a.availableAtTrigger <= 0)
              .length,
            warningCount: openAlerts.filter((a) => a.availableAtTrigger > 0)
              .length,
          },
          items: filtered.slice(offset, offset + limit).map(toAlertView),
        };
      },
    ),
  };

  const prismaMock = {
    warehouse: {
      findMany: jest.fn(async () => {
        await Promise.resolve();
        return [{ id: warehouseId }];
      }),
    },
    user: {
      findMany: jest.fn(async () => {
        await Promise.resolve();
        return [{ id: adminUserId }];
      }),
    },
    notification: {
      findMany: jest.fn(
        async (args: { where?: { referenceId?: { in?: string[] } } }) => {
          await Promise.resolve();
          const ids = args?.where?.referenceId?.in ?? [];
          return notificationsStore
            .filter((n) => n.referenceId && ids.includes(n.referenceId))
            .map((n) => ({
              userId: n.userId,
              referenceId: n.referenceId,
              title: n.title,
            }));
        },
      ),
      createMany: jest.fn(
        async (args: {
          data: Array<{
            userId: string;
            type: NotificationType;
            title: string;
            body: string;
            referenceType: string;
            referenceId: string;
          }>;
        }) => {
          await Promise.resolve();
          for (const row of args.data) {
            notificationsStore.push({
              id: nextNotificationId++,
              userId: row.userId,
              type: row.type,
              title: row.title,
              body: row.body,
              referenceType: row.referenceType,
              referenceId: row.referenceId,
            });
          }
          return { count: args.data.length };
        },
      ),
    },
    stockAlert: {
      updateMany: jest.fn(
        async (args: {
          where: { id: bigint; status: AlertStatus };
          data: { status: AlertStatus; resolvedAt: Date; resolvedBy: string };
        }) => {
          await Promise.resolve();
          let count = 0;
          for (const a of alertsStore) {
            if (a.id === args.where.id && a.status === args.where.status) {
              a.status = args.data.status;
              a.resolvedAt = args.data.resolvedAt;
              a.resolvedBy = args.data.resolvedBy;
              count++;
            }
          }
          return { count };
        },
      ),
      findUnique: jest.fn(async (args: { where: { id: bigint } }) => {
        await Promise.resolve();
        const found = alertsStore.find((a) => a.id === args.where.id);
        if (!found) return null;
        return {
          id: found.id,
          inventoryId: BigInt(found.inventoryId),
          status: found.status,
          resolvedAt: found.resolvedAt,
          resolvedBy: found.resolvedBy,
        };
      }),
    },
    $queryRaw: jest.fn(async () => {
      await Promise.resolve();
      return [{ locked: true }];
    }),
    $transaction: jest.fn(
      async <T>(cb: (tx: typeof prismaMock) => Promise<T>): Promise<T> =>
        cb(prismaMock),
    ),
  };

  const mockJwtAuthGuard: CanActivate = {
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest<{
        headers: Record<string, string | undefined>;
        user?: { userId: string; role: UserRole };
      }>();
      const auth = req.headers['authorization'];
      if (!auth || !auth.startsWith('Bearer ')) {
        throw new UnauthorizedException({
          code: 'UNAUTHORIZED',
          message: 'Access Token không hợp lệ hoặc đã hết hạn.',
        });
      }
      const token = auth.replace('Bearer ', '').trim();
      if (token === 'admin-token') {
        req.user = { userId: adminUserId, role: UserRole.ADMIN };
        return true;
      }
      if (token === 'customer-token') {
        req.user = { userId: 'cust-1', role: UserRole.CUSTOMER };
        return true;
      }
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Access Token không hợp lệ hoặc đã hết hạn.',
      });
    },
  };

  const mockPasswordChangedGuard: CanActivate = {
    canActivate(): boolean {
      return true;
    },
  };

  const mockRolesGuard: CanActivate = {
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest<{
        user?: { userId: string; role: UserRole };
      }>();
      if (
        !req.user ||
        (req.user.role !== UserRole.ADMIN &&
          req.user.role !== UserRole.WAREHOUSE_STAFF)
      ) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Bạn không có quyền truy cập tài nguyên Quản trị viên.',
        });
      }
      return true;
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminAlertsController],
      providers: [
        LowStockNotifierService,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        { provide: PrismaService, useValue: prismaMock },
        { provide: InventoryService, useValue: inventoryServiceMock },
        { provide: InventoryChangeEmitter, useValue: changes },
        { provide: InventoryPubSubService, useValue: pubsubMock },
        { provide: NotificationsGateway, useValue: gatewayMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .overrideGuard(PasswordChangedGuard)
      .useValue(mockPasswordChangedGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    notifierService = moduleFixture.get<LowStockNotifierService>(
      LowStockNotifierService,
    );
    notifierService.onModuleInit();
  });

  beforeEach(() => {
    alertsStore = [];
    notificationsStore = [];
    nextAlertId = 1n;
    nextNotificationId = 100n;
    jest.clearAllMocks();
  });

  afterAll(async () => {
    notifierService.onModuleDestroy();
    await app.close();
  });

  it('1. Chặn truy cập trái phép (401/403) và chặn fuzzing query/param bẩn với Error Envelope F005 (400 VALIDATION_ERROR)', async () => {
    // 1.1 Không gửi token -> 401
    const unauthRes = await invokeHttp(app, {
      method: 'GET',
      url: '/admin/alerts',
    });
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.body).toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      path: '/admin/alerts',
    });

    // 1.2 Token CUSTOMER -> 403
    const forbiddenRes = await invokeHttp(app, {
      method: 'GET',
      url: '/admin/alerts',
      headers: { Authorization: 'Bearer customer-token' },
    });
    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body).toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
      path: '/admin/alerts',
    });

    // 1.3 Fuzzing query bẩn -> 400 VALIDATION_ERROR
    const badQueryRes = await invokeHttp(app, {
      method: 'GET',
      url: '/admin/alerts?limit=NaN&warehouseId=sql_inject&status=HACK',
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(badQueryRes.status).toBe(400);
    expect(badQueryRes.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      path: '/admin/alerts',
    });

    // 1.4 ID cảnh báo không hợp lệ -> 400 VALIDATION_ERROR
    const badIdRes = await invokeHttp(app, {
      method: 'PATCH',
      url: '/admin/alerts/not-a-bigint/resolve',
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(badIdRes.status).toBe(400);
    expect(badIdRes.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('chuẩn hóa mức cảnh báo trước khi gọi truy vấn phân trang', async () => {
    const result = await invokeHttp(app, {
      method: 'GET',
      url: `/admin/alerts?warehouseId=${warehouseId}&alertLevel=critical&limit=1&offset=2`,
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(result.status).toBe(200);
    expect(inventoryServiceMock.findAlerts).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId,
        alertLevel: 'CRITICAL',
        limit: 1,
        offset: 2,
      }),
      UserRole.ADMIN,
    );
    const invalid = await invokeHttp(app, {
      method: 'GET',
      url: '/admin/alerts?alertLevel=UNKNOWN',
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(invalid.status).toBe(400);
  });

  it('2. Luồng E2E hoàn chỉnh: Reserve chạm ngưỡng -> Alert WARNING -> Chống trùng (Dedup) -> Nâng cấp CRITICAL -> Admin xem & Resolve Idempotent', async () => {
    // Bước 1: Khi tồn kho giảm xuống 4 (<= threshold 10), bản ghi StockAlert OPEN được tạo
    const alertId = nextAlertId++;
    const alertRecord: InMemoryAlertRecord = {
      id: alertId,
      inventoryId: '10',
      warehouseId,
      productId,
      availableAtTrigger: 4,
      thresholdAtTrigger: 10,
      status: AlertStatus.OPEN,
      triggeredAt: new Date('2026-11-17T07:00:00.000Z'),
      resolvedAt: null,
      resolvedBy: null,
      warehouse: {
        id: warehouseId,
        code: 'WH-HN-01',
        name: 'Kho Hà Nội 01',
      },
      product: {
        id: productId,
        sku: 'SKU-LAPTOP-01',
        name: 'Laptop Gaming Pro',
      },
    };
    alertsStore.push(alertRecord);

    // Chạy notifier lần 1: tạo Notification mức WARNING và phát sự kiện WebSocket
    const createdFirst = await notifierService.dispatchOpenAlerts();
    expect(createdFirst).toBe(1);
    expect(notificationsStore).toHaveLength(1);
    expect(notificationsStore[0].title).toBe('Sắp hết hàng: Laptop Gaming Pro');
    expect(gatewayMock.emitLowStockAlert).toHaveBeenCalledTimes(1);
    expect(gatewayMock.emitLowStockAlert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        alertId: alertId.toString(),
        alertLevel: 'WARNING',
        availableStock: 4,
      }),
    );

    // Bước 2: Chạy lại notifier khi vẫn ở mức WARNING -> Chống trùng (Dedup), không tạo thêm
    const createdSecond = await notifierService.dispatchOpenAlerts();
    expect(createdSecond).toBe(0);
    expect(notificationsStore).toHaveLength(1);
    expect(gatewayMock.emitLowStockAlert).toHaveBeenCalledTimes(1);

    // Bước 3: Đơn hàng mới giữ chỗ nốt phần tồn còn lại -> availableAtTrigger = 0 (Nâng cấp lên CRITICAL)
    alertRecord.availableAtTrigger = 0;
    const createdUpgrade = await notifierService.dispatchOpenAlerts();
    expect(createdUpgrade).toBe(1);
    expect(notificationsStore).toHaveLength(2);
    expect(notificationsStore[1].title).toBe('Hết hàng: Laptop Gaming Pro');
    expect(gatewayMock.emitLowStockAlert).toHaveBeenCalledTimes(2);
    expect(gatewayMock.emitLowStockAlert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        alertId: alertId.toString(),
        alertLevel: 'CRITICAL',
        availableStock: 0,
      }),
    );

    // Bước 4: Admin truy vấn GET /admin/alerts -> Kiểm tra cấu trúc phẳng và summary
    const listRes = await invokeHttp<{
      total: number;
      summary: {
        openCount: number;
        criticalCount: number;
        warningCount: number;
      };
      items: Array<Record<string, unknown>>;
    }>(app, {
      method: 'GET',
      url: `/admin/alerts?warehouseId=${warehouseId}&status=OPEN`,
      headers: { Authorization: 'Bearer admin-token' },
    });

    expect(listRes.status).toBe(200);
    expect(listRes.body.total).toBe(1);
    expect(listRes.body.summary).toEqual({
      openCount: 1,
      criticalCount: 1,
      warningCount: 0,
    });
    expect(listRes.body.items[0]).toMatchObject({
      id: alertId.toString(),
      warehouseId,
      warehouseCode: 'WH-HN-01',
      productId,
      productSku: 'SKU-LAPTOP-01',
      availableAtTrigger: 0,
      thresholdAtTrigger: 10,
      alertLevel: 'CRITICAL',
      status: 'OPEN',
    });

    // Bước 5: Admin gọi PATCH /admin/alerts/:id/resolve lần 1 -> alreadyResolved: false
    const resolveFirst = await invokeHttp(app, {
      method: 'PATCH',
      url: `/admin/alerts/${alertId.toString()}/resolve`,
      headers: { Authorization: 'Bearer admin-token' },
    });

    expect(resolveFirst.status).toBe(200);
    expect(resolveFirst.body).toMatchObject({
      id: alertId.toString(),
      status: 'RESOLVED',
      resolvedBy: adminUserId,
      alreadyResolved: false,
    });

    // Bước 6: Admin gọi lại PATCH /admin/alerts/:id/resolve lần 2 (Idempotent) -> alreadyResolved: true
    const resolveSecond = await invokeHttp(app, {
      method: 'PATCH',
      url: `/admin/alerts/${alertId.toString()}/resolve`,
      headers: { Authorization: 'Bearer admin-token' },
    });

    expect(resolveSecond.status).toBe(200);
    expect(resolveSecond.body).toMatchObject({
      id: alertId.toString(),
      status: 'RESOLVED',
      resolvedBy: adminUserId,
      alreadyResolved: true,
    });
    expect(changes.publishInventory).toHaveBeenCalledTimes(1);
  });
});
