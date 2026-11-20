import { StaffRestock } from '@/components/staff/Restock';

export default async function Page({ searchParams }: { searchParams: Promise<{ inventoryId?: string; warehouseId?: string }> }) {
  const { inventoryId, warehouseId } = await searchParams;
  return <StaffRestock
    initialInventoryId={typeof inventoryId === 'string' && /^[1-9]\d{0,18}$/.test(inventoryId) ? inventoryId : undefined}
    warehouse={typeof warehouseId === 'string' ? warehouseId : undefined}
  />;
}
