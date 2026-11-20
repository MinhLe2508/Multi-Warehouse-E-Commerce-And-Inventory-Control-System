import 'bootstrap/dist/css/bootstrap.min.css';
import '../admin/admin.css';
import './staff.css';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { StaffShell } from '@/components/staff/StaffShell';

const font = Inter({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
});

export const metadata = {
  title: 'Khu vực Nhân viên Kho — MWH Staff',
  description: 'Giao diện điều hành đơn hàng và kiểm soát tồn kho dành cho Nhân viên kho',
};

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <StaffShell fontClass={font.className}>
      {children}
    </StaffShell>
  );
}
