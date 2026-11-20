import { StaffDashboard } from '@/components/staff/Dashboard';

export default async function Page({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  return <StaffDashboard notice={typeof notice === 'string' ? notice.slice(0, 200) : undefined} />;
}
