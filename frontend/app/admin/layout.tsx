import 'bootstrap/dist/css/bootstrap.min.css';
import './admin.css';
import { Be_Vietnam_Pro } from 'next/font/google';
import type { ReactNode } from 'react';
import { AdminShell } from '../../components/admin/AdminShell';

// Be Vietnam Pro: hỗ trợ đầy đủ dấu tiếng Việt
const font = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata = {
  title: 'Hệ thống Quản trị & Điều phối Tồn kho — MWH',
  description: 'Giao diện quản trị kho hàng đa điểm và kiểm soát đơn hàng',
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell fontClass={font.className}>{children}</AdminShell>;
}
