'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderTree, Plus, Save, Trash2, RefreshCw } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface CategoryMapping {
  id: string;
  internalCategory: string;
  coupangCategoryId: string | null;
  coupangCategoryName: string | null;
  keywords: string | null;
  isActive: boolean;
}

interface InternalCategory { name: string; count: number; }

export default function Categories() {
  const queryClient = useQueryClient();

  const { data: mappings = [] } = useQuery({
    queryKey: ['categories', 'mappings'],
    queryFn: () => apiClient.get<CategoryMapping[]>('/api/categories'),
  });

  // Internal categories derived from products, not a separate API
  const { data: productsData } = useQuery({
    queryKey: ['products', 'categories'],
    queryFn: () => apiClient.get<{ items: { id: string; category: string | null }[] }>('/api/products?limit=200'),
  });

  const categories = useMemo(() => {
    const items = productsData?.items ?? [];
    const catMap = new Map<string, number>();
    for (const p of items) {
      const cat = p.category || '미분류';
      catMap.set(cat, (catMap.get(cat) || 0) + 1);
    }
    return Array.from(catMap.entries()).map(([name, count]) => ({ name, count }));
  }, [productsData]);

  const [editForm, setEditForm] = useState({ internalCategory: '', coupangCategoryId: '', coupangCategoryName: '', keywords: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (body: typeof editForm) => apiClient.post('/api/categories', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setShowAdd(false);
      setEditForm({ internalCategory: '', coupangCategoryId: '', coupangCategoryName: '', keywords: '' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof editForm }) => apiClient.patch(`/api/categories/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setShowAdd(false);
      setEditingId(null);
      setEditForm({ internalCategory: '', coupangCategoryId: '', coupangCategoryName: '', keywords: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/categories/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });

  // 미매핑 카테고리 찾기
  const mappedNames = new Set(mappings.map((m) => m.internalCategory));
  const unmapped = categories.filter((c) => !mappedNames.has(c.name));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FolderTree size={22} /> 카테고리 매핑
          </h1>
          <p className="text-sm text-slate-500 mt-1">내부 카테고리 &lt;-&gt; 쿠팡 카테고리 매핑</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-md text-xs text-slate-500 hover:bg-slate-50 font-mono">
            <RefreshCw size={12} /> REFRESH
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-md text-xs hover:bg-purple-700">
            <Plus size={12} /> 매핑 추가
          </button>
        </div>
      </div>

      {/* 미매핑 경고 */}
      {unmapped.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-amber-800 mb-2">미매핑 카테고리 ({unmapped.length}개)</div>
          <div className="flex flex-wrap gap-1.5">
            {unmapped.map((c) => (
              <button
                key={c.name}
                onClick={() => { setEditForm({ ...editForm, internalCategory: c.name }); setShowAdd(true); }}
                className="px-2.5 py-1 bg-amber-100 text-amber-700 text-xs rounded-full hover:bg-amber-200 transition-colors"
              >
                {c.name} ({c.count})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 매핑 추가/수정 폼 */}
      {showAdd && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-3">카테고리 매핑 {editForm.internalCategory ? '수정' : '추가'}</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">내부 카테고리 *</label>
              <input type="text" value={editForm.internalCategory} onChange={(e) => setEditForm({ ...editForm, internalCategory: e.target.value })}
                placeholder="예: 유아용품" className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">쿠팡 카테고리 코드</label>
              <input type="text" value={editForm.coupangCategoryId} onChange={(e) => setEditForm({ ...editForm, coupangCategoryId: e.target.value })}
                placeholder="예: 78104" className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1">쿠팡 카테고리 경로</label>
              <input type="text" value={editForm.coupangCategoryName} onChange={(e) => setEditForm({ ...editForm, coupangCategoryName: e.target.value })}
                placeholder="예: 출산/육아 > 유아동의류 > 상의" className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1">자동 매핑 키워드 (쉼표 구분)</label>
              <input type="text" value={editForm.keywords} onChange={(e) => setEditForm({ ...editForm, keywords: e.target.value })}
                placeholder="예: 유아, 아기, 키즈, 어린이" className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => { setShowAdd(false); setEditingId(null); }} className="px-3 py-1.5 text-slate-500 text-xs hover:bg-slate-50 rounded-md">취소</button>
            <button
              onClick={() => editingId ? updateMutation.mutate({ id: editingId, body: editForm }) : createMutation.mutate(editForm)}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white text-xs rounded-md hover:bg-purple-700 disabled:opacity-50">
              <Save size={12} /> 저장
            </button>
          </div>
        </div>
      )}

      {/* 매핑 테이블 */}
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>내부 카테고리</th>
              <th>쿠팡 코드</th>
              <th>쿠팡 카테고리 경로</th>
              <th>키워드</th>
              <th className="text-right">상품수</th>
              <th></th>
            </tr>
          </thead>
          <tbody >
            {mappings.map((m) => {
              const cat = categories.find((c) => c.name === m.internalCategory);
              return (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{m.internalCategory}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{m.coupangCategoryId || '-'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px] truncate">{m.coupangCategoryName || '-'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{m.keywords || '-'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{cat?.count || 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => { setEditingId(m.id); setEditForm({ internalCategory: m.internalCategory, coupangCategoryId: m.coupangCategoryId || '', coupangCategoryName: m.coupangCategoryName || '', keywords: m.keywords || '' }); setShowAdd(true); }}
                        className="px-2 py-1 text-[10px] text-purple-600 hover:bg-blue-50 rounded font-mono">EDIT</button>
                      <button onClick={() => deleteMutation.mutate(m.id)} className="p-1 text-slate-400 hover:text-red-500 rounded"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {mappings.length === 0 && <div className="empty-state">카테고리 매핑이 없습니다. 상단의 미매핑 카테고리를 클릭하여 추가하세요.</div>}
      </div>
    </div>
  );
}
