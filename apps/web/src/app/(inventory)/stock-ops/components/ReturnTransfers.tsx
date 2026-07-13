'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RotateCcw, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatDateTime, formatNumber } from '@/lib/utils';
import SellpiaMasterProductPicker from './SellpiaMasterProductPicker';

interface ReturnTransfer {
  id: string;
  rtNumber: string;
  masterProductId: string;
  quantity: number;
  status: string;
  condition: string;
  notes: string | null;
  createdAt: string;
  masterProduct: { sellpiaProductCode: string; name: string; optionName: string | null };
}

const EMPTY_FORM = { masterProductId: '', quantity: 1, condition: 'good', notes: '' };

export default function ReturnTransfers({ readOnly = false }: { readOnly?: boolean }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const { data: transfers = [], isLoading } = useQuery({
    queryKey: queryKeys.returnTransfers.all,
    queryFn: () => apiClient.get<ReturnTransfer[]>('/api/return-transfers'),
  });
  const create = useMutation({
    mutationFn: () => apiClient.post('/api/return-transfers', form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.returnTransfers.all });
      setForm(EMPTY_FORM);
      setShowForm(false);
    },
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><RotateCcw className="h-5 w-5" aria-hidden="true" /> 반품 기록</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">회수·검수 사실을 물리 Sellpia 상품에 기록합니다. Sellpia 반영 전까지 현재고는 바뀌지 않습니다.</p>
        </div>
        {!readOnly ? <button type="button" onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4" aria-hidden="true" /> 반품 기록 추가</button> : null}
      </div>
      {isLoading ? <p className="py-10 text-center text-[var(--text-secondary)]">불러오는 중...</p> : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"><div className="overflow-x-auto"><table className="w-full min-w-[820px]"><thead><tr><th>R/T 번호</th><th>Sellpia SKU</th><th className="text-right">수량</th><th>상태</th><th>품질</th><th>기록 시각</th></tr></thead><tbody>{transfers.length ? transfers.map((transfer) => <tr key={transfer.id}><td className="font-mono text-xs">{transfer.rtNumber}</td><td><p className="font-medium">{transfer.masterProduct.name}</p><p className="font-mono text-xs text-[var(--text-secondary)]">{transfer.masterProduct.sellpiaProductCode} · {transfer.masterProduct.optionName ?? '옵션 없음'}</p></td><td className="text-right">{formatNumber(transfer.quantity)}개</td><td>{transfer.status}</td><td>{transfer.condition}</td><td className="text-sm text-[var(--text-secondary)]">{formatDateTime(transfer.createdAt)}</td></tr>) : <tr><td colSpan={6} className="py-12 text-center text-[var(--text-secondary)]">반품 기록이 없습니다.</td></tr>}</tbody></table></div></div>
      )}
      {!readOnly && showForm ? (
        <div className="modal-overlay" onClick={() => setShowForm(false)}><div className="modal-content max-w-lg" onClick={(event) => event.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold">반품 기록 추가</h3><button type="button" aria-label="닫기" onClick={() => setShowForm(false)}><X className="h-5 w-5" /></button></div>
          <div className="space-y-4">
            <SellpiaMasterProductPicker value={form.masterProductId} onChange={(masterProductId) => setForm((current) => ({ ...current, masterProductId }))} label="Sellpia 반품 상품" />
            <label className="block text-sm font-medium">수량<input type="number" min={1} value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: Number(event.target.value) }))} className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2" /></label>
            <label className="block text-sm font-medium">품질<select value={form.condition} onChange={(event) => setForm((current) => ({ ...current, condition: event.target.value }))} className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2"><option value="good">양호</option><option value="damaged">파손</option><option value="defective">불량</option></select></label>
            <label className="block text-sm font-medium">메모<input value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2" /></label>
          </div>
          <div className="mt-5 flex justify-end"><button type="button" disabled={create.isPending} onClick={() => create.mutate()} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">기록 저장</button></div>
        </div></div>
      ) : null}
    </section>
  );
}
