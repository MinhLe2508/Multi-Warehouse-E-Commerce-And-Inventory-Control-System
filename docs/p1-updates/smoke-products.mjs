// Run only against a LOCAL development backend using the team's migrated/seeded DB.
// Creates one unique product, checks authorization, then deletes ONLY that product.
import assert from 'node:assert/strict';
const base = (process.env.P1_API_URL || 'http://localhost:3001').replace(/\/$/, '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) throw Error('This smoke script only accepts a local backend.');
async function call(path, { method = 'GET', body, token, status = 200 } = {}) {
  const response = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  const data = response.status === 204 ? null : await response.json();
  assert.equal(response.status, status, `${method} ${path}: expected ${status}, got ${response.status}`);
  return data;
}
let admin;
let staff;
let productId;
try {
  admin = await call('/auth/login', { method: 'POST', body: { username: process.env.P1_ADMIN_USER || 'admin', password: process.env.P1_ADMIN_PASSWORD || 'admin' } });
  staff = await call('/auth/login', { method: 'POST', body: { username: process.env.P1_STAFF_USER || 'staff', password: process.env.P1_STAFF_PASSWORD || 'staff' } });
  assert.equal(admin.user.role, 'ADMIN'); assert.equal(staff.user.role, 'WAREHOUSE_STAFF');
  const a = admin.tokens.accessToken, s = staff.tokens.accessToken;
  const categories = await call('/products/categories');
  assert.ok(categories.length, 'No active categories. Run the official seed on a dedicated local demo DB first.');
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const input = { sku: `P1-TEST-${suffix}`, slug: `p1-test-${suffix}`, name: 'San pham kiem thu P1', basePrice: '199000.00', costPrice: '100000.00', categoryId: categories[0].id };
  await call('/admin/products', { status: 401 });
  await call('/admin/products', { method: 'POST', body: input, token: s, status: 403 });
  const created = await call('/admin/products', { method: 'POST', body: input, token: a, status: 201 });
  productId = created.id; assert.ok(productId);
  assert.equal(Number(created.costPrice), 100000);
  await call('/admin/products', { method: 'POST', body: input, token: a, status: 409 });
  for (const path of [`/products/${productId}`, `/products?search=${input.sku}`, `/admin/products/${productId}`, `/admin/products?search=${input.sku}`]) {
    const result = await call(path, { token: path.startsWith('/admin') ? s : undefined });
    assert.ok(!JSON.stringify(result).includes('costPrice'), `${path} leaked costPrice`);
  }
  await call(`/admin/products/${productId}`, { method: 'PATCH', body: { name: 'Forbidden' }, token: s, status: 403 });
  await call(`/admin/products/${productId}`, { method: 'DELETE', token: s, status: 403 });
  await call(`/admin/products/${productId}`, { method: 'PATCH', body: { basePrice: '-1' }, token: a, status: 400 });
  await call(`/admin/products/${productId}`, { method: 'PATCH', body: { isActive: false }, token: a });
  await call(`/products/${productId}`, { status: 404 });
  await call(`/admin/products/${productId}`, { token: s });
  await call(`/admin/products/${productId}`, { method: 'DELETE', token: a, status: 204 });
  productId = undefined;
  console.log('PASS: real login, category, create/update/delete, duplicate 409, staff 403, public/staff price privacy, inactive product 404.');
} finally {
  if (productId && admin) {
    try { await call(`/admin/products/${productId}`, { method: 'DELETE', token: admin.tokens.accessToken, status: 204 }); }
    catch { console.error(`Cleanup failed. Review only the test product ID: ${productId}`); process.exitCode = 1; }
  }
  for (const session of [admin, staff]) if (session) {
    try { await call('/auth/logout', { method: 'POST', token: session.tokens.accessToken, body: { refreshToken: session.tokens.refreshToken }, status: 204 }); }
    catch { console.error('Could not revoke a smoke-test session.'); process.exitCode = 1; }
  }
}
