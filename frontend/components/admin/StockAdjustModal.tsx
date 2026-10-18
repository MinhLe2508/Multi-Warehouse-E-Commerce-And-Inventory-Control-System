'use client';

import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle2, ShieldAlert, ArrowRight, Loader2 } from 'lucide-react';
import type { ProductInventoryItem, WarehouseStockDetail, StockAdjustPayload } from '../../shared/types/admin';

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

  const [newStock, setNewStock] = useState<number>(detail.stock);
  const [note, setNote] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Tính toán trước khả dụng mới
  const previewAvailable = Math.max(0, newStock - detail.reservedStock);
  const isInvalidStock = newStock < detail.reservedStock || newStock < 0;
  const isInvalidNote = note.trim().length < 5 || note.trim().length > 500;
  const hasChanged = newStock !== detail.stock;

  const handleQuickAdd = (amount: number) => {
    const updated = Math.max(detail.reservedStock, newStock + amount);
    setNewStock(updated);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isInvalidStock) {
      setErrorMessage(
        `Số lượng tồn mới (${newStock}) không được nhỏ hơn số lượng giữ chỗ (${detail.reservedStock})!`
      );
      return;
    }
    if (isInvalidNote) {
      setErrorMessage('Lý do điều chỉnh (note) bắt buộc phải từ 5 đến 500 ký tự (FR-INV-01)!');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    const payload: StockAdjustPayload = {
      inventoryId: detail.inventoryId,
      newStock,
      expectedVersion: detail.version,
      note: note.trim(),
    };

    const res = await onSubmit(payload);
    setSubmitting(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Có lỗi xảy ra khi cập nhật tồn kho');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-purple-700 via-indigo-600 to-purple-800 text-white flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-white/20">
                Điều chỉnh tồn kho
              </span>
              <span className="text-xs text-purple-200">
                Kho: {detail.warehouseCode}
              </span>
            </div>
            <h3 className="text-lg font-bold mt-1 text-white truncate max-w-sm">
              {product.name}
            </h3>
            <p className="text-xs text-purple-200">Mã SKU: {product.sku}</p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleFormSubmit} className="p-6 space-y-5">
          {/* Trạng thái hiện tại */}
          <div className="grid grid-cols-3 gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-center">
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
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-800">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Ràng buộc hệ thống (CON-04 & FR-INV-01):</p>
              <p>
                Tồn kho mới tối thiểu phải là <strong>{detail.reservedStock}</strong> (để đảm bảo đơn hàng đã xác nhận không bị thiếu hụt). Phiên bản kiểm soát: <code>v{detail.version}</code>.
              </p>
            </div>
          </div>

          {/* Input Tồn kho mới */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Số lượng tồn kho vật lý mới <span className="text-rose-500">*</span>
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
              <div className="flex gap-1.5">
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
                <button
                  type="button"
                  onClick={() => handleQuickAdd(50)}
                  className="px-2.5 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"
                >
                  +50
                </button>
              </div>
            </div>

            {/* Preview Khả dụng */}
            <div className="mt-2 flex items-center justify-between text-xs text-slate-600 px-1">
              <span>Khả dụng dự kiến:</span>
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

          {/* Lý do điều chỉnh (note) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Lý do điều chỉnh (Bắt buộc) <span className="text-rose-500">*</span>
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
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Kiểm kê định kỳ phát hiện thừa 5 cái, nhập thêm lô hàng số 104..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-800 placeholder-slate-400 resize-none"
              required
            />
          </div>

          {/* Thông báo lỗi nếu có */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Lỗi điều chỉnh tồn kho:</p>
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Footer nút hành động */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submitting || isInvalidStock || isInvalidNote || !hasChanged}
              className={`inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold rounded-xl shadow-md transition-all ${
                submitting || isInvalidStock || isInvalidNote || !hasChanged
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-purple-200 hover:shadow-lg'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Lưu thay đổi
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
