import { Suspense } from "react";
import AuthForm from "@/components/auth/AuthForm";
export default function Page() { return <Suspense fallback={<p className="p-8">Đang tải…</p>}><AuthForm mode="reset-password" /></Suspense>; }
