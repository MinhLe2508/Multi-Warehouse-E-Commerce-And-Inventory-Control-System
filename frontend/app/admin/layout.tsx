import { Be_Vietnam_Pro } from 'next/font/google';
import type { ReactNode } from 'react';
import { AdminShell } from '../../components/admin/AdminShell';

// Be Vietnam Pro: hỗ trợ đầy đủ dấu tiếng Việt
const font = Be_Vietnam_Pro({ subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700'] });

export const metadata = { title: 'Quản trị — MWH' };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell fontClass={font.className}>{children}</AdminShell>;
}
