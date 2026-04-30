'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';

interface AddProductModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export default function AddProductModal({ onClose, onSaved }: AddProductModalProps) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    category: '',
    brand: '',
    pipelineStep: 'draft',
  });

  const createProduct = useMutation({
    mutationFn: () =>
      apiClient.post('/api/products/masters', {
        name: form.name,
        description: form.description,
        category: form.category || undefined,
        brand: form.brand || undefined,
        pipelineStep: form.pipelineStep,
      }),
    onSuccess: () => onSaved(),
    onError: (err) => toast.error(isApiError(err) ? err.detail : '상품 등록 중 오류가 발생했습니다.'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('상품명을 입력하세요');
      return;
    }
    createProduct.mutate();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">상품 등록</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm text-slate-600 mb-1">상품명 *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">설명</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-600 mb-1">카테고리</label>
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">브랜드</label>
              <input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">상태</label>
            <select
              value={form.pipelineStep}
              onChange={(e) => setForm({ ...form, pipelineStep: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="draft">초안</option>
              <option value="processing">처리중</option>
              <option value="processed">완료</option>
            </select>
          </div>
          <div className="text-[11px] text-slate-400 bg-slate-50 rounded-lg p-2">
            옵션·가격·재고는 등록 후 상세 페이지에서 추가할 수 있습니다.
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 border rounded-lg text-sm hover:bg-slate-50">취소</button>
            <button type="submit" disabled={createProduct.isPending} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
              {createProduct.isPending ? '저장 중…' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
