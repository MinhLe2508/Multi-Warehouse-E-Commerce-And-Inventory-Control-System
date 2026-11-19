'use client';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatVnd } from '../../shared/lib/format';
import type { RevenuePoint } from '../../shared/types/admin';

const compactAmount = new Intl.NumberFormat('vi-VN', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function reportDate(date: string, withYear = false) {
  const [year, month, day] = date.split('-');
  return withYear ? `${day}/${month}/${year}` : `${day}/${month}`;
}

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  return (
    <section className="admin-workspace-panel p-3 p-md-4">
      <h2 className="admin-panel-heading mb-3">
        Doanh thu và số đơn theo ngày
      </h2>
      <div
        className="h-72 w-full"
        role="img"
        aria-label="Biểu đồ cột doanh thu và đường số đơn hàng theo ngày"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              interval="preserveStartEnd"
              minTickGap={24}
              tickMargin={8}
              tick={{ fontSize: 12 }}
              tickFormatter={(date: string) => reportDate(date)}
            />
            <YAxis
              yAxisId="rev"
              tick={{ fontSize: 12 }}
              tickFormatter={(value: number) => compactAmount.format(value)}
              width={56}
            />
            <YAxis
              yAxisId="ord"
              orientation="right"
              allowDecimals={false}
              tick={{ fontSize: 12 }}
              width={36}
            />
            <Tooltip
              labelFormatter={(date) => reportDate(String(date), true)}
              formatter={(value, name) =>
                name === 'Doanh thu' ? formatVnd(Number(value) || 0) : value
              }
            />
            <Legend />
            <Bar
              yAxisId="rev"
              dataKey="revenue"
              name="Doanh thu"
              fill="#0f766e"
              radius={[3, 3, 0, 0]}
            />
            <Line
              yAxisId="ord"
              dataKey="orders"
              name="Số đơn"
              stroke="#b45309"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
