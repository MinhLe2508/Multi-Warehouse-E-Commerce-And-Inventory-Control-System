import { InventoryView } from '../../../components/admin/InventoryView';

type SearchParams = Promise<{
  warehouseId?: string | string[];
  sku?: string | string[];
}>;

export default async function StaffInventoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { warehouseId, sku } = await searchParams;
  const linkedWarehouse = typeof warehouseId === 'string' ? warehouseId : undefined;
  const search = typeof sku === 'string' ? sku.trim().slice(0, 64) : '';
  return (
    <InventoryView
      key={JSON.stringify([linkedWarehouse, search])}
      variant="staff"
      initialWarehouseId={linkedWarehouse}
      initialSearch={search}
    />
  );
}
