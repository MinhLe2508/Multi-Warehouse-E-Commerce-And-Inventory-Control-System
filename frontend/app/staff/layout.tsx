import 'bootstrap/dist/css/bootstrap.min.css';
import '../admin/admin.css';
import { Be_Vietnam_Pro } from 'next/font/google';
import type { ReactNode } from 'react';
import { AdminShell } from '../../components/admin/AdminShell';

const font = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata = {
  title: 'Khu vực Nhân viên Kho — MWH Staff',
  description: 'Giao diện điều hành đơn hàng và kiểm soát tồn kho dành cho Nhân viên kho',
};

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <AdminShell variant="staff" fontClass={font.className}>
      {children}
    </AdminShell>
  );
}
