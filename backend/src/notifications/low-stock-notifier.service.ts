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
import type {
  InventoryChangedEvent,
  LowStockEvent,
} from '../inventory/inventory-pubsub.service';
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
const ALERT_BATCH_SIZE = 500;
const PAGE_FETCH_LIMIT = 100;

@Injectable()
export class LowStockNotifierService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LowStockNotifierService.name);
  private running = false;
  private unsubscribe?: () => void;
  private unsubscribeInventoryChanged?: () => void;

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
    // Forward kênh inventory.changed từ Redis sang WebSocket room quản trị.
    if (typeof this.pubsub.onInventoryChanged === 'function') {
      this.unsubscribeInventoryChanged = this.pubsub.onInventoryChanged(
        (event) => this.gateway.emitInventoryChanged?.({ ...event }),
      );
    }
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribeInventoryChanged?.();
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

  /**
   * Phát sự kiện biến động tồn kho SAU khi DB transaction đã commit.
   * Best-effort: lỗi Redis không bao giờ làm hỏng giao dịch đã commit; tự động fallback sang Gateway cục bộ.
   */
  async notifyInventoryChanged(event: InventoryChangedEvent): Promise<void> {
    try {
      if (typeof this.pubsub.publishInventoryChanged === 'function') {
        const receivers = await this.pubsub.publishInventoryChanged(event);
        if (receivers > 0) return;
      }
    } catch {
      this.logger.warn('publishInventoryChanged failed, emitting locally');
    }
    this.gateway.emitInventoryChanged?.({ ...event });
  }

  /** Trả về số Notification đã tạo ở lượt này. */
  async dispatchOpenAlerts(): Promise<number> {
    if (this.running) return 0; // chống chạy chồng trong 1 process
    this.running = true;
    try {
      const openAlerts = await this.loadAllOpenAlerts();
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
        select: {
          id: true,
          role: true,
          warehouseAssignments: { select: { warehouseId: true } },
        },
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

  /**
   * Tải toàn bộ cảnh báo đang mở, tự động phân trang tiếp nếu vượt ngưỡng 500 để tránh bỏ đói các cảnh báo mới.
   */
  private async loadAllOpenAlerts(): Promise<StockAlertView[]> {
    const firstBatch =
      await this.inventoryService.findOpenAlerts(ALERT_BATCH_SIZE);
    if (
      firstBatch.length < ALERT_BATCH_SIZE ||
      typeof (
        this.inventoryService as {
          findAlerts?: InventoryService['findAlerts'];
        }
      ).findAlerts !== 'function'
    ) {
      return firstBatch;
    }

    const seenIds = new Set(firstBatch.map((a) => a.id));
    const allAlerts = [...firstBatch];
    let offset = firstBatch.length;

    while (offset < 5000) {
      const page = await this.inventoryService.findAlerts(
        { status: 'OPEN', limit: PAGE_FETCH_LIMIT, offset },
        UserRole.ADMIN,
      );
      if (!page.items || page.items.length === 0) break;
      for (const item of page.items) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          allAlerts.push(item);
        }
      }
      if (page.items.length < PAGE_FETCH_LIMIT) break;
      offset += page.items.length;
    }

    return allAlerts;
  }

  // Tạo Notification chưa có (hoặc khi nâng mức cảnh báo WARNING -> CRITICAL), trả về các cảnh báo vừa được thông báo.
  private async saveNotifications(
    alerts: StockAlertView[],
    recipients: {
      id: string;
      role: UserRole;
      warehouseAssignments: Array<{ warehouseId: string }>;
    }[],
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
        select: { userId: true, referenceId: true, title: true },
      });

      const done = new Set<string>();
      for (const n of existing as Array<{
        userId: string;
        referenceId: string | null;
        title?: string;
      }>) {
        const refId = n.referenceId ?? '';
        if (!n.title || n.title.startsWith('Hết hàng:')) {
          // Không có title (mock cũ) hoặc đã gửi thông báo mức CRITICAL -> đánh dấu hoàn tất cả 2 mức
          done.add(`${n.userId}:${refId}:WARNING`);
          done.add(`${n.userId}:${refId}:CRITICAL`);
        } else {
          // Đã gửi thông báo mức WARNING -> nếu sau đó nâng lên CRITICAL vẫn được gửi thêm
          done.add(`${n.userId}:${refId}:WARNING`);
        }
      }

      const data: {
        userId: string;
        type: NotificationType;
        title: string;
        body: string;
        referenceType: string;
        referenceId: string;
        warehouseId: string;
      }[] = [];
      const fresh: StockAlertView[] = [];
      for (const alert of alerts) {
        const { title, body } = this.buildMessage(alert);
        const levelKey =
          alert.alertLevel === 'CRITICAL' ? 'CRITICAL' : 'WARNING';
        let isFresh = false;
        for (const user of recipients) {
          if (
            user.role === UserRole.WAREHOUSE_STAFF &&
            !user.warehouseAssignments.some(
              ({ warehouseId }) => warehouseId === alert.warehouse.id,
            )
          ) {
            continue;
          }
          const dedupKey = `${user.id}:${alert.id}:${levelKey}`;
          if (done.has(dedupKey)) continue;
          done.add(dedupKey);
          isFresh = true;
          data.push({
            userId: user.id,
            type: NotificationType.LOW_STOCK,
            title,
            body,
            referenceType: STOCK_ALERT_REFERENCE_TYPE,
            referenceId: alert.id,
            warehouseId: alert.warehouse.id,
          });
        }
        if (isFresh) fresh.push(alert);
      }

      // Chia theo batch 500 để tránh vượt giới hạn parameter của PostgreSQL khi số lượng thông báo lớn
      for (let i = 0; i < data.length; i += ALERT_BATCH_SIZE) {
        await tx.notification.createMany({
          data: data.slice(i, i + ALERT_BATCH_SIZE),
        });
      }
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
