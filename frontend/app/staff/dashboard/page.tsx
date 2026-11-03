'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashboardView } from '../../../components/admin/DashboardView';

function StaffNotice() {
  const params = useSearchParams();
  const notice = params.get('notice');
  if (!notice) return null;

  return (
    <div className="alert alert-warning alert-dismissible fade show mb-4 d-flex align-items-center justify-content-between" role="alert">
      <div>
        <strong>Thông báo:</strong> {notice}
      </div>
    </div>
  );
}

export default function StaffDashboardPage() {
  return (
    <>
      <Suspense fallback={null}>
        <StaffNotice />
      </Suspense>
      <DashboardView />
    </>
  );
}
