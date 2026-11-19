# Minh / P5 — Tuần 4: NotificationsGateway + LowStockNotifier (STT 24)

Nhiệm vụ: *NotificationsGateway (WebSocket đẩy `low_stock_alert` real-time cho Admin), LowStockAlertService (subscribe Redis, ghi stock_alerts), phối hợp Triết hoàn thiện trang Alerts.* Hạn 01/11/2026.

## 0. Đọc trước: ghi chú của Khang trong ảnh

| Ghi chú Khang | Trạng thái trong repo | Việc của bạn |
|---|---|---|
| `publishLowStock` ném lỗi khi Redis tắt → bọc `try/catch` ở nơi gọi | Có sẵn | Notifier gọi trong `try/catch`, lỗi → emit trực tiếp qua gateway (Bước 3) |
| Chưa đổi job sang `expireForOrder` của Huy | Chưa làm | **Không đụng** `reservation-cleanup.job.ts`. Hỏi Huy khi cần |
| `reservation-cleanup.job.ts` sửa 6 chỗ | Đã có (`InventoryAlertService`, `touchedInventoryIds`, `evaluate`) | Không dán đè bản cũ |
| `inventory-pubsub.service.ts`: bỏ `async onModuleInit`, subscribe qua sự kiện `ready` | Đã có | Chỉ **thêm** `onLowStock()` (Bước 1) |
| `inventory.module.ts` đã có controller, `InventoryService`, `InventoryAlertModule` | Đã có | **Không sửa, không dán đè** |
| `low-stock-notifier.service.ts` (file mới): cron + `findOpenAlerts()`, Notification cho Admin & Staff đang hoạt động, bỏ alert đã có Notification, bỏ kho ngừng hoạt động, publish sau khi lưu DB, map bằng `availableAtTrigger`/`thresholdAtTrigger` | Chưa có | Bước 3 |
| `notifications.module.ts` import `InventoryModule` (không phải `InventoryAlertModule`) | Chưa | Bước 4 |
| `notifications.controller.ts`: `@UseGuards(JwtAuthGuard, RolesGuard)`, `@CurrentUser('userId')`, kiểm tra `:id` là số trước `BigInt()` | Chưa | Bước 5 |
| `notifications.gateway.ts`: xác thực JWT lúc kết nối, vào phòng theo `userId` | Chưa | Bước 2 |
| `core/redis/` (tùy chọn) | Bỏ qua | Không làm |

## 1. Kiến trúc và quyết định cần biết

```text
Cron 1 phút ─▶ InventoryService.findOpenAlerts()  (stock_alerts đã được InventoryAlertService ghi trong transaction tồn kho)
           ─▶ lọc kho ngừng hoạt động ─▶ lọc người nhận (Admin + Staff active)
           ─▶ TRANSACTION + advisory lock: bỏ cặp (user, alert) đã có Notification ─▶ createMany
           ─▶ (sau commit) publishLowStock lên Redis  [try/catch]
Redis inventory.low_stock ─▶ InventoryPubSubService.onLowStock ─▶ gateway.emitLowStockAlert ─▶ room role:ADMIN (event low_stock_alert)
Redis lỗi / 0 subscriber ─▶ notifier emit trực tiếp trên instance hiện tại
```

- **Không ghi `stock_alerts` lần nữa.** Bảng này đã do `InventoryAlertService.evaluate()` ghi trong cùng transaction với tồn kho, có ràng buộc `uq_alerts_one_open_per_inventory`. Ghi thêm sẽ xung đột. Phần “ghi stock_alerts” trong tên task đã được đáp ứng ở đó; phần của bạn là đọc → thông báo → đẩy realtime.
- DB là nguồn dữ liệu gốc, Redis chỉ là đường đẩy nhanh (Pub/Sub không replay). Mất sự kiện thì Admin vẫn thấy qua `GET /notifications` và `GET /inventory/alerts`.
- Chống trùng 2 lớp: cờ `running` (trong 1 process) và `pg_try_advisory_xact_lock` (nhiều process).
- `low_stock_alert` chỉ gửi room `role:ADMIN` (đúng đề bài). Staff vẫn có Notification trong DB; muốn Staff có realtime thì emit thêm vào room `role:WAREHOUSE_STAFF` trong `emitLowStockAlert`.

## 2. Bước 0 — chuẩn bị

```powershell
cd D:\MinhDangHocCode\CNPM\Project\Multi-Warehouse-E-Commerce-And-Inventory-Control-System
git status --short
git pull
docker compose up -d postgres redis
```

`.env` phải có `JWT_ACCESS_SECRET`, `REDIS_URL`, `FRONTEND_ORIGIN`. Không cần cài thêm package (`@nestjs/websockets`, `@nestjs/platform-socket.io`, `@nestjs/jwt`, `@nestjs/schedule`, `ioredis` đã có).

Các bước sau tương ứng file (toàn bộ nội dung file ở **Phụ lục**).

## 3. Bước 1 — `inventory-pubsub.service.ts`: thêm `onLowStock()`

Sửa 4 chỗ (mở file ở phụ lục A để chép nguyên):
1. `LowStockEvent`: thêm các trường tùy chọn `alertId, alertLevel, sku, productName, warehouseCode, triggeredAt` + `export type LowStockHandler`.
2. `isLowStockEvent`: kiểm tra các trường tùy chọn (nếu có phải là string, `alertLevel` là WARNING/CRITICAL).
3. Thêm `private readonly handlers = new Set<LowStockHandler>()`; trong `on('message')`, sau khi hợp lệ thì gọi từng handler trong `try/catch`.
4. Thêm `onLowStock(handler)` trả về hàm hủy đăng ký.

## 4. Bước 2 — `notifications.gateway.ts` (xác thực JWT)

Chép phụ lục B. Điểm chính: token lấy từ `auth.token` (không nhận qua query string); `verifyAsync` + `type === 'access'` + `sub` là UUID; đọc lại user từ DB (active, email đã xác thực trừ Admin) giống `JwtStrategy`; join room `userId` và `role:<ROLE>`; sai thì emit `auth_error` và `disconnect`.

## 5. Bước 3 — `low-stock-notifier.service.ts` (file mới)

Chép phụ lục C.

## 6. Bước 4 — `notifications.module.ts`

Chép phụ lục D. `InventoryModule` không import `NotificationsModule` nên không có vòng phụ thuộc. `JwtModule.registerAsync` dùng chung `JWT_ACCESS_SECRET` với AuthModule. `AppModule` đã import `NotificationsModule` và `ScheduleModule.forRoot()`, không cần sửa.

## 7. Bước 5 — `notifications.controller.ts`

Chép phụ lục E. Thay đổi so với bản cũ: guard, userId từ token, `:id` phải khớp `^[1-9]\d{0,17}$` trước `BigInt()`, id không thuộc user → 404.

## 8. Bước 6 — kiểm tra

```powershell
cd backend
npx eslint src/notifications src/inventory/inventory-pubsub.service.ts
npx tsc --noEmit
npx jest src/notifications
npm run start:dev
```

Mong đợi log: `Subscribed to inventory.low_stock`; đầu mỗi phút nếu có alert mới: `Created N low-stock notification(s)`.

**Demo thủ công**
1. Đăng nhập Admin lấy access token (`POST /auth/login`).
2. Kết nối socket (script Node, đặt ở `backend/` để dùng `socket.io-client` nếu có, hoặc chạy trong console trang frontend):
```js
const { io } = require('socket.io-client');
const s = io('http://localhost:3001/notifications', { auth: { token: '<ACCESS_TOKEN>' } });
s.on('low_stock_alert', (e) => console.log('ALERT', e));
s.on('auth_error', (e) => console.log('AUTH ERROR', e));
```
3. Tạo cảnh báo: dùng `PUT /inventory/:id` (Admin) hạ `stock` xuống ≤ ngưỡng → `InventoryAlertService` ghi `stock_alerts` → tối đa 1 phút sau socket nhận `low_stock_alert`.
4. Thử không token / token sai → nhận `auth_error` và bị ngắt.
5. Redis tắt (`docker compose stop redis`) rồi lặp lại: backend không sập, vẫn nhận alert (emit trực tiếp), log `publishLowStock failed, emitting locally`.
6. SQL kiểm tra không trùng: `SELECT user_id, reference_id, COUNT(*) FROM notifications WHERE reference_type='StockAlert' GROUP BY 1,2 HAVING COUNT(*)>1;` phải rỗng.

Ghi chú: test Jest `products.spec.ts` cần mở cổng localhost; nếu chạy trong sandbox sẽ lỗi `EACCES`, không liên quan phần này.

## 9. Bước 7 — phối hợp Triết (trang Alerts)

Hợp đồng:

| | |
|---|---|
| Namespace | `http://localhost:3001/notifications` |
| Xác thực | `io(url, { auth: { token: accessToken } })`, chỉ Admin nhận `low_stock_alert` |
| Sự kiện | `low_stock_alert`; lỗi xác thực: `auth_error` |
| REST | `GET /inventory/alerts?status=OPEN` (danh sách gốc), `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` |

Payload `low_stock_alert` (id là chuỗi, frontend mock đang dùng `number` → dùng `Number(alertId)`):
```json
{ "alertId": "12", "inventoryId": "5", "productId": "uuid", "warehouseId": "uuid",
  "availableStock": 3, "threshold": 5, "alertLevel": "WARNING",
  "sku": "SKU1", "productName": "Áo thun", "warehouseCode": "WH1",
  "triggeredAt": "2026-10-27T14:00:00.000Z" }
```

Hook gợi ý cho Triết (`frontend/hooks/useLowStockSocket.ts`; `socket.io-client` đã có trong `frontend/package.json`; thay nguồn token cho đúng cách lưu của Auth, hiện `dev-login` vẫn là mock):
```ts
'use client';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import type { StockAlert } from '../shared/types/admin';

interface LowStockPayload {
  alertId: string; inventoryId: string; warehouseId: string; availableStock: number;
  threshold: number; alertLevel: 'WARNING' | 'CRITICAL'; sku: string;
  productName: string; warehouseCode: string; triggeredAt: string;
}

export function useLowStockSocket(token: string | null, onAlert: (a: StockAlert) => void) {
  useEffect(() => {
    if (!token) return;
    const url = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/notifications`;
    const socket = io(url, { auth: { token }, transports: ['websocket'] });
    socket.on('low_stock_alert', (e: LowStockPayload) =>
      onAlert({
        id: Number(e.alertId), inventoryId: Number(e.inventoryId), alertLevel: e.alertLevel,
        status: 'OPEN', sku: e.sku, productName: e.productName, warehouseId: e.warehouseId,
        warehouseCode: e.warehouseCode, availableAtTrigger: e.availableStock,
        thresholdAtTrigger: e.threshold, triggeredAt: e.triggeredAt,
      }),
    );
    return () => { socket.disconnect(); };
  }, [token, onAlert]);
}
```
Trong `useAlerts()` (`frontend/hooks/useAdminAnalytics.ts`): khi nhận alert, thêm vào đầu danh sách nếu chưa có `id` đó (chống trùng khi vừa tải REST vừa nhận socket); `onAlert` nên bọc `useCallback`.

Việc cần hỏi Triết: nguồn token sau khi có Auth thật; trang Alerts chuyển từ mock sang `GET /inventory/alerts`; nút “resolve” gọi endpoint nào (hiện backend chưa có endpoint resolve riêng, alert tự RESOLVED khi tồn kho vượt ngưỡng).

## 10. Bước 8 — commit (không dùng `git add .`)

```powershell
git diff --check
git add backend/src/inventory/inventory-pubsub.service.ts backend/src/notifications docs/p5-week4/README.md
git diff --cached --stat
git commit -m "feat: add week 4 low-stock notifier and authenticated notifications gateway"
```

## 11. Rủi ro còn lại

- Gateway chỉ kiểm tra JWT lúc kết nối: token hết hạn hoặc tài khoản bị khóa sau đó vẫn giữ socket đến khi ngắt (cần nếu muốn chặt hơn: client kết nối lại khi refresh token).
- Redis Pub/Sub không lưu sự kiện; cần outbox nếu yêu cầu đảm bảo tuyệt đối.
- Nhiều instance + Redis sống: mỗi instance emit cho socket của chính nó. Nếu 1 instance mất subscriber đúng lúc đó thì Admin nối vào instance ấy bỏ lỡ sự kiện (vẫn có Notification trong DB).
- Chưa kiểm thử end-to-end với PostgreSQL/Redis thật: Jest dùng mock; hãy chạy mục 8.
- Không sửa `reservation-cleanup.job.ts`; việc đổi sang `expireForOrder` chờ Huy xác nhận.

## Phụ lục — mã nguồn

### Phụ lục A — `backend/src/inventory/inventory-pubsub.service.ts`

```typescript
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';

export const LOW_STOCK_CHANNEL = 'inventory.low_stock';

export interface LowStockEvent {
  inventoryId: string;
  productId: string;
  warehouseId: string;
  availableStock: number;
  threshold: number;
  // Các trường TÙY CHỌN do LowStockNotifierService thêm vào để giao diện Alerts hiển thị ngay, không cần gọi lại API.
  alertId?: string;
  alertLevel?: 'WARNING' | 'CRITICAL';
  sku?: string;
  productName?: string;
  warehouseCode?: string;
  triggeredAt?: string;
}

export type LowStockHandler = (event: LowStockEvent) => void;

export function isLowStockEvent(value: unknown): value is LowStockEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  const optionalStringsOk = [
    'alertId',
    'sku',
    'productName',
    'warehouseCode',
    'triggeredAt',
  ].every((key) => event[key] === undefined || typeof event[key] === 'string');
  const levelOk =
    event.alertLevel === undefined ||
    event.alertLevel === 'WARNING' ||
    event.alertLevel === 'CRITICAL';
  return (
    optionalStringsOk &&
    levelOk &&
    ['inventoryId', 'productId', 'warehouseId'].every(
      (key) => typeof event[key] === 'string' && event[key].length > 0,
    ) &&
    Number.isSafeInteger(event.availableStock) &&
    Number.isSafeInteger(event.threshold) &&
    (event.availableStock as number) >= 0 &&
    (event.threshold as number) >= 0 &&
    (event.availableStock as number) <= (event.threshold as number)
  );
}

@Injectable()
export class InventoryPubSubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryPubSubService.name);
  private publisher: Redis;
  private subscriber: Redis;
  private readonly handlers = new Set<LowStockHandler>();

  onModuleInit(): void {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const options = {
      connectTimeout: 2000,
      commandTimeout: 3000,
      maxRetriesPerRequest: 1,
    };
    this.publisher = new Redis(url, options);
    this.subscriber = new Redis(url, options);
    this.publisher.on('error', () =>
      this.logger.warn('Redis publisher unavailable'),
    );
    this.subscriber.on('error', () =>
      this.logger.warn('Redis subscriber unavailable'),
    );
    this.subscriber.on('message', (channel, message) => {
      if (channel !== LOW_STOCK_CHANNEL) return;
      try {
        const event: unknown = JSON.parse(message);
        if (!isLowStockEvent(event)) throw new Error('Invalid low-stock event');
        // Tuần 4: chuyển sự kiện cho các consumer đã đăng ký (NotificationsGateway đẩy WebSocket).
        for (const handler of this.handlers) {
          try {
            handler(event);
          } catch {
            this.logger.warn('A low-stock handler failed');
          }
        }
        this.logger.log(
          `Low stock: inventory=${event.inventoryId}, available=${event.availableStock}, threshold=${event.threshold}`,
        );
      } catch {
        this.logger.warn('Ignored invalid inventory.low_stock payload');
      }
    });
    // Đăng ký kênh mỗi khi kết nối sẵn sàng (lần đầu và cả khi Redis khởi động chậm / kết nối lại).
    // Lỗi chỉ ghi cảnh báo, KHÔNG làm sập backend.
    this.subscriber.on('ready', () => {
      this.subscriber
        .subscribe(LOW_STOCK_CHANNEL)
        .then(() => this.logger.log(`Subscribed to ${LOW_STOCK_CHANNEL}`))
        .catch(() =>
          this.logger.warn(`Cannot subscribe to ${LOW_STOCK_CHANNEL}`),
        );
    });
  }

  // Đăng ký nhận sự kiện tồn thấp. Trả về hàm hủy đăng ký.
  onLowStock(handler: LowStockHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  // Call AFTER the inventory transaction commits. Redis is not the stock ledger.
  async publishLowStock(event: LowStockEvent): Promise<number> {
    if (!isLowStockEvent(event)) throw new Error('Invalid low-stock event');
    return this.publisher.publish(LOW_STOCK_CHANNEL, JSON.stringify(event));
  }

  onModuleDestroy(): void {
    this.publisher?.disconnect();
    this.subscriber?.disconnect();
  }
}
```


### Phụ lục B — `backend/src/notifications/notifications.gateway.ts`

```typescript
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { UserRole } from '@prisma/client';
import { isUUID } from 'class-validator';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

export const LOW_STOCK_ALERT_EVENT = 'low_stock_alert';
export const ADMIN_ROOM = `role:${UserRole.ADMIN}`;

interface AccessTokenPayload {
  sub?: unknown;
  type?: unknown;
}

/**
 * WebSocket Gateway cho Notifications.
 * - Client kết nối tới namespace /notifications, gửi JWT Access Token trong
 *   `auth: { token }` của socket.io-client.
 * - Server xác thực JWT (cùng quy tắc với JwtStrategy: chữ ký, hạn, type=access,
 *   tài khoản còn hoạt động), KHÔNG tin role trong token mà đọc role mới nhất từ DB.
 * - Sau khi xác thực, client join room `userId` (thông báo cá nhân) và room
 *   `role:<ROLE>` (kênh theo vai trò, ví dụ Admin nhận low_stock_alert).
 * - Xác thực sai: gửi 'auth_error' rồi ngắt kết nối ngay.
 */
@WebSocketGateway({
  namespace: 'notifications',
  cors: {
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000',
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) throw new Error('Missing token');

      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        { algorithms: ['HS256'] },
      );
      if (
        payload.type !== 'access' ||
        typeof payload.sub !== 'string' ||
        !isUUID(payload.sub)
      ) {
        throw new Error('Invalid token payload');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, isActive: true, emailVerifiedAt: true },
      });
      if (
        !user ||
        !user.isActive ||
        (user.role !== UserRole.ADMIN && user.emailVerifiedAt === null)
      ) {
        throw new Error('Invalid account');
      }

      Object.assign(client.data as object, {
        userId: user.id,
        role: user.role,
      });
      await client.join(user.id);
      await client.join(`role:${user.role}`);
      this.logger.log(`Client connected: ${client.id} user=${user.id}`);
    } catch {
      // Không lộ lý do chi tiết cho client.
      client.emit('auth_error', { message: 'Unauthorized' });
      client.disconnect(true);
      this.logger.warn(`Rejected unauthenticated socket: ${client.id}`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Gửi thông báo real-time đến user cụ thể.
   */
  sendToUser(userId: string, payload: Record<string, unknown>) {
    this.server?.to(userId).emit('notification', payload);
  }

  /**
   * Đẩy sự kiện `low_stock_alert` cho mọi Admin đang online.
   */
  emitLowStockAlert(payload: Record<string, unknown>) {
    this.server?.to(ADMIN_ROOM).emit(LOW_STOCK_ALERT_EVENT, payload);
  }

  // Chỉ nhận token trong auth/header, KHÔNG nhận qua query string (tránh lộ token trong log).
  private extractToken(client: Socket): string | null {
    const authToken: unknown = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken.replace(/^Bearer\s+/i, '');
    }
    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && /^Bearer\s+\S+$/i.test(header)) {
      return header.replace(/^Bearer\s+/i, '');
    }
    return null;
  }
}
```


### Phụ lục C — `backend/src/notifications/low-stock-notifier.service.ts`

```typescript
// =============================================================================
// LowStockNotifierService (Minh / P5, tuần 4)
//
// Vai trò: biến các cảnh báo tồn thấp (bảng stock_alerts, do InventoryAlertService
// ghi TRONG transaction tồn kho) thành Notification cho Admin/Staff và đẩy real-time.
//
// Luồng:
//   1. @Cron mỗi phút -> InventoryService.findOpenAlerts().
//   2. Bỏ cảnh báo của kho đã ngừng hoạt động.
//   3. Với mỗi (cảnh báo, người nhận) CHƯA có Notification
//      (type=LOW_STOCK, referenceType='StockAlert', referenceId=alert.id): tạo mới.
//      Việc kiểm tra + tạo nằm trong 1 transaction có advisory lock nên nhiều
//      instance backend chạy cùng lúc cũng không tạo trùng.
//   4. SAU KHI commit: publishLowStock lên Redis (bọc try/catch). Mọi instance đang
//      subscribe nhận sự kiện và gọi gateway.emitLowStockAlert() cho Admin online.
//      Nếu Redis lỗi hoặc không có subscriber -> emit trực tiếp trên instance này.
//
// stock_alerts KHÔNG được ghi ở đây: InventoryAlertService đã ghi (có ràng buộc
// uq_alerts_one_open_per_inventory). Ghi lần nữa sẽ gây xung đột.
// =============================================================================

import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationType, UserRole } from '@prisma/client';
import { InventoryPubSubService } from '../inventory/inventory-pubsub.service';
import type { LowStockEvent } from '../inventory/inventory-pubsub.service';
import {
  InventoryService,
  type StockAlertView,
} from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';

export const STOCK_ALERT_REFERENCE_TYPE = 'StockAlert';
// Khóa advisory của riêng job này (số tùy ý, không trùng khóa khác trong dự án).
const NOTIFIER_LOCK_KEY = 47004001;
const TITLE_MAX = 255;

@Injectable()
export class LowStockNotifierService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LowStockNotifierService.name);
  private running = false;
  private unsubscribe?: () => void;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly pubsub: InventoryPubSubService,
    private readonly gateway: NotificationsGateway,
  ) {}

  onModuleInit(): void {
    // Mọi sự kiện low_stock nhận từ Redis -> đẩy WebSocket cho Admin đang online.
    this.unsubscribe = this.pubsub.onLowStock((event) =>
      this.gateway.emitLowStockAlert({ ...event }),
    );
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron(): Promise<void> {
    try {
      const count = await this.dispatchOpenAlerts();
      if (count > 0)
        this.logger.log(`Created ${count} low-stock notification(s)`);
    } catch (error) {
      this.logger.error(
        'Low-stock notifier failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /** Trả về số Notification đã tạo ở lượt này. */
  async dispatchOpenAlerts(): Promise<number> {
    if (this.running) return 0; // chống chạy chồng trong 1 process
    this.running = true;
    try {
      const openAlerts = await this.inventoryService.findOpenAlerts();
      if (openAlerts.length === 0) return 0;

      const activeWarehouses = await this.prisma.warehouse.findMany({
        where: {
          id: { in: [...new Set(openAlerts.map((a) => a.warehouse.id))] },
          isActive: true,
        },
        select: { id: true },
      });
      const activeIds = new Set(activeWarehouses.map((w) => w.id));
      const alerts = openAlerts.filter((a) => activeIds.has(a.warehouse.id));
      if (alerts.length === 0) return 0;

      const recipients = await this.prisma.user.findMany({
        where: {
          isActive: true,
          role: { in: [UserRole.ADMIN, UserRole.WAREHOUSE_STAFF] },
          OR: [{ role: UserRole.ADMIN }, { emailVerifiedAt: { not: null } }],
        },
        select: { id: true },
      });
      if (recipients.length === 0) return 0;

      const { fresh, created } = await this.saveNotifications(
        alerts,
        recipients,
      );
      for (const alert of fresh) {
        await this.publish(alert);
      }
      return created;
    } finally {
      this.running = false;
    }
  }

  // Tạo Notification chưa có, trả về các cảnh báo vừa được thông báo lần đầu.
  private async saveNotifications(
    alerts: StockAlertView[],
    recipients: { id: string }[],
  ): Promise<{ fresh: StockAlertView[]; created: number }> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { locked: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(${NOTIFIER_LOCK_KEY}::bigint) AS locked`;
      if (!locked[0]?.locked) return { fresh: [], created: 0 }; // instance khác đang xử lý

      const existing = await tx.notification.findMany({
        where: {
          type: NotificationType.LOW_STOCK,
          referenceType: STOCK_ALERT_REFERENCE_TYPE,
          referenceId: { in: alerts.map((a) => a.id) },
        },
        select: { userId: true, referenceId: true },
      });
      const done = new Set(existing.map((n) => `${n.userId}:${n.referenceId}`));

      const data: {
        userId: string;
        type: NotificationType;
        title: string;
        body: string;
        referenceType: string;
        referenceId: string;
      }[] = [];
      const fresh: StockAlertView[] = [];
      for (const alert of alerts) {
        const { title, body } = this.buildMessage(alert);
        let isFresh = false;
        for (const user of recipients) {
          if (done.has(`${user.id}:${alert.id}`)) continue;
          isFresh = true;
          data.push({
            userId: user.id,
            type: NotificationType.LOW_STOCK,
            title,
            body,
            referenceType: STOCK_ALERT_REFERENCE_TYPE,
            referenceId: alert.id,
          });
        }
        if (isFresh) fresh.push(alert);
      }
      if (data.length > 0) await tx.notification.createMany({ data });
      return { fresh, created: data.length };
    });
  }

  // Gọi SAU commit. Redis lỗi không được làm hỏng job: DB đã lưu xong.
  private async publish(alert: StockAlertView): Promise<void> {
    const event: LowStockEvent = {
      inventoryId: alert.inventoryId,
      productId: alert.product.id,
      warehouseId: alert.warehouse.id,
      availableStock: alert.availableAtTrigger,
      threshold: alert.thresholdAtTrigger,
      alertId: alert.id,
      alertLevel: alert.alertLevel,
      sku: alert.product.sku,
      productName: alert.product.name,
      warehouseCode: alert.warehouse.code,
      triggeredAt: alert.triggeredAt.toISOString(),
    };
    try {
      const receivers = await this.pubsub.publishLowStock(event);
      if (receivers > 0) return; // subscriber sẽ gọi gateway
    } catch {
      this.logger.warn('publishLowStock failed, emitting locally');
    }
    this.gateway.emitLowStockAlert({ ...event });
  }

  private buildMessage(alert: StockAlertView): { title: string; body: string } {
    const prefix =
      alert.alertLevel === 'CRITICAL' ? 'Hết hàng' : 'Sắp hết hàng';
    const title = `${prefix}: ${alert.product.name}`.slice(0, TITLE_MAX);
    const body =
      `${alert.product.sku} tại kho ${alert.warehouse.code} còn ` +
      `${alert.availableAtTrigger} (ngưỡng ${alert.thresholdAtTrigger}).`;
    return { title, body };
  }
}
```


### Phụ lục D — `backend/src/notifications/notifications.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { LowStockNotifierService } from './low-stock-notifier.service';

// InventoryModule KHÔNG import ngược NotificationsModule nên không có vòng phụ thuộc.
// JwtModule: để Gateway xác thực Access Token (cùng secret với AuthModule).
@Module({
  imports: [
    InventoryModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_ACCESS_SECRET;
        if (!secret || !secret.trim()) {
          throw new Error('Thiếu JWT_ACCESS_SECRET.');
        }
        return { secret };
      },
    }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    LowStockNotifierService,
  ],
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
```


### Phụ lục E — `backend/src/notifications/notifications.controller.ts`

```typescript
import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../core/decorators/current-user.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import { RolesGuard } from '../core/guards/roles.guard';
import { NotificationsService } from './notifications.service';
import { NotificationQueryDto } from './dto/notification-query.dto';

// Mọi endpoint yêu cầu đăng nhập; userId luôn lấy từ token, không nhận từ client.
// Không gắn @Roles: người dùng nào cũng đọc được thông báo CỦA CHÍNH MÌNH.
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * GET /notifications
   * Lấy danh sách thông báo của user hiện tại.
   */
  @Get()
  async findAll(
    @CurrentUser('userId') userId: string,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationsService.findByUser(userId, query);
  }

  /**
   * GET /notifications/unread-count
   * Đếm thông báo chưa đọc.
   */
  @Get('unread-count')
  async countUnread(@CurrentUser('userId') userId: string) {
    const count = await this.notificationsService.countUnread(userId);
    return { count };
  }

  /**
   * PATCH /notifications/read-all
   * Đánh dấu tất cả thông báo đã đọc.
   */
  @Patch('read-all')
  async markAllAsRead(@CurrentUser('userId') userId: string) {
    await this.notificationsService.markAllAsRead(userId);
    return { success: true };
  }

  /**
   * PATCH /notifications/:id/read
   * Đánh dấu 1 thông báo đã đọc. id không phải số -> 400; không phải của mình -> 404.
   */
  @Patch(':id/read')
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ) {
    if (!/^[1-9]\d{0,17}$/.test(id)) {
      throw new BadRequestException('ID thông báo không hợp lệ.');
    }
    const result = await this.notificationsService.markAsRead(
      BigInt(id),
      userId,
    );
    if (result.count === 0) {
      throw new NotFoundException('Không tìm thấy thông báo.');
    }
    return { success: true };
  }
}
```


### Phụ lục F — `backend/src/notifications/low-stock-notifier.service.spec.ts`

```typescript
import { LowStockNotifierService } from './low-stock-notifier.service';

const alert = (id: string, warehouseId = 'w1') => ({
  id,
  inventoryId: '10',
  alertLevel: 'WARNING' as const,
  status: 'OPEN' as const,
  stockAtTrigger: 3,
  availableAtTrigger: 3,
  thresholdAtTrigger: 5,
  triggeredAt: new Date('2026-10-27T00:00:00Z'),
  resolvedAt: null,
  resolvedBy: null,
  currentStock: 3,
  currentAvailable: 3,
  product: { id: 'p1', sku: 'SKU1', name: 'Áo thun' },
  warehouse: { id: warehouseId, code: 'WH1', name: 'Kho 1' },
});

function build(opts: {
  alerts: ReturnType<typeof alert>[];
  existing?: { userId: string; referenceId: string }[];
  locked?: boolean;
  publish?: jest.Mock;
}) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ locked: opts.locked ?? true }]),
    notification: {
      findMany: jest.fn().mockResolvedValue(opts.existing ?? []),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    warehouse: { findMany: jest.fn().mockResolvedValue([{ id: 'w1' }]) },
    user: {
      findMany: jest.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const inventory = {
    findOpenAlerts: jest.fn().mockResolvedValue(opts.alerts),
  };
  const pubsub = {
    onLowStock: jest.fn(),
    publishLowStock: opts.publish ?? jest.fn().mockResolvedValue(1),
  };
  const gateway = { emitLowStockAlert: jest.fn() };
  const service = new LowStockNotifierService(
    prisma as never,
    inventory as never,
    pubsub as never,
    gateway as never,
  );
  return { service, tx, prisma, pubsub, gateway };
}

describe('LowStockNotifierService', () => {
  it('tạo Notification cho từng người nhận và publish sau khi lưu', async () => {
    const { service, tx, pubsub, gateway } = build({ alerts: [alert('1')] });
    await expect(service.dispatchOpenAlerts()).resolves.toBe(2);
    const calls = tx.notification.createMany.mock.calls as unknown as [
      { data: Record<string, unknown>[] },
    ][];
    const data = calls[0][0].data;
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      type: 'LOW_STOCK',
      referenceType: 'StockAlert',
      referenceId: '1',
    });
    expect(pubsub.publishLowStock).toHaveBeenCalledWith(
      expect.objectContaining({
        alertId: '1',
        availableStock: 3,
        threshold: 5,
      }),
    );
    expect(gateway.emitLowStockAlert).not.toHaveBeenCalled();
  });

  it('bỏ qua alert đã có Notification', async () => {
    const { service, tx, pubsub } = build({
      alerts: [alert('1')],
      existing: [
        { userId: 'u1', referenceId: '1' },
        { userId: 'u2', referenceId: '1' },
      ],
    });
    await expect(service.dispatchOpenAlerts()).resolves.toBe(0);
    expect(tx.notification.createMany).not.toHaveBeenCalled();
    expect(pubsub.publishLowStock).not.toHaveBeenCalled();
  });

  it('bỏ qua alert của kho đã ngừng hoạt động', async () => {
    const { service, prisma } = build({ alerts: [alert('1', 'w-off')] });
    await expect(service.dispatchOpenAlerts()).resolves.toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('không làm gì khi instance khác đang giữ khóa', async () => {
    const { service, tx } = build({ alerts: [alert('1')], locked: false });
    await expect(service.dispatchOpenAlerts()).resolves.toBe(0);
    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });

  it('Redis lỗi: không ném lỗi, emit trực tiếp qua gateway', async () => {
    const { service, gateway } = build({
      alerts: [alert('1')],
      publish: jest.fn().mockRejectedValue(new Error('redis down')),
    });
    await expect(service.dispatchOpenAlerts()).resolves.toBe(2);
    expect(gateway.emitLowStockAlert).toHaveBeenCalledTimes(1);
  });

  it('onModuleInit nối sự kiện Redis với gateway', () => {
    const { service, pubsub, gateway } = build({ alerts: [] });
    service.onModuleInit();
    const handler = (
      pubsub.onLowStock.mock.calls as unknown as [(e: object) => void][]
    )[0][0];
    handler({ inventoryId: '1' });
    expect(gateway.emitLowStockAlert).toHaveBeenCalledWith({
      inventoryId: '1',
    });
  });
});
```


### Phụ lục G — `backend/src/notifications/notifications.gateway.spec.ts`

```typescript
import { NotificationsGateway } from './notifications.gateway';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function build(user: object | null, verify: jest.Mock) {
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
  const gateway = new NotificationsGateway(
    { verifyAsync: verify } as never,
    prisma as never,
  );
  const emit = jest.fn();
  gateway.server = { to: jest.fn().mockReturnValue({ emit }) } as never;
  const client = {
    id: 'c1',
    data: {} as Record<string, unknown>,
    handshake: { auth: { token: 'tok' }, headers: {} },
    join: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
  return { gateway, client, emit };
}

describe('NotificationsGateway', () => {
  it('JWT hợp lệ: join room userId và room role', async () => {
    const { gateway, client } = build(
      { id: USER_ID, role: 'ADMIN', isActive: true, emailVerifiedAt: null },
      jest.fn().mockResolvedValue({ sub: USER_ID, type: 'access' }),
    );
    await gateway.handleConnection(client as never);
    expect(client.join).toHaveBeenCalledWith(USER_ID);
    expect(client.join).toHaveBeenCalledWith('role:ADMIN');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('token sai chữ ký/hết hạn: ngắt kết nối', async () => {
    const { gateway, client } = build(
      null,
      jest.fn().mockRejectedValue(new Error('x')),
    );
    await gateway.handleConnection(client as never);
    expect(client.emit).toHaveBeenCalledWith('auth_error', expect.anything());
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('tài khoản bị khóa: ngắt kết nối', async () => {
    const { gateway, client } = build(
      { id: USER_ID, role: 'ADMIN', isActive: false, emailVerifiedAt: null },
      jest.fn().mockResolvedValue({ sub: USER_ID, type: 'access' }),
    );
    await gateway.handleConnection(client as never);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('refresh token (type != access): ngắt kết nối', async () => {
    const { gateway, client } = build(
      { id: USER_ID, role: 'ADMIN', isActive: true, emailVerifiedAt: null },
      jest.fn().mockResolvedValue({ sub: USER_ID, type: 'refresh' }),
    );
    await gateway.handleConnection(client as never);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('emitLowStockAlert chỉ gửi vào room Admin', () => {
    const { gateway, emit } = build(null, jest.fn());
    gateway.emitLowStockAlert({ a: 1 });
    expect(
      ((gateway.server.to as jest.Mock).mock.calls as string[][])[0][0],
    ).toBe('role:ADMIN');
    expect(emit).toHaveBeenCalledWith('low_stock_alert', { a: 1 });
  });
});
```
