import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../shared/lib/liveOrders.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}});
function adapter(request){const exports={}; new Function('exports','require',outputText)(exports,()=>({authenticatedRequest:request})); return exports;}
const shipping={shippingRecipient:' Demo ',shippingPhone:'0900000000',shippingAddress:' Demo St ',shippingRegion:' '};
test('order body excludes client prices and user IDs',async()=>{
  const api=adapter(async(path,data)=>({path,data}));
  assert.deepEqual(await api.createOrder([{productId:'p',quantity:2,price:1,userId:'spoofed'}],shipping),{path:'/orders',data:{items:[{productId:'p',quantity:2}],shippingRecipient:'Demo',shippingPhone:'0900000000',shippingAddress:'Demo St'}});
});
test('stock conflict propagates without another order request',async()=>{
  let calls=0;const error=Object.assign(new Error('INSUFFICIENT_STOCK'),{status:409});
  const api=adapter(async()=>{calls++;throw error});
  await assert.rejects(api.createOrder([{productId:'p',quantity:3}],shipping),e=>e===error);
  assert.equal(calls,1);
});
test('VietQR checkout sends a stable checkout ID and omits payment amounts', async () => {
  const api = adapter(async (path, data) => ({ path, data }));
  const checkout = { id: randomUUID(), method: 'BANK_TRANSFER' };
  const items = [{ productId: 'p', quantity: 1, amount: 1 }];
  const request = await api.createOrder(items, shipping, checkout);
  assert.deepEqual(await api.createOrder(items, shipping, checkout), request);
  assert.equal(request.path, '/orders');
  assert.equal(request.data.paymentMethod, 'BANK_TRANSFER');
  assert.equal(request.data.checkoutId, checkout.id);
  assert.deepEqual(request.data.items, [{ productId: 'p', quantity: 1 }]);
  assert.ok(!('amount' in request.data));
  assert.equal((await api.readOrder('order-id')).path, '/orders/order-id');
});
test('live API: stock conflict, COD replay and order receipt', { skip: !process.env.P1_CHECKOUT_SMOKE }, async () => {
  const call=async(path,body,token)=>{
    const res=await fetch('http://127.0.0.1:5301'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token&&{Authorization:'Bearer '+token})},...(body&&{body:JSON.stringify(body)})});
    const data=await res.json();if(!res.ok)throw Object.assign(new Error(JSON.stringify(data)),{status:res.status});return data;
  };
  const login=await call('/auth/login',{username:'checkoutdemo',password:'Demo1234'});
  const api=adapter((path,body)=>call(path,body,login.tokens.accessToken));
  const p=(await call('/products')).items.find(i=>i.sku==='DEMO');assert.equal(p.availableStock,2);
  const checkout = { id: randomUUID(), method: 'COD' };
  await assert.rejects(api.createOrder([{ productId: p.id, quantity: 3 }], shipping, checkout), e => e.status === 409);
  const items = [{ productId: p.id, quantity: 1 }];
  const o = await api.createOrder(items, shipping, checkout);
  assert.equal((await api.createOrder(items, shipping, checkout)).id, o.id);
  const receipt = await api.readOrder(o.id);
  assert.equal(receipt.status, 'CONFIRMED');
  assert.equal(receipt.payment.method, 'COD');
  assert.equal(receipt.payment.status, 'PENDING');
  assert.deepEqual(receipt.statusHistory.map(h => h.toStatus), ['CONFIRMED']);
  assert.equal((await call('/products/' + p.id)).availableStock, 1);
});
