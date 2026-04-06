'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { formatKRW } from '@/lib/utils';

const DEFAULT_ITEM = { productName: '', quantity: 1, unitPriceCny: '' };

interface CreateOrderModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateOrderModal({ onClose, onCreated }: CreateOrderModalProps) {
  const [supplierName, setSupplierName] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [items, setItems] = useState([{ ...DEFAULT_ITEM }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const addItem = () => setItems([...items, { ...DEFAULT_ITEM }]);

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (
    index: number,
    field: keyof typeof DEFAULT_ITEM,
    value: string | number,
  ) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleSubmit = async () => {
    setError('');
    if (!supplierName.trim()) {
      setError('공급업체명을 입력하세요');
      return;
    }
    const validItems = items.filter(
      (i) => i.productName.trim() && Number(i.quantity) > 0 && parseFloat(i.unitPriceCny) > 0,
    );
    if (validItems.length === 0) {
      setError('유효한 품목을 1개 이상 추가하세요');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/api/purchase-orders', {
        action: 'create',
        companyId: '00000000-0000-0000-0000-000000000000',
        supplierName: supplierName.trim(),
        expectedDeliveryDate: expectedDate || undefined,
        items: validItems.map((i) => ({
          productName: i.productName.trim(),
          quantity: Number(i.quantity),
          unitPriceCny: parseFloat(i.unitPriceCny),
        })),
      });
      onCreated();
    } catch (err) {
      setError(isApiError(err) ? err.detail : '발주 생성에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const calculatedTotal = items.reduce((sum, i) => {
    const qty = Number(i.quantity) || 0;
    const price = parseFloat(i.unitPriceCny) || 0;
    return sum + qty * price;
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">발주 등록</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              공급업체명
            </label>
            <input
              type="text"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="예: 이우 XX무역"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">품목</label>
              <button
                onClick={addItem}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
              >
                <Plus size={12} /> 품목 추가
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={item.productName}
                    onChange={(e) => updateItem(idx, 'productName', e.target.value)}
                    placeholder="상품명"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                    placeholder="수량"
                    min={1}
                    className="w-20 px-3 py-2 border border-slate-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  <input
                    type="number"
                    value={item.unitPriceCny}
                    onChange={(e) => updateItem(idx, 'unitPriceCny', e.target.value)}
                    placeholder="단가(CNY)"
                    step="0.01"
                    className="w-28 px-3 py-2 border border-slate-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  {items.length > 1 && (
                    <button
                      onClick={() => removeItem(idx)}
                      className="p-1 text-slate-400 hover:text-red-500"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {calculatedTotal > 0 && (
              <div className="text-right text-sm text-slate-500 mt-1">
                합계: {formatKRW(calculatedTotal)} CNY
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              입고예정일
            </label>
            <input
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? '생성 중...' : '발주 등록'}
          </button>
        </div>
      </div>
    </div>
  );
}
