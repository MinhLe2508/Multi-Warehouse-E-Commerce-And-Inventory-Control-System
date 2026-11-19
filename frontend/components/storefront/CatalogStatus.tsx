"use client";
import { useTranslation } from '@/hooks/useTranslation';

export default function CatalogStatus({ error, retry }: { error?: unknown; retry: () => void }) {
  const { language } = useTranslation();
  const vi = language === 'vi';
  return <div className="mx-auto max-w-7xl px-6 py-12" role={error ? 'alert' : 'status'}>
    <p>{error ? (vi ? 'Không tải được sản phẩm. Vui lòng kiểm tra kết nối và thử lại.' : 'Unable to load products. Check your connection and try again.')
      : (vi ? 'Đang tải sản phẩm…' : 'Loading products…')}</p>
    {!!error && <button type="button" onClick={retry} className="mt-4 rounded-xl bg-brand-600 px-5 py-2 text-white">{vi ? 'Thử lại' : 'Retry'}</button>}
  </div>;
}
