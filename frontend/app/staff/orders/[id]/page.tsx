import { StaffOrderDetail } from '@/components/staff/Orders';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StaffOrderDetail key={id} id={id} />;
}
