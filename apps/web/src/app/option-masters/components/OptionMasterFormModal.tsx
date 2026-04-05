'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  editName: string | null;
  initialForm: { name: string; isActive: boolean };
  initialTags: string[];
  onSave: (form: { name: string; isActive: boolean }, tags: string[]) => void;
  onClose: () => void;
}

export default function OptionMasterFormModal({
  editName,
  initialForm,
  initialTags,
  onSave,
  onClose,
}: Props) {
  const [form, setForm] = useState(initialForm);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState('');

  const addTag = () => {
    const val = tagInput.trim();
    if (!val || tags.includes(val)) return;
    setTags([...tags, val]);
    setTagInput('');
  };

  const removeTag = (idx: number) => {
    setTags(tags.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  const handleSave = () => {
    if (!form.name || tags.length === 0) return;
    onSave(form, tags);
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-slate-200 p-6 w-[480px] space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-gray-900">
          {editName ? '옵션 수정' : '옵션 추가'}
        </h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">옵션명</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm"
              placeholder="예: 색상, 사이즈"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              활성상태
            </label>
            <select
              value={form.isActive ? 'Y' : 'N'}
              onChange={(e) =>
                setForm({ ...form, isActive: e.target.value === 'Y' })
              }
              className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm"
            >
              <option value="Y">활성</option>
              <option value="N">비활성</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">값 목록</label>
            <div className="flex flex-wrap gap-1.5 mb-2 min-h-[32px] p-2 border border-gray-200 rounded-md bg-gray-50">
              {tags.map((tag, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full"
                >
                  {tag}
                  <button
                    onClick={() => removeTag(i)}
                    className="hover:text-red-500"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              {tags.length === 0 && (
                <span className="text-xs text-gray-400">
                  Enter키로 값 추가
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 border border-gray-200 rounded-md px-3 py-1.5 text-sm"
                placeholder="값 입력 후 Enter"
              />
              <button
                onClick={addTag}
                className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                추가
              </button>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
