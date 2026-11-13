import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { InventoryService } from '../../inventory/inventory.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminInventoryController } from './admin-inventory.controller';
import { AdminInventoryService } from './admin-inventory.service';

describe('AdminInventoryController (FR-INV-01)', () => {
  const actorId = '11111111-1111-4111-8111-111111111111';
  let controller: AdminInventoryController;

  const mockInventoryService = {
    findAll: jest.fn(),
    updateStock: jest.fn(),
  };

  const mockPrismaService = {
    warehouse: {
      findMany: jest.fn(),
    },
    inventory: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminInventoryController],
      providers: [
        AdminInventoryService,
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminInventoryController>(AdminInventoryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll delegates to InventoryService.findAll with role', async () => {
    mockInventoryService.findAll.mockResolvedValue({
      items: [{ id: '1', stock: 20, reservedStock: 2, availableStock: 18 }],
      total: 1,
      limit: 50,
      offset: 0,
    });

    const res = await controller.findAll(
      { page: 1, limit: 50, warehouseId: 'wh-1' },
      UserRole.WAREHOUSE_STAFF,
    );

    expect(mockInventoryService.findAll).toHaveBeenCalledWith(
      {
        warehouseId: 'wh-1',
        productId: undefined,
        lowStockOnly: false,
        limit: 50,
        offset: 0,
      },
      UserRole.WAREHOUSE_STAFF,
    );
    expect(res.total).toBe(1);
  });

  it('getSummary aggregates warehouse totals from DB read-only', async () => {
    mockPrismaService.warehouse.findMany.mockResolvedValue([
      {
        id: 'wh-1',
        code: 'WH-HCM',
        name: 'Kho HCM',
        region: 'SOUTH',
        defaultLowStockThreshold: 10,
      },
    ]);
    mockPrismaService.inventory.findMany.mockResolvedValue([
      {
        warehouseId: 'wh-1',
        productId: 'prod-1',
        stock: 30,
        reservedStock: 5,
        availableStock: 25,
        threshold: null,
      },
      {
        warehouseId: 'wh-1',
        productId: 'prod-2',
        stock: 5,
        reservedStock: 5,
        availableStock: 0,
        threshold: 10,
      },
    ]);

    const summary = await controller.getSummary();
    expect(summary.totalProducts).toBe(2);
    expect(summary.totalStock).toBe(35);
    expect(summary.totalReserved).toBe(10);
    expect(summary.totalAvailable).toBe(25);
    expect(summary.outOfStockCount).toBe(1);
    expect(summary.byWarehouse[0].code).toBe('WH-HCM');
  });

  it('adjustStock delegates to InventoryService.updateStock', async () => {
    mockInventoryService.updateStock.mockResolvedValue({
      id: '101',
      stock: 50,
      reservedStock: 2,
      availableStock: 48,
    });

    const res = await controller.adjustStock(
      '101',
      { stock: 50, threshold: 10, note: 'Kiểm kê cuối tháng' },
      actorId,
    );

    expect(mockInventoryService.updateStock).toHaveBeenCalledWith(
      '101',
      { stock: 50, threshold: 10, note: 'Kiểm kê cuối tháng' },
      actorId,
    );
    expect(res.stock).toBe(50);
  });

  it('adjustStock throws BadRequestException when neither stock nor threshold provided', async () => {
    await expect(
      controller.adjustStock('101', { note: 'No changes' }, actorId),
    ).rejects.toThrow(BadRequestException);
  });
});
