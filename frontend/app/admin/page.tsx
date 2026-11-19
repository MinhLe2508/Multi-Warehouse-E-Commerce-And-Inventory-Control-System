import { redirect } from 'next/navigation';

export default function AdminIndexPage() {
  // Theo quy tắc SRS và đặc tả layout: route /admin chuyển hướng về /admin/dashboard
  redirect('/admin/dashboard');
}
