'use client';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatVnd } from '../../shared/lib/format';
import type { RevenuePoint } from '../../shared/types/admin';

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold">Doanh thu và số đơn theo ngày</h2>
      <div className="h-72 w-full" role="img" aria-label="Biểu đồ cột doanh thu và đường số đơn hàng theo ngày">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="rev" tick={{ fontSize: 12 }} tickFormatter={(v: number) => `${Math.round(v / 1_000_000)}tr`} width={44} />
            <YAxis yAxisId="ord" orientation="right" tick={{ fontSize: 12 }} width={36} />
            <Tooltip formatter={(value: any, name: any) => (name === 'Doanh thu' ? formatVnd(Number(value) || 0) : value)} />
            <Legend />
            <Bar yAxisId="rev" dataKey="revenue" name="Doanh thu" fill="#0f766e" radius={[3, 3, 0, 0]} />
            <Line yAxisId="ord" dataKey="orders" name="Số đơn" stroke="#b45309" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
