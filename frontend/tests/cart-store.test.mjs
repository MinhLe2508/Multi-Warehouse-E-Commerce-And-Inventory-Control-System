import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
// Load the production store with only its HTTP boundary replaced. Zustand is real.
function compile(path, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
  }).outputText;
  const loaded = {exports:{}};
  new Function('require','module','exports',code)(name => dependencies[name] ?? require(name),loaded,loaded.exports);
  return loaded.exports;
}
class CatalogError extends Error { constructor(status) { super('Catalog error'); this.status=status; } }
const product = {id:'p1',name:'Rice',price:100,basePrice:'100.00',image:'/product-placeholder.svg',category:'c1',description:'',stockByWarehouse:[{quantity:5}]};
function setup(raw) {
  const disk = new Map(raw === undefined ? [] : [['multimart-api-cart',raw]]);
  let broken = false;
  globalThis.localStorage = {
    getItem:key=>disk.get(key)??null,
    setItem:(key,value)=>{ if(broken)throw Error('Quota exceeded'); disk.set(key,value); },
    removeItem:key=>disk.delete(key),
  };
  let fetcher = async()=>product;
  const api={MOCK_CATALOG:false,CatalogError,fetchProduct:(...args)=>fetcher(...args)};
  const model=compile('../shared/lib/cartModel.ts');
  const {useCartStore:store}=compile('../store/useCartStore.ts',{'@/shared/lib/cartModel':model,'@/shared/lib/catalogApi':api});
  return {store,disk,fetchWith:f=>{fetcher=f;},breakStorage:()=>{broken=true;}};
}
const refresh=store=>store.getState().refreshCatalog(new AbortController().signal);
test('add merges duplicates, enforces stock, rejects invalid quantity and persists',()=>{
  const {store,disk}=setup();
  assert.equal(store.getState().addItem(product,2),2);
  assert.equal(store.getState().addItem(product,10),3);
  assert.equal(store.getState().items.length,1);
  assert.equal(store.getState().items[0].quantity,5);
  assert.equal(store.getState().addItem(product,1),0);
  assert.equal(store.getState().addItem(product,1.5),0);
  assert.equal(JSON.parse(disk.get('multimart-api-cart')).state.items[0].quantity,5);
});
test('refresh preserves user edits and does not reinsert a deleted item',async()=>{
  const {store,fetchWith}=setup();store.getState().addItem(product,3);
  let resolve;fetchWith(()=>new Promise(r=>{resolve=r;}));
  const pending=refresh(store);store.getState().setQuantity('p1',2);
  resolve({...product,price:120,basePrice:'120.00'});await pending;
  assert.equal(store.getState().items[0].quantity,2);assert.equal(store.getState().items[0].price,120);
  const removed=refresh(store);store.getState().removeItem('p1');resolve(product);await removed;
  assert.equal(store.getState().items.length,0);
});
test('newest refresh wins when requests finish in reverse order',async()=>{
  const {store,fetchWith}=setup();store.getState().addItem(product);
  const resolvers=[];fetchWith(()=>new Promise(r=>resolvers.push(r)));
  const first=refresh(store),second=refresh(store);
  resolvers[1]({...product,price:200,basePrice:'200.00'});await second;
  resolvers[0](product);await first;
  assert.equal(store.getState().items[0].price,200);
});
test('clear during refresh stays empty and idle',async()=>{
  const {store,fetchWith}=setup();store.getState().addItem(product);
  let resolve;fetchWith(()=>new Promise(r=>{resolve=r;}));const pending=refresh(store);
  store.getState().clearCart();resolve(product);await pending;
  assert.deepEqual(store.getState().items,[]);assert.equal(store.getState().syncStatus,'idle');
});
test('network failure preserves cart, 404 marks unavailable, retry succeeds',async()=>{
  const {store,fetchWith}=setup();store.getState().addItem(product,2);
  fetchWith(async()=>{throw new CatalogError(503);});await refresh(store);
  assert.equal(store.getState().syncStatus,'error');assert.equal(store.getState().items[0].quantity,2);
  fetchWith(async()=>{throw new CatalogError(404);});await refresh(store);
  assert.equal(store.getState().items[0].catalogStatus,'unavailable');
  fetchWith(async()=>product);await refresh(store);
  assert.equal(store.getState().items[0].catalogStatus,'available');
});
test('reload restores old cart as unchecked and broken JSON cannot crash store',()=>{
  let instance=setup();instance.store.getState().addItem(product,2);
  const raw=instance.disk.get('multimart-api-cart');instance=setup(raw);
  assert.equal(instance.store.getState().items[0].quantity,2);
  assert.equal(instance.store.getState().items[0].catalogStatus,'unchecked');
  const broken=setup('{bad');assert.deepEqual(broken.store.getState().items,[]);
});
test('storage quota failure keeps in-memory cart and reports storage error',async()=>{
  const {store,breakStorage}=setup();breakStorage();store.getState().addItem(product,2);
  await new Promise(r=>setImmediate(r));
  assert.equal(store.getState().items[0].quantity,2);assert.equal(store.getState().storageError,true);
});
