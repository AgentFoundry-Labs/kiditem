'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Plus, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatDateTime, formatNumber } from '@/lib/utils';
import SellpiaMasterProductPicker from './SellpiaMasterProductPicker';

interface StockTransfer {
  id: string;
  sellpiaInventorySkuId: string;
  quantity: number;
  status: string;
  notes: string | null;
  createdAt: string;
  sellpiaInventorySku: {
    id: string;
    code: string;
    name: string;
    optionName: string | null;
    barcode: string | null;
  } | null;
  fromWarehouse: { id: string; name: string };
  toWarehouse: { id: string; name: string };
}

interface Warehouse { id: string; name: string; code: string | null }

const EMPTY_FORM = {
  sellpiaInventorySkuId: '',
  fromWarehouseId: '',
  toWarehouseId: '',
  quantity: 1,
  notes: '',
};

export default function StockTransfers({ readOnly = false }: { readOnly?: boolean }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const { data: transfers = [], isLoading } = useQuery({
    queryKey: queryKeys.stockTransfers.all,
    queryFn: () => apiClient.get<StockTransfer[]>('/api/stock-transfers'),
  });
  const { data: warehouses = [] } = useQuery({
    queryKey: queryKeys.warehouses.all,
    queryFn: () => apiClient.get<Warehouse[]>('/api/warehouses'),
    enabled: !readOnly,
  });
  const create = useMutation({
    mutationFn: () => apiClient.post('/api/stock-transfers', form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.stockTransfers.all });
      setForm(EMPTY_FORM);
      setShowForm(false);
    },
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><ArrowRightLeft className="h-5 w-5" aria-hidden="true" /> 창고 이관 기록</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">물리 Sellpia SKU의 이동을 기록합니다. 완료 처리도 Sellpia 현재고는 변경하지 않습니다.</p>
        </div>
        {!readOnly ? <button type="button" onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4" aria-hidden="true" /> 이관 기록 추가</button> : null}
      </div>
      {isLoading ? <p className="py-10 text-center text-[var(--text-secondary)]">불러오는 중...</p> : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="overflow-x-auto"><table className="w-full min-w-[820px]"><thead><tr><th>Sellpia SKU</th><th>이동</th><th className="text-right">수량</th><th>상태</th><th>기록 시각</th></tr></thead><tbody>{transfers.length ? transfers.map((transfer) => <tr key={transfer.id}><td>{transfer.sellpiaInventorySku ? <><p className="font-medium">{transfer.sellpiaInventorySku.name}</p><p className="font-mono text-xs text-[var(--text-secondary)]">{transfer.sellpiaInventorySku.code} · {transfer.sellpiaInventorySku.optionName ?? '옵션 없음'}</p></> : <><p className="font-medium">상품 연결 없음</p><p className="font-mono text-xs text-[var(--text-secondary)]">Sellpia SKU ID: {transfer.sellpiaInventorySkuId}</p></>}</td><td>{transfer.fromWarehouse.name} → {transfer.toWarehouse.name}</td><td className="text-right">{formatNumber(transfer.quantity)}개</td><td>{transfer.status}</td><td className="text-sm text-[var(--text-secondary)]">{formatDateTime(transfer.createdAt)}</td></tr>) : <tr><td colSpan={5} className="py-12 text-center text-[var(--text-secondary)]">이관 기록이 없습니다.</td></tr>}</tbody></table></div>
        </div>
      )}
      {!readOnly && showForm ? (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content max-w-lg" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold">이관 기록 추가</h3><button type="button" aria-label="닫기" onClick={() => setShowForm(false)}><X className="h-5 w-5" /></button></div>
            <div className="space-y-4">
              <SellpiaMasterProductPicker value={form.sellpiaInventorySkuId} onChange={(sellpiaInventorySkuId) => setForm((current) => ({ ...current, sellpiaInventorySkuId }))} label="Sellpia 재고 상품" />
              <div className="grid grid-cols-2 gap-3">
                <WarehouseSelect label="출발 창고" value={form.fromWarehouseId} warehouses={warehouses} onChange={(fromWarehouseId) => setForm((current) => ({ ...current, fromWarehouseId }))} />
                <WarehouseSelect label="도착 창고" value={form.toWarehouseId} warehouses={warehouses} onChange={(toWarehouseId) => setForm((current) => ({ ...current, toWarehouseId }))} />
              </div>
              <label className="block text-sm font-medium">수량<input type="number" min={1} value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: Number(event.target.value) }))} className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2" /></label>
              <label className="block text-sm font-medium">메모<input value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2" /></label>
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">이 기록을 저장해도 Sellpia 현재고는 변경하지 않습니다.</p>
            </div>
            <div className="mt-5 flex justify-end"><button type="button" disabled={create.isPending} onClick={() => create.mutate()} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">기록 저장</button></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function WarehouseSelect({ label, value, warehouses, onChange }: { label: string; value: string; warehouses: Warehouse[]; onChange: (value: string) => void }) {
  return <label className="block text-sm font-medium">{label}<select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2"><option value="">선택</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.code ? ` (${warehouse.code})` : ''}</option>)}</select></label>;
}
