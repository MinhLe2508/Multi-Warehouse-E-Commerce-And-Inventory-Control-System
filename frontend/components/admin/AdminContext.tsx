'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiGet } from '../../shared/lib/apiClient';
import type { Warehouse } from '../../shared/types/admin';
import { useAuthStore } from '../../store/useAuthStore';

interface Ctx {
  warehouses: Warehouse[];
  warehouseId: string;
  setWarehouseId: (id: string) => void;
}

const AdminCtx = createContext<Ctx | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('ALL');
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    if (!session) return;
    const role = session.user.role;
    if (role !== 'ADMIN' && role !== 'WAREHOUSE_STAFF') return;

    let cancelled = false;
    apiGet<Warehouse[]>('/warehouses')
      .then((list) => {
        if (!cancelled && Array.isArray(list)) {
          setWarehouses(list);
        }
      })
      .catch(() => {
        // Không fallback sang mock
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <AdminCtx.Provider value={{ warehouses, warehouseId, setWarehouseId }}>
      {children}
    </AdminCtx.Provider>
  );
}

export const useAdminCtx = () => {
  const c = useContext(AdminCtx);
  if (!c) throw new Error('useAdminCtx phải nằm trong AdminProvider');
  return c;
};
