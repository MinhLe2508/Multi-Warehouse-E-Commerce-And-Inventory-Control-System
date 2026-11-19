import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(
  new URL('../shared/lib/adminProductsApi.ts', import.meta.url),
  'utf8',
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});
function load(client) {
  const exports = {};
  new Function('exports', 'require', outputText)(exports, (path) => {
    assert.equal(path, './apiClient');
    return client;
  });
  return exports;
}
const categoryId = '11111111-1111-4111-8111-111111111111';

test('product list sends the category UUID, text and pagination to the backend', async () => {
  const api = load({
    apiGet: (path) => {
      const url = new URL(path, 'http://localhost');
      assert.equal(url.pathname, '/admin/products');
      assert.equal(url.searchParams.get('category'), categoryId);
      assert.equal(url.searchParams.get('search'), 'SKU-01');
      assert.equal(url.searchParams.get('page'), '2');
      assert.equal(url.searchParams.get('pageSize'), '12');
      return { items: [], total: 14, page: 2, pageSize: 12, totalPages: 2 };
    },
  });
  const result = await api.listManagedProducts({
    search: ' SKU-01 ',
    categoryId,
    page: 2,
    pageSize: 12,
  });
  assert.equal(result.total, 14);
});

test('product adapter rejects a response that is missing its pagination contract', async () => {
  const api = load({ apiGet: () => ({ items: [] }) });
  await assert.rejects(
    api.listManagedProducts({ page: 1, pageSize: 12 }),
    /danh sách sản phẩm không hợp lệ/,
  );
});

test('product updates use real write endpoints and preserve decimal strings and nullable fields', async () => {
  const calls = [];
  const product = {
    sku: 'SKU-TEST',
    name: 'Sản phẩm thử',
    slug: 'sku-test',
    basePrice: '2000.30',
    costPrice: '1000.10',
    discountPercent: '5.05',
    categoryId,
    description: 'Mô tả',
    imageUrl: null,
  };
  const api = load({
    apiPost: (path, body) => {
      calls.push({ method: 'POST', path, body });
    },
    apiPatch: (path, body) => {
      calls.push({ method: 'PATCH', path, body });
    },
    apiDelete: (path) => {
      calls.push({ method: 'DELETE', path });
    },
  });
  await api.createManagedProduct(product);
  await api.updateManagedProduct('id', { isActive: false, description: null });
  await api.deleteManagedProduct('id');
  assert.deepEqual(calls, [
    { method: 'POST', path: '/admin/products', body: product },
    {
      method: 'PATCH',
      path: '/admin/products/id',
      body: { isActive: false, description: null },
    },
    { method: 'DELETE', path: '/admin/products/id' },
  ]);
});
