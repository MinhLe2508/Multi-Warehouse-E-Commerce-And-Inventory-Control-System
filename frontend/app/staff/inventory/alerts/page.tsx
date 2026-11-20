import { StaffAlerts } from '@/components/staff/Alerts';

export default async function Page({ searchParams }: { searchParams: Promise<{ alert?: string }> }) {
  const { alert } = await searchParams;
  return <StaffAlerts alertId={typeof alert === 'string' && /^[1-9]\d{0,17}$/.test(alert) ? alert : undefined} />;
}
