import { STATUS_LABEL } from '../../shared/lib/format';
import type { AlertLevel, OrderStatus } from '../../shared/types/admin';

const ORDER_STYLE: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'bg-amber-100 text-amber-900', CONFIRMED: 'bg-teal-100 text-teal-900',
  SHIPPING: 'bg-sky-100 text-sky-900', DELIVERED: 'bg-emerald-100 text-emerald-900', CANCELLED: 'bg-rose-100 text-rose-900',
};
const base = 'inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold';

export const OrderBadge = ({ status }: { status: OrderStatus }) =>
  <span className={`${base} ${ORDER_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;

export const AlertBadge = ({ level }: { level: AlertLevel }) =>
  <span className={`${base} ${level === 'CRITICAL' ? 'bg-rose-100 text-rose-900' : 'bg-amber-100 text-amber-900'}`}>
    {level === 'CRITICAL' ? 'Hết hàng / nghiêm trọng' : 'Sắp hết'}
  </span>;
