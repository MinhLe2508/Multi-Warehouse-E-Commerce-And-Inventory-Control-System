export const dynamic = "force-dynamic";

export default async function Home() {
  let connected = false;
  try {
    const response = await fetch(
      `${process.env.BACKEND_URL ?? "http://localhost:3001"}/health`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    connected = response.ok;
  } catch {
    connected = false;
  }
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <p className="mb-3 text-sm uppercase tracking-widest">Multi-Warehouse · Tuần 1</p>
      <h1 className="mb-6 text-4xl font-bold">Thương mại điện tử & quản lý đa kho</h1>
      <p className="mb-8">Next.js, NestJS, PostgreSQL + pgvector và Redis.</p>
      <p role="status" className="rounded-xl border p-6">
        {connected
          ? "✓ Backend, PostgreSQL, pgvector và Redis đã kết nối."
          : "Chưa kết nối được hệ thống. Hãy khởi động Backend, PostgreSQL và Redis rồi tải lại trang."}
      </p>
    </main>
  );
}
