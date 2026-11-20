import { StaffInventory } from '@/components/staff/Inventory';

export default async function Page({ searchParams }: { searchParams: Promise<{ warehouseId?: string; sku?: string }> }) {
  const { warehouseId, sku } = await searchParams;
  return <StaffInventory warehouse={typeof warehouseId === 'string' ? warehouseId : undefined}
    sku={typeof sku === 'string' ? sku.trim().slice(0, 64) || undefined : undefined} />;
}
