'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { KeyRound, Warehouse } from 'lucide-react';
import { useAdminResource, RecordStatus } from '@/components/admin/operations/AdminUi';
import { normalizeProductImageUrl } from '@/components/products/ProductImage';
import { apiPatch, extractErrorMessage } from '@/shared/lib/apiClient';
import { dateTime, STAFF_PROFILE_CHANGED, type Profile } from './data';
import { AdminFeedback, Field, PageTitle } from './PortalUi';

function ProfileForm({ profile, onSaved }: { profile: Profile; onSaved: (profile: Profile) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const submitting = useRef(false);
  const avatar = normalizeProductImageUrl(profile.avatarUrl);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const fullName = String(form.get('fullName') ?? '').trim();
    const phone = String(form.get('phone') ?? '').trim();
    submitting.current = true;
    setPending(true); setError(''); setNotice('');
    try {
      const updated = await apiPatch<Profile>('/staff/profile', { fullName, phone });
      setNotice('Đã lưu thông tin cá nhân.');
      window.dispatchEvent(new Event(STAFF_PROFILE_CHANGED));
      onSaved(updated);
    } catch (cause) {
      setError(extractErrorMessage(cause, 'Không lưu được hồ sơ.'));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  return <>
    <div className="staff-grid-two">
      <section className="staff-panel padded">
        <div className="staff-section-title">
          <div className="staff-actions">
            <span className="staff-avatar large" aria-hidden="true">{avatar
              ? <Image src={avatar} unoptimized alt="" width={64} height={64} />
              : profile.fullName.split(/\s+/).slice(-2).map((part) => part[0]).join('').toLocaleUpperCase('vi')}</span>
            <div><h2>{profile.fullName}</h2><span className="staff-muted">Nhân viên kho</span></div>
          </div>
          <RecordStatus label={profile.isActive ? 'Đang hoạt động' : 'Đã khóa'} tone={profile.isActive ? 'good' : 'bad'} />
        </div>
        <dl className="staff-details">
          <dt>Tên đăng nhập</dt><dd>{profile.username}</dd><dt>Email</dt><dd>{profile.email}</dd>
          <dt>Ngày tạo</dt><dd>{dateTime(profile.createdAt)}</dd>
        </dl>
        <h2 className="mt-4 mb-3">Thông tin liên hệ</h2>
        <form className="staff-form" onSubmit={(event) => void save(event)}>
          {error && <p className="staff-notice danger" role="alert">{error}</p>}
          {notice && <p className="staff-notice success" role="status">{notice}</p>}
          <Field label="Họ và tên"><input name="fullName" defaultValue={profile.fullName} maxLength={150} minLength={2} required disabled={pending} /></Field>
          <Field label="Số điện thoại"><input name="phone" type="tel" defaultValue={profile.phone ?? ''} maxLength={20} disabled={pending} /></Field>
          <div><button type="submit" className="staff-button primary" disabled={pending}>{pending ? 'Đang lưu…' : 'Lưu thông tin'}</button></div>
        </form>
      </section>
      <section className="staff-panel padded">
        <div className="staff-section-title"><h2>Kho được phân công</h2></div>
        {profile.warehouses.length ? <ul className="staff-list">
          {profile.warehouses.map((warehouse) => <li key={warehouse.id} className="staff-actions">
            <Warehouse size={17} aria-hidden="true" /><strong>{warehouse.code}</strong>{warehouse.name}
          </li>)}
        </ul> : <AdminFeedback empty="Chưa được giao kho đang hoạt động." />}
      </section>
    </div>
  </>;
}

export function StaffProfile() {
  const resource = useAdminResource<Profile>('/staff/profile');
  const [saved, setSaved] = useState<Profile>();
  const profile = saved ?? resource.data;
  return <>
    <PageTitle title="Hồ sơ cá nhân" actions={<Link href="/change-password" className="staff-button"><KeyRound size={16} /> Đổi mật khẩu</Link>} />
    <AdminFeedback loading={resource.loading && !profile} error={resource.error ?? undefined} retry={resource.refresh} />
    {profile && <ProfileForm profile={profile} onSaved={setSaved} />}
  </>;
}
