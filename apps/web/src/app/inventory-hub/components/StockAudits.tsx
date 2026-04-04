'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardCheck,
  Plus,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Save,
  Eye,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface AuditItem {
  productId: string;
  productName: string;
  sku: string | null;
  systemQty: number;
  actualQty: number;
  diff: number;
}

interface StockAudit {
  id: string;
  auditNumber: string;
  status: string;
  totalItems: number;
  diffItems: number;
  createdAt: string;
  completedAt: string | null;
  items: AuditItem[];
}

const statusConfig: Record<string, { text: string; color: string }> = {
  in_progress: { text: '진행중', color: 'bg-blue-100 text-blue-700' },
  completed: { text: '완료', color: 'bg-green-100 text-green-700' },
  cancelled: { text: '취소', color: 'bg-red-100 text-red-700' },
};

export default function StockAudits() {
  const queryClient = useQueryClient();

  const { data: audits = [], isLoading } = useQuery({
    queryKey: ['stock-audits'],
    queryFn: () => apiClient.get<StockAudit[]>('/api/stock-audits'),
  });

  const [selected, setSelected] = useState<StockAudit | null>(null);
  const [editItems, setEditItems] = useState<AuditItem[]>([]);

  const createMutation = useMutation({
    mutationFn: () => apiClient.post<StockAudit>('/api/stock-audits'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stock-audits'] }),
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, items }: { id: string; items: AuditItem[] }) =>
      apiClient.patch(`/api/stock-audits/${id}`, { status: 'completed', items }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-audits'] });
      setSelected(null);
    },
  });

  const completing = completeMutation.isPending;

  const handleSelect = (audit: StockAudit) => {
    setSelected(audit);
    setEditItems(audit.items.map((item) => ({ ...item })));
  };

  const handleActualQtyChange = (productId: string, value: number) => {
    setEditItems((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? { ...item, actualQty: value, diff: value - item.systemQty }
          : item
      )
    );
  };

  const diffCount = editItems.filter((i) => i.diff !== 0).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">
          <ClipboardCheck size={24} className="inline mr-2" />
          재고 실사 + 차이 조정
        </h1>
        <div className="flex gap-2">
          <button className="flex items-center gap-1 px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">
            <RefreshCw size={14} />
            새로고침
          </button>
          <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
            <Plus size={16} />
            새 실사 시작
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* 실사 목록 */}
        <div className="col-span-4 space-y-3">
          <h2 className="font-semibold text-slate-700 text-sm">
            실사 내역 ({audits.length})
          </h2>
          {isLoading ? (
            <div className="text-center py-8 text-slate-400 text-sm">로딩 중...</div>
          ) : audits.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              실사 내역이 없습니다
            </div>
          ) : (
            audits
              .sort(
                (a, b) =>
                  new Date(b.createdAt).getTime() -
                  new Date(a.createdAt).getTime()
              )
              .map((audit) => (
                <div
                  key={audit.id}
                  onClick={() => handleSelect(audit)}
                  className={`bg-white rounded-xl border border-slate-200 p-4 cursor-pointer transition-all ${
                    selected?.id === audit.id
                      ? 'ring-2 ring-blue-500'
                      : 'hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm font-semibold">
                      {audit.auditNumber || audit.id.slice(0, 8)}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        statusConfig[audit.status]?.color ||
                        'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {statusConfig[audit.status]?.text || audit.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{audit.totalItems}개 상품</span>
                    {audit.diffItems > 0 && (
                      <span className="text-red-600 font-medium flex items-center gap-1">
                        <AlertTriangle size={10} />
                        차이 {audit.diffItems}건
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {new Date(audit.createdAt).toLocaleString('ko-KR')}
                  </div>
                </div>
              ))
          )}
        </div>

        {/* 실사표 상세 */}
        <div className="col-span-8">
          {selected ? (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold">
                    {selected.auditNumber || selected.id.slice(0, 8)}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      statusConfig[selected.status]?.color || 'bg-slate-100'
                    }`}
                  >
                    {statusConfig[selected.status]?.text || selected.status}
                  </span>
                  {diffCount > 0 && (
                    <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                      <AlertTriangle size={12} />
                      차이 {diffCount}건
                    </span>
                  )}
                </div>
                {selected.status === 'in_progress' && (
                  <button
                    disabled={completing}
                    onClick={() => completeMutation.mutate({ id: selected.id, items: editItems })}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    {completing ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Save size={14} />
                    )}
                    실사 완료 (재고 조정)
                  </button>
                )}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">
                      상품명
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">
                      SKU
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">
                      시스템 수량
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">
                      실제 수량
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">
                      차이
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {editItems.map((item) => (
                    <tr
                      key={item.productId}
                      className={
                        item.diff !== 0 ? 'bg-red-50/50' : 'hover:bg-slate-50'
                      }
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 max-w-[200px] truncate">
                        {item.productName}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {item.sku || '-'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                        {item.systemQty}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {selected.status === 'in_progress' ? (
                          <input
                            type="number"
                            min={0}
                            value={item.actualQty}
                            onChange={(e) =>
                              handleActualQtyChange(
                                item.productId,
                                Number(e.target.value)
                              )
                            }
                            className="w-20 px-2 py-1 border border-slate-300 rounded text-sm text-right tabular-nums"
                          />
                        ) : (
                          <span className="tabular-nums">{item.actualQty}</span>
                        )}
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums font-bold ${
                          item.diff !== 0 ? 'text-red-600' : 'text-green-600'
                        }`}
                      >
                        {item.diff > 0 ? '+' : ''}
                        {item.diff}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {editItems.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm">
                  실사 항목이 없습니다
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              <Eye size={48} className="mx-auto mb-3 opacity-30" />
              <p>실사를 선택하거나 새로 시작하세요</p>
              <p className="text-xs mt-1">
                모든 active 상품의 시스템 재고로 실사표가 자동 생성됩니다
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
