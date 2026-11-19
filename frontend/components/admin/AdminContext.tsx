'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiGet } from '../../shared/lib/apiClient';
import type { Warehouse } from '../../shared/types/admin';
import { useAuthStore } from '../../store/useAuthStore';

interface Ctx {
  warehouses: Warehouse[];
  warehouseId: string;
  setWarehouseId: (id: string) => void;
  refreshWarehouses: () => void;
}

const AdminCtx = createContext<Ctx | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('ALL');
  const [revision, setRevision] = useState(0);
  const refreshWarehouses = useCallback(() => setRevision((current) => current + 1), []);
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
          setWarehouseId((current) =>
            current === 'ALL' || list.some(({ id }) => id === current)
              ? current
              : 'ALL',
          );
        }
      })
      .catch(() => {
        // Không fallback sang mock
      });

    return () => {
      cancelled = true;
    };
  }, [revision, session]);

  return (
    <AdminCtx.Provider value={{ warehouses, warehouseId, setWarehouseId, refreshWarehouses }}>
      {children}
    </AdminCtx.Provider>
  );
}

export const useAdminCtx = () => {
  const c = useContext(AdminCtx);
  if (!c) throw new Error('useAdminCtx phải nằm trong AdminProvider');
  return c;
};
