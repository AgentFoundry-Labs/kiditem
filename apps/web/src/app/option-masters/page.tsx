'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  SlidersHorizontal,
  Plus,
  Trash2,
  Save,
  X,
  Tag,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface OptionMaster {
  id: string;
  name: string;
  values: string; // JSON array string
  isActive: boolean;
  createdAt: string;
}

export default function OptionMastersPage() {
  const queryClient = useQueryClient();

  const { data: options = [] } = useQuery({
    queryKey: ['option-masters'],
    queryFn: () => apiClient.get<OptionMaster[]>('/api/option-masters'),
  });

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<OptionMaster | null>(null);
  const [form, setForm] = useState({ name: '', isActive: true });
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const createMutation = useMutation({
    mutationFn: (body: { name: string; values: string; isActive: boolean }) => apiClient.post('/api/option-masters', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['option-masters'] });
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name: string; values: string; isActive: boolean } }) =>
      apiClient.patch(`/api/option-masters/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['option-masters'] });
      setShowForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/option-masters/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['option-masters'] }),
  });

  const parseValues = (v: string): string[] => {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const openNew = () => {
    setEditItem(null);
    setForm({ name: '', isActive: true });
    setTags([]);
    setTagInput('');
    setShowForm(true);
  };

  const openEdit = (item: OptionMaster) => {
    setEditItem(item);
    setForm({ name: item.name, isActive: item.isActive });
    setTags(parseValues(item.values));
    setTagInput('');
    setShowForm(true);
  };

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
    const body = { name: form.name, values: JSON.stringify(tags), isActive: form.isActive };
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, body });
    } else {
      createMutation.mutate(body);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
            <SlidersHorizontal size={18} /> Option Masters
          </h1>
          <p className="text-xs text-gray-400 font-mono mt-0.5">
            옵션 항목 관리 (색상, 사이즈 등)
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openNew}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700"
          >
            <Plus size={12} /> 옵션 추가
          </button>
        </div>
      </div>

      {/* 목록 */}
      {options.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-gray-400">
          등록된 옵션이 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {options.map((opt) => {
            const vals = parseValues(opt.values);
            return (
              <div
                key={opt.id}
                className="bg-white rounded-xl border border-slate-200 p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Tag size={14} className="text-blue-500" />
                    <span className="text-sm font-semibold text-gray-900">
                      {opt.name}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        opt.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {opt.isActive ? '활성' : '비활성'}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(opt)}
                      className="p-1 text-gray-400 hover:text-blue-500"
                    >
                      <Save size={13} />
                    </button>
                    <button onClick={() => deleteMutation.mutate(opt.id)} className="p-1 text-gray-400 hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {vals.map((v, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs rounded-full"
                    >
                      {v}
                    </span>
                  ))}
                  {vals.length === 0 && (
                    <span className="text-xs text-gray-400">값 없음</span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-3 font-mono">
                  {vals.length}개 값
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 추가/수정 모달 */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={() => setShowForm(false)}
        >
          <div
            className="bg-white rounded-xl border border-slate-200 p-6 w-[480px] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-900">
              {editItem ? '옵션 수정' : '옵션 추가'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  옵션명
                </label>
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
                <label className="text-xs text-gray-500 mb-1 block">
                  값 목록
                </label>
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
                onClick={() => setShowForm(false)}
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
      )}
    </div>
  );
}
