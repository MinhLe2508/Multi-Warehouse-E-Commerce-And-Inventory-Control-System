const { setTimeout: delay } = require('node:timers/promises');

async function createDemo(origin) {
  const url = new URL(origin);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Hãy dùng địa chỉ API cục bộ, ví dụ http://127.0.0.1:3001.');
  }
  async function request(path, { method = 'GET', session, body } = {}) {
    const response = await fetch(url.origin + path, {
      method,
      headers: {
        ...(session && { Authorization: 'Bearer ' + session.tokens.accessToken }),
        ...(body && { 'Content-Type': 'application/json' }),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`${method} ${path} trả HTTP ${response.status}`);
    return response.json();
  }
  async function login(username) {
    const session = await request('/auth/login', {
      method: 'POST', body: { username, password: username },
    });
    if (session.user.email !== `${username}@gmail.com`) {
      throw new Error('Lệnh này dùng tài khoản từ bộ seed demo của dự án.');
    }
    return session;
  }
  const [admin, customer, staff] = await Promise.all(['admin', 'customer', 'staff'].map(login));
  const warehouses = await request('/warehouses', { session: staff });
  const warehouse = warehouses.find((row) => row.code === 'WH-HN01') ?? warehouses[0];
  if (!warehouse) throw new Error('Hãy phân ít nhất một kho cho tài khoản staff demo.');
  const catalog = await request('/products?search=ACC-GAN-65W');
  const product = catalog.items.find((row) =>
    row.stockByWarehouse.some((stock) => stock.warehouseId === warehouse.id && stock.quantity >= 6));
  if (!product) throw new Error('Kho được giao cần một sản phẩm có đủ tồn để tạo đơn mẫu.');
  const { bankTransfer } = await request('/payments/methods');

  const orders = [];
  for (const [label, action, quantity] of [
    ['Chờ xuất kho', 'CONFIRMED', 2],
    ['Đã bàn giao', 'SHIPPING', 1],
    ['Chờ thanh toán', 'PENDING_PAYMENT', 1],
  ]) {
    if (action === 'PENDING_PAYMENT' && !bankTransfer) {
      console.log('Bỏ qua đơn chờ thanh toán vì cửa hàng chưa bật VietQR.');
      continue;
    }
    const shippingRecipient = `Đơn mẫu MWH · ${label}`;
    const existing = await request('/admin/orders?' + new URLSearchParams({ q: shippingRecipient }), { session: staff });
    let order = existing.items.find((row) => {
      if (row.shippingRecipient !== shippingRecipient || row.status === 'CANCELLED') return false;
      return action === 'PENDING_PAYMENT'
        ? row.status === 'PENDING_PAYMENT' && Date.parse(row.reservationExpiresAt) > Date.now()
        : row.status !== 'PENDING_PAYMENT';
    });
    if (!order) {
      order = await request('/orders', {
        method: 'POST', session: customer,
        body: {
          items: [{ productId: product.id, quantity }],
          shippingRecipient, shippingPhone: '0900000000',
          shippingAddress: 'Địa chỉ mô phỏng · ' + warehouse.name,
          shippingRegion: warehouse.region,
          paymentMethod: action === 'PENDING_PAYMENT' ? 'BANK_TRANSFER' : 'COD',
        },
      });
    }
    if (action === 'SHIPPING' && order.status === 'CONFIRMED') {
      order = await request('/admin/orders/' + order.id + '/status', {
        method: 'PATCH', session: admin,
        body: { targetStatus: 'SHIPPING', note: 'Bàn giao trong dữ liệu mẫu' },
      });
    }
    orders.push({ id: order.id, orderCode: order.orderCode, status: order.status });
    await delay(50);
  }
  return orders;
}

if (require.main === module) {
  const origin = process.argv[2];
  if (!origin || process.argv.length !== 3) {
    console.error('Dùng: node scripts/demo-staff.cjs http://127.0.0.1:<cổng backend>');
    process.exitCode = 1;
  } else {
    createDemo(origin).then((orders) => console.table(orders.map(({ orderCode, status }) => ({ orderCode, status })))).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}

module.exports = { createDemo };
