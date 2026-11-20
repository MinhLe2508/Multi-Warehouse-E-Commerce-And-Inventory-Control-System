import { StaffOrders } from '@/components/staff/Orders';
import { STATUS_LABEL } from '@/shared/lib/format';

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  return <StaffOrders initialStatus={typeof status === 'string' && Object.hasOwn(STATUS_LABEL, status) ? status : ''} />;
}
