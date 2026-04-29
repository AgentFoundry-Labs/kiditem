'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api-error';

export const CS_TYPE_LABELS: Record<string, string> = {
  as: "A/S",
  return: "반품",
  exchange: "교환",
  shipping: "배송",
  refund: "환불",
  cancel: "취소",
  etc: "기타",
};

const CS_TYPES = Object.keys(CS_TYPE_LABELS);

interface CreateCSModalProps {
  onClose: () => void;
  onCreated: (form: {
    csType: string;
    content: string;
    priority: string;
    assignee: string;
    orderId: string;
  }) => Promise<void>;
}

export default function CreateCSModal({ onClose, onCreated }: CreateCSModalProps) {
  const [form, setForm] = useState({
    csType: "as",
    content: "",
    priority: "normal",
    assignee: "",
    orderId: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!form.content.trim()) {
      toast.error("내용을 입력해주세요.");
      return;
    }
    setSubmitting(true);
    try {
      await onCreated(form);
    } catch (e) {
      toast.error(isApiError(e) ? e.detail : "CS 등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">CS 등록</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-500 mb-1">
                CS 유형
              </label>
              <select
                value={form.csType}
                onChange={(e) =>
                  setForm({ ...form, csType: e.target.value })
                }
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              >
                {CS_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CS_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1">
                우선순위
              </label>
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm({ ...form, priority: e.target.value })
                }
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="normal">일반</option>
                <option value="urgent">긴급</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">
              주문번호 (선택)
            </label>
            <input
              type="text"
              value={form.orderId}
              onChange={(e) =>
                setForm({ ...form, orderId: e.target.value })
              }
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              placeholder="주문번호"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">내용</label>
            <textarea
              value={form.content}
              onChange={(e) =>
                setForm({ ...form, content: e.target.value })
              }
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm h-24 resize-none"
              placeholder="CS 내용을 입력하세요"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">
              담당자
            </label>
            <input
              type="text"
              value={form.assignee}
              onChange={(e) =>
                setForm({ ...form, assignee: e.target.value })
              }
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              placeholder="담당자"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            {submitting ? "등록 중..." : "등록"}
          </button>
        </div>
      </div>
    </div>
  );
}
