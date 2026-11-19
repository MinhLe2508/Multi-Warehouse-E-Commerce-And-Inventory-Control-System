"use client";

import { useTranslation } from "@/hooks/useTranslation";
import type { WarehouseStock } from "@/shared/types/product";

import { LOW_STOCK_THRESHOLD } from "@/shared/lib/utils";
import { getWarehouseName } from "@/shared/lib/mockData";
/** Dùng để vẽ thanh tồn kho: đầy thanh khi tồn >= giá trị này */
const BAR_FULL_AT = 100;

export default function WarehouseStockList({ stock }: { stock: WarehouseStock[] }) {
  const { t, language } = useTranslation();

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-soft">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-3 sm:px-4 py-3">
              {t.product.warehouse}
            </th>
            <th scope="col" className="px-3 sm:px-4 py-3 text-right">
              {t.product.stockQuantity}
            </th>
            <th scope="col" className="px-3 sm:px-4 py-3">
              {t.product.status}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {stock.map((s) => {
            const empty = s.quantity <= 0;
            const low = !empty && s.quantity <= LOW_STOCK_THRESHOLD;
            const percent = Math.min(100, (s.quantity / BAR_FULL_AT) * 100);
            return (
              <tr key={s.warehouseId}>
                <td className="px-3 sm:px-4 py-3.5">
                  <p className="font-medium text-slate-800">{getWarehouseName(s.warehouseId, language, s.warehouseName)}</p>
                  <div className="mt-2 h-1.5 w-20 sm:w-28 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${
                        empty
                          ? "bg-slate-300"
                          : low
                            ? "bg-amber-400"
                            : "bg-gradient-to-r from-brand-600 to-accent-500"
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </td>
                <td className="px-3 sm:px-4 py-3.5 text-right text-base font-semibold text-slate-900">
                  {s.quantity}
                </td>
                <td className="px-3 sm:px-4 py-3.5">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      empty
                        ? "bg-slate-100 text-slate-500"
                        : low
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {empty ? t.common.outOfStock : low ? t.common.lowStock : t.common.inStock}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
