'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Plus,
  Trash2,
  Star,
  MapPin,
  Phone,
  User,
  Edit2,
  Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

interface Warehouse {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  manager: string | null;
  phone: string | null;
  isDefault: boolean;
  status: string;
  shipmentCount: number;
}

export default function WarehousesPage() {
  const queryClient = useQueryClient();

  const { data: warehouses = [] } = useQuery({
    queryKey: queryKeys.warehouses.all,
    queryFn: () => apiClient.get<Warehouse[]>('/api/warehouses'),
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    code: '',
    address: '',
    manager: '',
    phone: '',
    isDefault: false,
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) => apiClient.post('/api/warehouses', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      setShowForm(false);
      setForm({ name: '', code: '', address: '', manager: '', phone: '', isDefault: false });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/warehouses/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['warehouses'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">
          <Building2 size={24} className="inline mr-2" />
          창고 관리
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
        >
          <Plus size={16} />
          창고 추가
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl p-6 border border-slate-200 space-y-4">
          <h3 className="font-semibold text-slate-900">새 창고 등록</h3>
          <div className="grid grid-cols-3 gap-4">
            <input
              placeholder="창고명 *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            />
            <input
              placeholder="코드 (WH-01)"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            />
            <input
              placeholder="주소"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            />
            <input
              placeholder="담당자"
              value={form.manager}
              onChange={(e) => setForm({ ...form, manager: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            />
            <input
              placeholder="연락처"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) =>
                  setForm({ ...form, isDefault: e.target.checked })
                }
              />
              기본 출고 창고
            </label>
          </div>
          <button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            등록
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {warehouses.map((w) => (
          <div
            key={w.id}
            className="bg-white rounded-xl border border-slate-200 p-5 space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900">{w.name}</h3>
                {w.isDefault && (
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                    <Star size={10} />
                    기본
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                <button className="p-1.5 hover:bg-slate-100 rounded">
                  <Edit2 size={14} className="text-slate-400" />
                </button>
                <button onClick={() => deleteMutation.mutate(w.id)} className="p-1.5 hover:bg-red-50 rounded">
                  <Trash2 size={14} className="text-red-400" />
                </button>
              </div>
            </div>
            {w.code && (
              <div className="font-mono text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded w-fit">
                {w.code}
              </div>
            )}
            <div className="space-y-1.5 text-xs text-slate-600">
              {w.address && (
                <div className="flex items-center gap-1.5">
                  <MapPin size={12} />
                  {w.address}
                </div>
              )}
              {w.manager && (
                <div className="flex items-center gap-1.5">
                  <User size={12} />
                  {w.manager}
                </div>
              )}
              {w.phone && (
                <div className="flex items-center gap-1.5">
                  <Phone size={12} />
                  {w.phone}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Package size={12} />
                출고 {w.shipmentCount}건
              </div>
            </div>
            <div
              className={cn('text-xs px-2 py-1 rounded w-fit', w.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500')}
            >
              {w.status === 'active' ? '운영중' : '비활성'}
            </div>
          </div>
        ))}
        {warehouses.length === 0 && (
          <div className="col-span-3 text-center py-12 text-slate-400">
            <Building2 size={48} className="mx-auto mb-3 opacity-30" />
            <p>등록된 창고가 없습니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
