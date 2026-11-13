import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAvailableStock,
  getEffectiveThreshold,
  isLowStock,
  determineProductStatus,
  removeVietnameseAccents,
  calculateAvailabilityRate,
  filterInventoryProducts,
} from '../shared/lib/inventoryStatus.ts';
import {
  adminInventoryData,
  adjustMockStock,
  getMockInventorySummary,
  resetMockInventory,
} from '../shared/mock/adminInventoryMock.ts';

test('1. calculateAvailableStock: matches Postgres generated column logic', () => {
  assert.equal(calculateAvailableStock(100, 20), 80);
  assert.equal(calculateAvailableStock(50, 50), 0);
  assert.equal(calculateAvailableStock(10, 25), 0); // GREATEST(0, stock - reserved)
  assert.equal(calculateAvailableStock(0, 0), 0);
});

test('2. getEffectiveThreshold: warehouse override vs product base threshold', () => {
  assert.equal(getEffectiveThreshold(15, null), 15);
  assert.equal(getEffectiveThreshold(15, undefined), 15);
  assert.equal(getEffectiveThreshold(20, 8), 8); // Warehouse override takes priority
  assert.equal(getEffectiveThreshold(0, null), 10); // Fallback to safe default 10
});

test('3. isLowStock: checks availableStock <= effectiveThreshold (FR-NOT-01)', () => {
  assert.equal(isLowStock(10, 10), true); // Boundary: available == threshold
  assert.equal(isLowStock(5, 10), true);  // Below threshold
  assert.equal(isLowStock(0, 10), true);
  assert.equal(isLowStock(11, 10), false); // Boundary: just above threshold
  assert.equal(isLowStock(50, 10), false);
});

test('4. determineProductStatus: strictly follows priority rules', () => {
  // 1. OUT_OF_STOCK takes highest priority
  assert.equal(determineProductStatus(0, false), 'OUT_OF_STOCK');
  assert.equal(determineProductStatus(0, true), 'OUT_OF_STOCK');

  // 2. LOW_STOCK if total > 0 but any warehouse is low
  assert.equal(determineProductStatus(50, true), 'LOW_STOCK');

  // 3. IN_STOCK only when total > 0 and no warehouse is low
  assert.equal(determineProductStatus(100, false), 'IN_STOCK');
});

test('5. calculateAvailabilityRate: zero-division safety', () => {
  assert.equal(calculateAvailabilityRate(0, 0), '—'); // Safe against NaN%
  assert.equal(calculateAvailabilityRate(50, 100), '50%');
  assert.equal(calculateAvailabilityRate(100, 100), '100%');
  assert.equal(calculateAvailabilityRate(0, 50), '0%');
});

test('6. removeVietnameseAccents: normalizes diacritics for search', () => {
  assert.equal(
    removeVietnameseAccents('Máy Đo Huyết Áp Đỏ'),
    'may do huyet ap do'
  );
  assert.equal(
    removeVietnameseAccents('Bàn Phím Cơ Không Dây RGB'),
    'ban phim co khong day rgb'
  );
});

test('7. filterInventoryProducts: filters accurately with 200 items', () => {
  // Reset mock data to clean state
  resetMockInventory();

  // Test search accent-insensitive
  const foundByName = filterInventoryProducts(adminInventoryData, { search: 'huyet ap' });
  assert.ok(foundByName.length >= 1);
  assert.equal(foundByName[0].sku, 'SKU-007-UNICODE');

  // Test search by SKU
  const foundBySku = filterInventoryProducts(adminInventoryData, { search: 'SKU-001' });
  assert.equal(foundBySku.length, 1);
  assert.equal(foundBySku[0].id, 'prod-001');

  // Test category filter
  const elecItems = filterInventoryProducts(adminInventoryData, { category: 'Điện tử' });
  assert.ok(elecItems.length > 0);
  assert.ok(elecItems.every((item) => item.category === 'Điện tử'));

  // Test status filter OUT_OF_STOCK
  const oosItems = filterInventoryProducts(adminInventoryData, { status: 'OUT_OF_STOCK' });
  assert.ok(oosItems.length >= 2);
  assert.ok(oosItems.every((item) => item.status === 'OUT_OF_STOCK'));

  // Test warehouse-specific status filter
  const dnLowItems = filterInventoryProducts(adminInventoryData, {
    warehouseId: 'wh-dn-01',
    status: 'LOW_STOCK',
  });
  assert.ok(dnLowItems.length >= 1);
  assert.ok(
    dnLowItems.some((item) => item.sku === 'SKU-003-LOW-ONE')
  );
});

test('8. adjustMockStock: enforces optimistic locking (version) & validation', () => {
  resetMockInventory();

  const prod = adminInventoryData[0]; // prod-001
  const targetWh = prod.warehouses['wh-hn-01'];
  const initialVersion = targetWh.version;

  // 1. Successful adjustment
  const updated = adjustMockStock({
    inventoryId: targetWh.inventoryId,
    newStock: 50,
    expectedVersion: initialVersion,
    note: 'Nhập hàng lô mới thành công từ nhà sản xuất',
  });
  assert.equal(updated.stock, 50);
  assert.equal(updated.availableStock, 50);
  assert.equal(updated.version, initialVersion + 1);

  // 2. Conflict (409) when version does not match
  assert.throws(
    () => {
      adjustMockStock({
        inventoryId: targetWh.inventoryId,
        newStock: 60,
        expectedVersion: initialVersion, // Stale version!
        note: 'Cố tình gửi version cũ để test 409 Conflict',
      });
    },
    (err) => err.status === 409
  );

  // 3. Validation: newStock cannot be less than reservedStock (422)
  const rsvProd = adminInventoryData[1]; // prod-002: reserved = 10
  const rsvWh = rsvProd.warehouses['wh-hn-01'];
  assert.throws(
    () => {
      adjustMockStock({
        inventoryId: rsvWh.inventoryId,
        newStock: 5, // < reserved 10
        expectedVersion: rsvWh.version,
        note: 'Điều chỉnh số lượng thấp hơn mức đã giữ chỗ',
      });
    },
    (err) => err.status === 422
  );

  // 4. Validation: note length
  assert.throws(() => {
    adjustMockStock({
      inventoryId: rsvWh.inventoryId,
      newStock: 20,
      expectedVersion: rsvWh.version,
      note: 'ngắn', // < 5 ký tự
    });
  });
});

test('9. getMockInventorySummary: computes summary KPIs and distribution', () => {
  resetMockInventory();
  const summary = getMockInventorySummary();

  assert.equal(summary.kpis.totalProducts, 200);
  assert.ok(summary.kpis.totalStock > 0);
  assert.ok(summary.kpis.lowStockCount > 0);
  assert.ok(summary.kpis.outOfStockCount > 0);
  assert.equal(summary.warehouseDistribution.length, 3);
  assert.ok(summary.topLowStockProducts.length > 0);
});
