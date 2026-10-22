import { Injectable } from '@nestjs/common';
import { InventoryStockPort } from './inventory-stock.port';
import { readSqlError } from './pg-error.util';
import {
  InsufficientStockException,
  InventoryNotFoundException,
} from './stock-reservation.errors';
import type {
  ReserveStockInput,
  SettleStockInput,
  TransactionClient,
} from './stock-reservation.types';

interface InventoryLevels {
  stock: number;
  reserved_stock: number;
}

/**
  Bản triển khai InventoryStockPort bằng Prisma + SQL (mặc định của Tuần 3).

  - Giữ chỗ gọi đúng hàm fn_reserve_stock() của Khang (không viết thêm thuật toán
    giữ chỗ bằng TypeScript chạy song song với SQL).
  - TẠM THỜI chứa phần ghi tồn kho và audit cho commit/release/expire, vì
    InventoryService (STT 13) chưa có trong source. Khi InventoryService xong, chuyển
    phần này sang đó (đổi provider trong StockReservationModule).
 */
@Injectable()
export class PrismaInventoryStockAdapter extends InventoryStockPort {
  async reserve(
    tx: TransactionClient,
    input: ReserveStockInput,
  ): Promise<bigint> {
    const { inventoryId, orderId, quantity, ttlMinutes, actorId } = input;

    let reservationId: bigint;
    try {
      const rows = await tx.$queryRaw<Array<{ id: bigint }>>`
        SELECT fn_reserve_stock(
          ${inventoryId}::bigint,
          ${orderId}::uuid,
          ${quantity}::integer,
          ${ttlMinutes}::integer
        ) AS id`;
      reservationId = rows[0].id;
    } catch (error) {
      throw this.mapReserveError(error, inventoryId);
    }

    // Dòng inventory đang bị KHÓA bởi chính transaction này (do fn_reserve_stock), nên
    // đọc lại ở đây là nhất quán: reservedBefore = reservedAfter - quantity.
    const levels = await this.readLevels(tx, inventoryId);
    await tx.inventoryAuditLog.create({
      data: {
        inventoryId,
        reason: 'RESERVE',
        stockBefore: levels.stock,
        stockAfter: levels.stock,
        reservedBefore: levels.reserved_stock - quantity,
        reservedAfter: levels.reserved_stock,
        quantityDelta: 0, // D09: chỉ ghi thay đổi stock thực
        referenceType: 'ORDER',
        referenceId: orderId,
        actorId,
      },
    });

    return reservationId;
  }

  async lockInventories(
    tx: TransactionClient,
    inventoryIds: bigint[],
  ): Promise<void> {
    if (inventoryIds.length === 0) return;
    // LockRows nằm trên Sort nên khóa được lấy theo đúng thứ tự id tăng dần.
    await tx.$queryRaw`
      SELECT id FROM inventory
       WHERE id = ANY(${inventoryIds}::bigint[])
       ORDER BY id
         FOR UPDATE`;
  }

  async settle(tx: TransactionClient, input: SettleStockInput): Promise<void> {
    const { orderId, actorId, reason } = input;
    const ordered = [...input.changes].sort((a, b) =>
      a.inventoryId < b.inventoryId
        ? -1
        : a.inventoryId > b.inventoryId
          ? 1
          : 0,
    );

    for (const { inventoryId, quantity } of ordered) {
      const stockDelta = reason === 'COMMIT' ? quantity : 0;

      // stock và reserved_stock đổi trong CÙNG MỘT câu UPDATE để không vi phạm
      // CHECK reserved_stock <= stock ở trạng thái trung gian.
      const rows = await tx.$queryRaw<InventoryLevels[]>`
        UPDATE inventory
           SET stock = stock - ${stockDelta}::integer,
               reserved_stock = reserved_stock - ${quantity}::integer
         WHERE id = ${inventoryId}::bigint
        RETURNING stock, reserved_stock`;
      if (rows.length === 0) throw new InventoryNotFoundException(inventoryId);

      const after = rows[0];
      await tx.inventoryAuditLog.create({
        data: {
          inventoryId,
          reason,
          stockBefore: after.stock + stockDelta,
          stockAfter: after.stock,
          reservedBefore: after.reserved_stock + quantity,
          reservedAfter: after.reserved_stock,
          quantityDelta: -stockDelta, // = stockAfter - stockBefore
          referenceType: 'ORDER',
          referenceId: orderId,
          actorId,
        },
      });
    }
  }

  private async readLevels(
    tx: TransactionClient,
    inventoryId: bigint,
  ): Promise<InventoryLevels> {
    const rows = await tx.$queryRaw<InventoryLevels[]>`
      SELECT stock, reserved_stock FROM inventory WHERE id = ${inventoryId}::bigint`;
    if (rows.length === 0) throw new InventoryNotFoundException(inventoryId);
    return rows[0];
  }

  // Chỉ ánh xạ 2 lỗi nghiệp vụ mà hàm SQL chủ động raise. Mọi lỗi khác (kể cả 23514
  // thuộc CHECK/trigger khác) giữ nguyên để thành 500, KHÔNG gộp chung thành "thiếu hàng".
  private mapReserveError(error: unknown, inventoryId: bigint): unknown {
    const { sqlState, message } = readSqlError(error);
    if (sqlState === 'P0002' && message?.includes('INVENTORY_NOT_FOUND')) {
      return new InventoryNotFoundException(inventoryId);
    }
    if (sqlState === '23514' && message?.startsWith('INSUFFICIENT_STOCK')) {
      return new InsufficientStockException(inventoryId);
    }
    return error;
  }
}
