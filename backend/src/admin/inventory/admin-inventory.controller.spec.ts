import { Test, TestingModule } from '@nestjs/testing';
import { AdminInventoryController } from './admin-inventory.controller';
import { AdminInventoryService } from './admin-inventory.service';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { Reflector } from '@nestjs/core';
import { ConflictException, UnprocessableEntityException, NotFoundException } from '@nestjs/common';

describe('AdminInventoryController', () => {
  let controller: AdminInventoryController;
  let service: AdminInventoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminInventoryController],
      providers: [AdminInventoryService, AdminRolesGuard, Reflector],
    }).compile();

    controller = module.get<AdminInventoryController>(AdminInventoryController);
    service = module.get<AdminInventoryService>(AdminInventoryService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated inventory items', () => {
      const result = controller.findAll({ page: 1, limit: 10 });
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
      expect(result.items.length).toBeLessThanOrEqual(10);
      expect(result.page).toBe(1);
    });

    it('should filter items by category', () => {
      const result = controller.findAll({ category: 'Điện tử' });
      expect(result.items.every((i) => i.category === 'Điện tử')).toBe(true);
    });

    it('should filter items by search term', () => {
      const result = controller.findAll({ search: 'SKU-001' });
      expect(result.items.some((i) => i.sku === 'SKU-001')).toBe(true);
    });
  });

  describe('getSummary', () => {
    it('should return KPIs and warehouse distribution', () => {
      const summary = controller.getSummary();
      expect(summary).toHaveProperty('kpis');
      expect(summary).toHaveProperty('warehouseDistribution');
      expect(summary.kpis.totalProducts).toBeGreaterThan(0);
      expect(summary.warehouseDistribution.length).toBe(3);
    });
  });

  describe('adjustStock', () => {
    it('should adjust stock successfully when version matches', () => {
      const list = controller.findAll({ page: 1, limit: 5 });
      const firstItem = list.items[0];
      const whKey = Object.keys(firstItem.warehouses)[0];
      const whDetail = firstItem.warehouses[whKey];

      const initialVersion = whDetail.version;
      const req = { user: { id: 'admin-1', role: 'ADMIN', email: 'admin@test.com' } };

      const res = controller.adjustStock(
        whDetail.inventoryId,
        {
          newStock: 50,
          expectedVersion: initialVersion,
          note: 'Điều chỉnh kiểm kê định kỳ',
        },
        req
      );

      expect(res.success).toBe(true);
      expect(res.data.stock).toBe(50);
      expect(res.data.version).toBe(initialVersion + 1);
    });

    it('should throw ConflictException (409) when version does not match', () => {
      const list = controller.findAll({ page: 1, limit: 5 });
      const firstItem = list.items[0];
      const whKey = Object.keys(firstItem.warehouses)[0];
      const whDetail = firstItem.warehouses[whKey];

      const req = { user: { id: 'admin-1', role: 'ADMIN', email: 'admin@test.com' } };

      expect(() => {
        controller.adjustStock(
          whDetail.inventoryId,
          {
            newStock: 60,
            expectedVersion: 9999, // Stale version!
            note: 'Cố tình gửi version cũ',
          },
          req
        );
      }).toThrow(ConflictException);
    });

    it('should throw UnprocessableEntityException (422) when newStock < reservedStock', () => {
      const list = controller.findAll({ page: 1, limit: 5 });
      const targetItem = list.items.find((i) => i.totalReserved > 0) || list.items[1];
      const whKey = Object.keys(targetItem.warehouses)[0];
      const whDetail = targetItem.warehouses[whKey];

      // Đảm bảo reserved > 0
      whDetail.reservedStock = 10;

      const req = { user: { id: 'admin-1', role: 'ADMIN', email: 'admin@test.com' } };

      expect(() => {
        controller.adjustStock(
          whDetail.inventoryId,
          {
            newStock: 5, // < reserved 10
            expectedVersion: whDetail.version,
            note: 'Số lượng mới nhỏ hơn reserved',
          },
          req
        );
      }).toThrow(UnprocessableEntityException);
    });

    it('should throw NotFoundException (404) when inventory ID does not exist', () => {
      const req = { user: { id: 'admin-1', role: 'ADMIN', email: 'admin@test.com' } };

      expect(() => {
        controller.adjustStock(
          'non-existent-id',
          {
            newStock: 10,
            expectedVersion: 1,
            note: 'Điều chỉnh id không có',
          },
          req
        );
      }).toThrow(NotFoundException);
    });
  });
});
