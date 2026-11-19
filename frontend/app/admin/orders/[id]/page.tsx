import { OrderRecord } from '../../../../components/admin/operations/OrderRecord';

export default async function AdminOrderRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderRecord id={id} />;
}
