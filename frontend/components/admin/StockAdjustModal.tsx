'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  Loader2,
  PackagePlus,
  Sliders,
} from 'lucide-react';
import type {
  ProductInventoryItem,
  WarehouseStockDetail,
  StockAdjustPayload,
} from '../../shared/types/admin';

interface StockAdjustModalProps {
  target: {
    product: ProductInventoryItem;
    detail: WarehouseStockDetail;
  } | null;
  onClose: () => void;
  onSubmit: (payload: StockAdjustPayload) => Promise<{ success: boolean; error?: string }>;
}

const StockAdjustDialogContent: React.FC<{
  target: {
    product: ProductInventoryItem;
    detail: WarehouseStockDetail;
  };
  onClose: () => void;
  onSubmit: (payload: StockAdjustPayload) => Promise<{ success: boolean; error?: string }>;
}> = ({ target, onClose, onSubmit }) => {
  const { product, detail } = target;

  const [mode, setMode] = useState<'ADJUST' | 'RESTOCK'>('ADJUST');
  const [newStock, setNewStock] = useState<number>(detail.stock);
  const [restockQty, setRestockQty] = useState<number>(10);
  const [threshold, setThreshold] = useState<number | ''>(detail.threshold ?? '');
  const [note, setNote] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Đóng modal khi bấm Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, submitting]);

  // Tính toán trước khả dụng
  const previewStock = mode === 'ADJUST' ? newStock : detail.stock + (restockQty || 0);
  const previewAvailable = Math.max(0, previewStock - detail.reservedStock);

  const isInvalidStock = mode === 'ADJUST' && (newStock < detail.reservedStock || newStock < 0);
  const isInvalidRestock = mode === 'RESTOCK' && (!restockQty || restockQty <= 0);
  const isInvalidNote = note.trim().length < 5 || note.trim().length > 500;
  const hasChanged =
    mode === 'RESTOCK'
      ? restockQty > 0
      : newStock !== detail.stock || threshold !== (detail.threshold ?? '');

  const handleQuickAdd = (amount: number) => {
    if (mode === 'ADJUST') {
      setNewStock(Math.max(detail.reservedStock, newStock + amount));
    } else {
      setRestockQty((prev) => Math.max(1, (prev || 0) + amount));
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isInvalidStock) {
      setErrorMessage(
        `Số lượng tồn mới (${newStock}) không được nhỏ hơn số lượng giữ chỗ (${detail.reservedStock})!`
      );
      return;
    }
    if (isInvalidRestock) {
      setErrorMessage('Số lượng nhập hàng phải lớn hơn 0!');
      return;
    }
    if (isInvalidNote) {
      setErrorMessage('Lý do/ghi chú bắt buộc phải từ 5 đến 500 ký tự (FR-INV-01)!');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    // Không còn expectedVersion theo T10
    const payload: StockAdjustPayload = {
      inventoryId: detail.inventoryId,
      mode,
      note: note.trim(),
      ...(mode === 'ADJUST'
        ? {
            newStock,
            threshold: threshold === '' ? null : Number(threshold),
          }
        : {
            quantity: restockQty,
          }),
    };

    const res = await onSubmit(payload);
    setSubmitting(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Có lỗi xảy ra khi cập nhật tồn kho (404/409/422).');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-lg max-h-[90vh] my-auto flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header - ghim cố định ở đỉnh */}
        <div className="shrink-0 px-6 py-4 bg-gradient-to-r from-purple-700 via-indigo-600 to-purple-800 text-white flex items-center justify-between">
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-white/20 shrink-0">
                Kho: {detail.warehouseCode}
              </span>
              <span className="text-xs text-purple-200 truncate">
                {detail.warehouseName}
              </span>
            </div>
            <h3 className="text-base font-bold mt-1 text-white truncate max-w-sm">
              {product.name}
            </h3>
            <p className="text-xs text-purple-200">Mã SKU: {product.sku}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Đóng cửa sổ"
            title="Đóng (Esc)"
            className="shrink-0 p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition-all hover:scale-105 active:scale-95 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chuyển đổi hai thao tác tách biệt: Điều chỉnh vs Nhập hàng (T10) */}
        <div className="shrink-0 flex border-b border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={() => {
              setMode('ADJUST');
              setErrorMessage(null);
            }}
            className={`flex-1 py-3 px-4 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${
              mode === 'ADJUST'
                ? 'border-purple-600 text-purple-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sliders size={15} />
            <span>Điều chỉnh kiểm kê (PUT)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('RESTOCK');
              setErrorMessage(null);
            }}
            className={`flex-1 py-3 px-4 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${
              mode === 'RESTOCK'
                ? 'border-purple-600 text-purple-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <PackagePlus size={15} />
            <span>Nhập thêm hàng (POST)</span>
          </button>
        </div>

        {/* Content & Form với body có thể cuộn độc lập và footer ghim đáy */}
        <form onSubmit={handleFormSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Scrollable Form Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Trạng thái hiện tại */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-center">
              <div>
                <p className="text-xs text-slate-500 font-medium">Tồn vật lý</p>
                <p className="text-base font-bold text-slate-800">{detail.stock}</p>
              </div>
              <div className="border-x border-slate-200">
                <p className="text-xs text-amber-600 font-medium">Đang giữ chỗ</p>
                <p className="text-base font-bold text-amber-600">{detail.reservedStock}</p>
              </div>
              <div>
                <p className="text-xs text-purple-600 font-medium">Khả dụng</p>
                <p className="text-base font-bold text-purple-700">{detail.availableStock}</p>
              </div>
            </div>

            {/* Ràng buộc thông tin */}
            {mode === 'ADJUST' ? (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-800">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Quy tắc điều chỉnh tồn kho (FR-INV-01):</p>
                  <p>
                    Tồn kho mới tối thiểu phải là <strong>{detail.reservedStock}</strong> (để không âm số lượng đang giữ chỗ cho khách).
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-purple-50/80 border border-purple-200 text-xs text-purple-800">
                <PackagePlus className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Nhập hàng cộng dồn (RESTOCK):</p>
                  <p>
                    Số lượng nhập sẽ được cộng trực tiếp vào tồn kho hiện tại ({detail.stock}).
                  </p>
                </div>
              </div>
            )}

            {/* Thao tác Điều chỉnh */}
            {mode === 'ADJUST' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Số lượng tồn kho vật lý mới sau kiểm kê <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={detail.reservedStock}
                    value={newStock}
                    onChange={(e) => setNewStock(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 text-base font-semibold border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-800"
                    required
                  />
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleQuickAdd(5)}
                      className="px-2.5 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAdd(10)}
                      className="px-2.5 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"
                    >
                      +10
                    </button>
                  </div>
                </div>

                {/* Ngưỡng cảnh báo riêng tùy chọn */}
                <div className="mt-3">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ngưỡng cảnh báo riêng (để trống để dùng mặc định của kho)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={threshold}
                    onChange={(e) =>
                      setThreshold(e.target.value === '' ? '' : parseInt(e.target.value) || 0)
                    }
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-800"
                    placeholder="Mặc định kho"
                  />
                </div>
              </div>
            ) : (
              /* Thao tác Nhập hàng */
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Số lượng nhập thêm vào kho <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={restockQty}
                    onChange={(e) => setRestockQty(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 text-base font-semibold border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-800"
                    required
                  />
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleQuickAdd(10)}
                      className="px-2.5 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"
                    >
                      +10
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAdd(50)}
                      className="px-2.5 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"
                    >
                      +50
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Preview Tồn kho & Khả dụng trước -> sau */}
            <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-100 text-xs text-slate-700 space-y-1">
              <div className="flex items-center justify-between">
                <span>Tồn vật lý:</span>
                <span className="font-bold flex items-center gap-1">
                  <span>{detail.stock}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-purple-700 font-extrabold">{previewStock}</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Khả dụng sau thay đổi:</span>
                <span className="font-bold flex items-center gap-1">
                  <span>{detail.availableStock}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  <span
                    className={
                      previewAvailable <= detail.effectiveThreshold
                        ? 'text-amber-600 font-extrabold'
                        : 'text-emerald-600 font-extrabold'
                    }
                  >
                    {previewAvailable}{' '}
                    {previewAvailable <= detail.effectiveThreshold ? '(Sắp hết)' : '(An toàn)'}
                  </span>
                </span>
              </div>
            </div>

            {/* Lý do / ghi chú (note) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Lý do / Ghi chú (bắt buộc, ghi vào nhật ký kiểm toán) <span className="text-rose-500">*</span>
                </label>
                <span
                  className={`text-xs ${
                    note.trim().length < 5 ? 'text-slate-400' : 'text-emerald-600'
                  }`}
                >
                  {note.length}/500 ký tự (tối thiểu 5)
                </span>
              </div>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  mode === 'ADJUST'
                    ? 'VD: Kiểm kê kho cuối tháng phát hiện lệch 5 cái...'
                    : 'VD: Nhập hàng theo phiếu nhập kho NK-2026-03...'
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-800 placeholder-slate-400 resize-none"
                required
              />
            </div>

            {/* Thông báo lỗi nếu có */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Lỗi cập nhật tồn kho:</p>
                  <p>{errorMessage}</p>
                </div>
              </div>
            )}
          </div>

          {/* Footer nút hành động - luôn ghim cố định ở đáy, không bao giờ trôi mất */}
          <div className="shrink-0 px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition cursor-pointer"
            >
              Hủy bỏ (Esc)
            </button>
            <button
              type="submit"
              disabled={submitting || isInvalidStock || isInvalidRestock || isInvalidNote || !hasChanged}
              className={`inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer ${
                submitting || isInvalidStock || isInvalidRestock || isInvalidNote || !hasChanged
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-purple-200 hover:shadow-lg'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Đang gửi...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {mode === 'ADJUST' ? 'Lưu kiểm kê' : 'Xác nhận nhập'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const StockAdjustModal: React.FC<StockAdjustModalProps> = ({
  target,
  onClose,
  onSubmit,
}) => {
  if (!target) return null;
  return (
    <StockAdjustDialogContent
      target={target}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
};
