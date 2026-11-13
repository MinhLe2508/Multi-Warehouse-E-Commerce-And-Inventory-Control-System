import test from 'node:test';
import assert from 'node:assert/strict';
import { cartAmount, cartHasProblem, changeQuantity, decimalPrice, reconcileCart, restoreCart, toCartItem } from '../shared/lib/cartModel.ts';
const product = (extra = {}) => ({ id: 'p1', name: 'Rice', image: '/product-placeholder.svg', price: 100, basePrice: '100.00', category: 'c1', description: '', stockByWarehouse: [{warehouseId: 'w1', warehouseName: 'One', quantity: 10}], ...extra });
const item = (quantity = 2) => toCartItem(product(), quantity);
test('restore rejects invalid persisted values and marks valid snapshots unchecked', () => {
  const values = [null, {...item(), quantity: -1}, {...item(), quantity: 1.5}, {...item(), quantity: Infinity}, {...item(), price: -1}, {...item(), unitPrice: '1e5'}, item()];
  const rows = restoreCart({items: values});
  assert.equal(rows.length, 1); assert.equal(rows[0].quantity, 2); assert.equal(rows[0].catalogStatus, 'unchecked'); assert.equal(cartHasProblem(rows), true);
});
test('restore merges duplicate IDs without silently reducing stale quantities', () => {
  const [row] = restoreCart({items: [item(7), item(8)]});
  assert.equal(row.quantity, 15); assert.equal(row.maxStock, 10);
});
test('decimal subtotal is exact and preserves cents', () => {
  assert.equal(cartAmount([{...item(3), unitPrice:'0.10'}, {...item(1), unitPrice:'0.20'}]), '0.50');
  assert.equal(cartAmount([{...item(100), unitPrice:'999999999999.99'}]), '99999999999999.00');
  assert.equal(decimalPrice('00012.3'), '12.30'); assert.equal(decimalPrice('-1'), null);
});
test('refresh uses latest catalog but retains quantity chosen while request was in flight', () => {
  const [row] = reconcileCart([item(6)], [{id:'p1', kind:'available', product:product({basePrice:'120.25',price:120.25, stockByWarehouse:[{quantity:3}]})}]);
  assert.equal(row.quantity, 6); assert.equal(row.maxStock, 3); assert.equal(row.unitPrice, '120.25'); assert.equal(row.priceChanged, true); assert.equal(cartHasProblem([row]), true);
});
test('refresh cannot resurrect removed or cleared rows', () => {
  assert.deepEqual(reconcileCart([], [{id:'p1',kind:'available',product:product()}]), []);
});
test('404 marks unavailable, while network failure preserves the snapshot', () => {
  const [missing] = reconcileCart([item()], [{id:'p1',kind:'unavailable'}]);
  assert.equal(missing.maxStock, 0); assert.equal(missing.quantity, 2); assert.equal(cartHasProblem([missing]),true);
  const [failed] = reconcileCart([item()], [{id:'p1',kind:'error'}]);
  assert.equal(failed.maxStock, 10); assert.equal(failed.price, 100); assert.equal(cartHasProblem([failed]),true);
});
test('quantity cannot increase beyond stock and rejects decimals/NaN/infinity/zero', () => {
  for(const quantity of [11, 2.5, NaN, Infinity, 0, -1]) assert.deepEqual(changeQuantity(item(),quantity),item());
  assert.equal(changeQuantity(item(),10).quantity,10);
});
test('users can reduce stale quantity, and errors prevent increases', () => {
  const stale = {...item(8),maxStock:3};
  assert.equal(changeQuantity(stale,7).quantity,7);
  assert.equal(changeQuantity(stale,3).quantity,3);
  const failed = {...item(),catalogStatus:'error'};
  assert.equal(changeQuantity(failed,3).quantity,2); assert.equal(changeQuantity(failed,1).quantity,1);
});
test('successful retry restores availability and zero stock blocks checkout', () => {
  const [row] = reconcileCart([{...item(),catalogStatus:'error'}], [{id:'p1',kind:'available',product:product()}]);
  assert.equal(cartHasProblem([row]),false);
  assert.equal(cartHasProblem([{...row,maxStock:0}]),true);
});
