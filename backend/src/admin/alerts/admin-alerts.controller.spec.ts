import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AlertStatus, UserRole } from '@prisma/client';
import { ROLES_KEY } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { PasswordChangedGuard } from '../../core/guards/password-changed.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import type { StockAlertView } from '../../inventory/inventory.service';
import { AdminAlertsController } from './admin-alerts.controller';
import { QueryAdminAlertsDto } from './dto/query-admin-alerts.dto';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const STAFF_ID = '22222222-2222-4222-8222-222222222222';
const WAREHOUSE_UUID = '33333333-3333-4333-8333-333333333333';

function createNestedAlertView(): StockAlertView {
  return {
    id: '15',
    inventoryId: '101',
    alertLevel: 'CRITICAL',
    status: 'OPEN',
    stockAtTrigger: 0,
    availableAtTrigger: 0,
    thresholdAtTrigger: 10,
    triggeredAt: new Date('2026-11-10T08:00:00.000Z'),
    resolvedAt: null,
    resolvedBy: null,
    currentStock: 0,
    currentAvailable: 0,
    product: {
      id: '44444444-4444-4444-8444-444444444444',
      sku: 'SKU-LAPTOP-01',
      name: 'Laptop Dell XPS 15',
    },
    warehouse: {
      id: WAREHOUSE_UUID,
      code: 'WH-HN01',
      name: 'Kho Trung Tâm Hà Nội',
    },
  };
}

describe('AdminAlertsController (F205, F206, F207)', () => {
  let controller: AdminAlertsController;
  let inventoryService: { findAlerts: jest.Mock };
  let changes: { publishInventory: jest.Mock };
  let txStockAlert: {
    updateMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  let prisma: {
    stockAlert: typeof txStockAlert;
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    inventoryService = {
      findAlerts: jest.fn().mockResolvedValue({
        items: [createNestedAlertView()],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    };

    txStockAlert = {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    };

    prisma = {
      stockAlert: txStockAlert,
      $transaction: jest.fn((cb: (tx: typeof prisma) => unknown) => cb(prisma)),
    };
    changes = { publishInventory: jest.fn().mockResolvedValue(undefined) };

    controller = new AdminAlertsController(
      inventoryService as never,
      prisma as never,
      changes as never,
    );
  });

  it('áp dụng đúng bộ Guards (JwtAuthGuard, PasswordChangedGuard, RolesGuard) và chỉ cho phép ADMIN / WAREHOUSE_STAFF', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AdminAlertsController,
    ) as unknown[];
    expect(guards).toEqual([JwtAuthGuard, PasswordChangedGuard, RolesGuard]);

    const roles = Reflect.getMetadata(
      ROLES_KEY,
      AdminAlertsController,
    ) as UserRole[];
    expect(roles).toEqual([UserRole.ADMIN, UserRole.WAREHOUSE_STAFF]);
  });

  it('findAll chuẩn hóa StockAlertView dạng nested từ InventoryService sang cả trường phẳng (productSku, productName, warehouseCode...) cho Frontend', async () => {
    const res = await controller.findAll(
      {
        status: 'OPEN',
        alertLevel: 'WARNING',
        warehouseId: WAREHOUSE_UUID,
        limit: 20,
        offset: 0,
      },
      UserRole.ADMIN,
    );

    expect(inventoryService.findAlerts).toHaveBeenCalledWith(
      {
        status: 'OPEN',
        alertLevel: 'WARNING',
        warehouseId: WAREHOUSE_UUID,
        limit: 20,
        offset: 0,
      },
      UserRole.ADMIN,
    );
    expect(res.items).toHaveLength(1);
    const first = res.items[0];
    // Kiểm tra các trường phẳng mà Frontend useStockAlerts.ts đọc trực tiếp
    expect(first.productId).toBe('44444444-4444-4444-8444-444444444444');
    expect(first.productSku).toBe('SKU-LAPTOP-01');
    expect(first.productName).toBe('Laptop Dell XPS 15');
    expect(first.warehouseId).toBe(WAREHOUSE_UUID);
    expect(first.warehouseCode).toBe('WH-HN01');
    expect(first.warehouseName).toBe('Kho Trung Tâm Hà Nội');
    expect(first.triggeredAt).toBe('2026-11-10T08:00:00.000Z');
    // Giữ nguyên cả đối tượng lồng nhau
    expect(first.product.sku).toBe('SKU-LAPTOP-01');
    expect(first.warehouse.code).toBe('WH-HN01');
  });

  it('findAll từ chối các tham số query không hợp lệ (status sai, warehouseId không phải UUID, limit/offset NaN hoặc ngoài khoảng)', async () => {
    await expect(
      controller.findAll(
        { status: 'INVALID' as never } as QueryAdminAlertsDto,
        UserRole.ADMIN,
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      controller.findAll(
        { warehouseId: 'not-a-uuid' } as QueryAdminAlertsDto,
        UserRole.ADMIN,
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      controller.findAll(
        { limit: 'abc' as never } as QueryAdminAlertsDto,
        UserRole.ADMIN,
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      controller.findAll({ limit: 0 } as QueryAdminAlertsDto, UserRole.ADMIN),
    ).rejects.toThrow(BadRequestException);

    await expect(
      controller.findAll({ limit: 101 } as QueryAdminAlertsDto, UserRole.ADMIN),
    ).rejects.toThrow(BadRequestException);

    await expect(
      controller.findAll({ offset: -1 } as QueryAdminAlertsDto, UserRole.ADMIN),
    ).rejects.toThrow(BadRequestException);

    expect(inventoryService.findAlerts).not.toHaveBeenCalled();
  });

  it('resolveAlert từ chối ID cảnh báo không hợp lệ với 400 BadRequestException', async () => {
    await expect(controller.resolveAlert('0', ADMIN_ID)).rejects.toThrow(
      BadRequestException,
    );
    await expect(controller.resolveAlert('-5', ADMIN_ID)).rejects.toThrow(
      BadRequestException,
    );
    await expect(controller.resolveAlert('abc', ADMIN_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('resolveAlert ném 404 NotFoundException khi cảnh báo không tồn tại', async () => {
    txStockAlert.updateMany.mockResolvedValue({ count: 0 });
    txStockAlert.findUnique.mockResolvedValue(null);

    await expect(controller.resolveAlert('999', ADMIN_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('resolveAlert chuyển trạng thái OPEN -> RESOLVED ở lần gọi đầu tiên và KHÔNG ghi đè resolvedAt/resolvedBy khi gọi lặp hoặc đồng thời (idempotent)', async () => {
    const firstResolvedAt = new Date('2026-11-12T10:00:00.000Z');

    // Lần 1: cảnh báo đang OPEN -> updateMany khớp 1 dòng
    txStockAlert.updateMany.mockResolvedValueOnce({ count: 1 });
    txStockAlert.findUnique.mockResolvedValueOnce({
      id: BigInt(15),
      inventoryId: 8n,
      status: AlertStatus.RESOLVED,
      resolvedAt: firstResolvedAt,
      resolvedBy: ADMIN_ID,
    });

    const firstCall = await controller.resolveAlert('15', ADMIN_ID);
    expect(txStockAlert.updateMany).toHaveBeenCalledWith({
      where: { id: BigInt(15), status: AlertStatus.OPEN },
      data: expect.objectContaining({
        status: AlertStatus.RESOLVED,
        resolvedBy: ADMIN_ID,
      }),
    });
    expect(firstCall).toEqual({
      id: '15',
      status: AlertStatus.RESOLVED,
      resolvedAt: firstResolvedAt,
      resolvedBy: ADMIN_ID,
      alreadyResolved: false,
    });

    // Lần 2 (retry hoặc nhân viên khác bấm trùng): trạng thái đã là RESOLVED -> updateMany khớp 0 dòng, giữ nguyên resolvedAt và resolvedBy cũ
    txStockAlert.updateMany.mockResolvedValueOnce({ count: 0 });
    txStockAlert.findUnique.mockResolvedValueOnce({
      id: BigInt(15),
      inventoryId: 8n,
      status: AlertStatus.RESOLVED,
      resolvedAt: firstResolvedAt,
      resolvedBy: ADMIN_ID,
    });

    const secondCall = await controller.resolveAlert('15', STAFF_ID);
    expect(secondCall).toEqual({
      id: '15',
      status: AlertStatus.RESOLVED,
      resolvedAt: firstResolvedAt,
      resolvedBy: ADMIN_ID,
      alreadyResolved: true,
    });
    expect(txStockAlert.update).not.toHaveBeenCalled();
    expect(changes.publishInventory).toHaveBeenCalledTimes(1);
    expect(changes.publishInventory).toHaveBeenCalledWith([8n]);
  });
});
