'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck, Plus, Phone, Mail, MapPin, Clock, Edit2, Trash2, Package } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  leadTimeDays: number;
  paymentTerms: string | null;
  notes: string | null;
  status: string;
  productCount: number;
}

export default function SuppliersPage() {
  const queryClient = useQueryClient();

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => apiClient.get<Supplier[]>('/api/suppliers'),
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', contactName: '', phone: '', email: '', address: '', leadTimeDays: 7, paymentTerms: '', notes: '' });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) => apiClient.post('/api/suppliers', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setShowForm(false);
      setForm({ name: '', contactName: '', phone: '', email: '', address: '', leadTimeDays: 7, paymentTerms: '', notes: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/suppliers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title"><Truck size={24} className="inline mr-2" />매입처 관리</h1>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"><Plus size={16} />매입처 추가</button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl p-6 border border-slate-200 space-y-4">
          <h3 className="font-semibold text-slate-900">새 매입처 등록</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <input placeholder="업체명 *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
            <input placeholder="담당자" value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
            <input placeholder="연락처" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
            <input placeholder="이메일" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
            <input placeholder="주소" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
            <input placeholder="리드타임(일)" type="number" value={form.leadTimeDays} onChange={e => setForm({ ...form, leadTimeDays: Number(e.target.value) })} className="px-3 py-2 border rounded-lg text-sm" />
            <input placeholder="결제조건 (월말정산 등)" value={form.paymentTerms} onChange={e => setForm({ ...form, paymentTerms: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
            <input placeholder="메모" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="px-3 py-2 border rounded-lg text-sm col-span-2" />
          </div>
          <button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">등록</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {suppliers.map(s => (
          <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{s.name}</h3>
                {s.contactName && <p className="text-xs text-slate-500 mt-0.5">담당: {s.contactName}</p>}
              </div>
              <div className="flex gap-1">
                <button className="p-1.5 hover:bg-slate-100 rounded"><Edit2 size={14} className="text-slate-400" /></button>
                <button onClick={() => deleteMutation.mutate(s.id)} className="p-1.5 hover:bg-red-50 rounded"><Trash2 size={14} className="text-red-400" /></button>
              </div>
            </div>
            <div className="space-y-1.5 text-xs text-slate-600">
              {s.phone && <div className="flex items-center gap-1.5"><Phone size={12} />{s.phone}</div>}
              {s.email && <div className="flex items-center gap-1.5"><Mail size={12} />{s.email}</div>}
              {s.address && <div className="flex items-center gap-1.5"><MapPin size={12} />{s.address}</div>}
              <div className="flex items-center gap-1.5"><Clock size={12} />리드타임 {s.leadTimeDays}일</div>
              <div className="flex items-center gap-1.5"><Package size={12} />공급 상품 {s.productCount}종</div>
            </div>
            {s.paymentTerms && <div className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">{s.paymentTerms}</div>}
          </div>
        ))}
        {suppliers.length === 0 && <div className="col-span-3 text-center py-12 text-slate-400">등록된 매입처가 없습니다. 위 버튼으로 추가하세요.</div>}
      </div>
    </div>
  );
}
