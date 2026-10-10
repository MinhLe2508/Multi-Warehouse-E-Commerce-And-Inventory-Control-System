'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { WAREHOUSES } from '../../shared/mock/adminMock';
import type { Warehouse } from '../../shared/types/admin';

interface Ctx { warehouses: Warehouse[]; warehouseId: string; setWarehouseId: (id: string) => void }
const AdminCtx = createContext<Ctx | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [warehouseId, setWarehouseId] = useState('ALL');
  return <AdminCtx.Provider value={{ warehouses: WAREHOUSES, warehouseId, setWarehouseId }}>{children}</AdminCtx.Provider>;
}
export const useAdminCtx = () => {
  const c = useContext(AdminCtx);
  if (!c) throw new Error('useAdminCtx phải nằm trong AdminProvider');
  return c;
};
