import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function staffWarehouseWhere(
  userId?: string,
): Prisma.WarehouseWhereInput {
  return userId
    ? { isActive: true, staffAssignments: { some: { userId } } }
    : {};
}

export function staffOrderWhere(
  userId?: string,
  warehouseId?: string,
): Prisma.OrderWhereInput {
  if (!userId) return warehouseId ? { items: { some: { warehouseId } } } : {};
  return {
    items: {
      some: warehouseId ? { warehouseId } : {},
      every: { warehouse: staffWarehouseWhere(userId) },
    },
  };
}

export function staffReadableOrderWhere(
  userId: string,
): Prisma.OrderWhereInput {
  return {
    OR: [
      { shippingWarehouseId: null },
      { shippingWarehouse: { is: staffWarehouseWhere(userId) } },
    ],
  };
}

// The calling queries alias the warehouse as w.
export function staffWarehouseSql(userId?: string): Prisma.Sql {
  if (!userId) return Prisma.empty;
  return Prisma.sql`
    AND w."is_active"
    AND EXISTS (
      SELECT 1 FROM "warehouse_staff_assignments" a
       WHERE a."warehouse_id" = w."id" AND a."user_id" = ${userId}::uuid
    )
  `;
}

export async function assertAssignedWarehouses(
  tx: Prisma.TransactionClient,
  staffId: string,
  warehouseIds: string[],
) {
  const ids = [...new Set(warehouseIds)];
  if (!ids.length) throw new NotFoundException('Không có kho xuất hàng.');
  const allowed = await tx.$queryRaw<Array<{ warehouseId: string }>>`
    SELECT a."warehouse_id" AS "warehouseId"
      FROM "warehouse_staff_assignments" a
      JOIN "warehouses" w ON w."id" = a."warehouse_id"
     WHERE a."user_id" = ${staffId}::uuid
       AND a."warehouse_id" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
       AND w."is_active"
     ORDER BY a."warehouse_id"
     FOR SHARE OF a
  `;
  if (allowed.length !== ids.length) {
    throw new NotFoundException('Không tìm thấy dữ liệu trong kho được giao.');
  }
}
