import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { AdminInventoryService } from '../admin/inventory/admin-inventory.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaffProfileUpdate } from './staff-portal.dto';
import { staffOrderWhere, staffWarehouseWhere } from './warehouse-scope';

const DAY = 24 * 60 * 60 * 1000;
const vietnamOffset = 7 * 60 * 60 * 1000;
const dayKey = (date: Date) =>
  new Date(date.getTime() + vietnamOffset).toISOString().slice(0, 10);
const profileSelect = {
  id: true,
  fullName: true,
  username: true,
  email: true,
  phone: true,
  avatarUrl: true,
  role: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class StaffPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly summary: AdminInventoryService,
  ) {}

  async dashboard(userId: string, warehouseId?: string) {
    const today = dayKey(new Date());
    const start = new Date(`${today}T00:00:00+07:00`);
    const weekStart = new Date(start.getTime() - 6 * DAY);
    const end = new Date(start.getTime() + DAY);
    const orderScope = staffOrderWhere(userId, warehouseId);
    const inventoryScope: Prisma.InventoryWhereInput = {
      warehouseId,
      warehouse: staffWarehouseWhere(userId),
    };
    const stock = this.summary.getSummary(
      { warehouseId },
      UserRole.WAREHOUSE_STAFF,
      userId,
    );
    const alerts = this.inventory.findAlerts(
      { status: 'OPEN', warehouseId, limit: 4 },
      UserRole.WAREHOUSE_STAFF,
      userId,
    );
    const [summary, alertPage, ready, waiting, queue, restocked, shipped] =
      await Promise.all([
        stock,
        alerts,
        this.prisma.order.count({
          where: { ...orderScope, status: 'CONFIRMED' },
        }),
        this.prisma.order.count({
          where: { ...orderScope, status: 'PENDING_PAYMENT' },
        }),
        this.prisma.order.findMany({
          where: { ...orderScope, status: 'CONFIRMED' },
          orderBy: [
            { confirmedAt: 'asc' },
            { createdAt: 'asc' },
            { id: 'asc' },
          ],
          take: 5,
          select: {
            id: true,
            orderCode: true,
            shippingRecipient: true,
            createdAt: true,
            items: {
              select: { quantity: true, warehouse: { select: { code: true } } },
            },
          },
        }),
        this.prisma.inventoryAuditLog.aggregate({
          where: {
            inventory: inventoryScope,
            reason: 'RESTOCK',
            createdAt: { gte: start, lt: end },
          },
          _count: { _all: true },
          _sum: { quantityDelta: true },
        }),
        this.prisma.$queryRaw<Array<{ day: string; count: number }>>`
        SELECT to_char(h."created_at" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS "day",
               count(DISTINCT h."order_id")::int AS "count"
          FROM "order_status_history" h
         WHERE h."to_status" = 'SHIPPING' AND h."created_at" >= ${weekStart}::timestamptz
           AND h."created_at" < ${end}::timestamptz
           AND EXISTS (SELECT 1 FROM "order_items" item WHERE item."order_id" = h."order_id"
             AND (${warehouseId ?? null}::uuid IS NULL OR item."warehouse_id" = ${warehouseId ?? null}::uuid))
           AND NOT EXISTS (
             SELECT 1 FROM "order_items" item JOIN "warehouses" w ON w."id" = item."warehouse_id"
              WHERE item."order_id" = h."order_id" AND (
                NOT w."is_active" OR NOT EXISTS (
                  SELECT 1 FROM "warehouse_staff_assignments" a
                   WHERE a."user_id" = ${userId}::uuid AND a."warehouse_id" = w."id"
                )
              )
           )
         GROUP BY 1
      `,
      ]);
    const counts = new Map(shipped.map(({ day, count }) => [day, count]));
    return {
      today,
      ready,
      waiting,
      shippedToday: counts.get(today) ?? 0,
      openAlerts: alertPage.total,
      restockEvents: restocked._count._all,
      restockedUnits: restocked._sum.quantityDelta ?? 0,
      inventory: summary,
      queue: queue.map(({ items, ...order }) => ({
        ...order,
        units: items.reduce((sum, { quantity }) => sum + quantity, 0),
        warehouses: [...new Set(items.map(({ warehouse }) => warehouse.code))],
      })),
      alerts: alertPage.items,
      shipped: Array.from({ length: 7 }, (_, index) => {
        const day = dayKey(new Date(weekStart.getTime() + index * DAY));
        return { day, count: counts.get(day) ?? 0 };
      }),
    };
  }

  async profile(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: UserRole.WAREHOUSE_STAFF, isActive: true },
      select: profileSelect,
    });
    if (!user) throw new NotFoundException('Không tìm thấy hồ sơ nhân viên.');
    const warehouses = await this.prisma.warehouse.findMany({
      where: staffWarehouseWhere(userId),
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
    return { ...user, warehouses };
  }

  async updateProfile(userId: string, input: StaffProfileUpdate) {
    const changed = await this.prisma.user.updateMany({
      where: { id: userId, role: UserRole.WAREHOUSE_STAFF, isActive: true },
      data: {
        fullName: input.fullName,
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
      },
    });
    if (!changed.count)
      throw new NotFoundException('Không tìm thấy hồ sơ nhân viên.');
    return this.profile(userId);
  }
}
