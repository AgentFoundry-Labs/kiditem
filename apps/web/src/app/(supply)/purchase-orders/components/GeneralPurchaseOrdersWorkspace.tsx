'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { usePurchaseOrderSubmission } from '../hooks/usePurchaseOrderSubmission';
import { purchaseOrdersApi } from '../lib/purchase-orders-api';
import CreateOrderModal from './CreateOrderModal';
import { PurchaseOrderHeader } from './PurchaseOrderHeader';
import { PurchaseOrderKpiCards } from './PurchaseOrderKpiCards';
import { PurchaseOrderFilterTabs } from './PurchaseOrderFilterTabs';
import { PurchaseOrderTable } from './PurchaseOrderTable';
import { RocketPurchasePreviewSection } from './RocketPurchasePreviewSection';

export function GeneralPurchaseOrdersWorkspace({
  orderId,
  supplierId,
  headingLevel = 2,
  includeRocketPreview = false,
}: {
  orderId?: string;
  supplierId?: string;
  headingLevel?: 1 | 2;
  includeRocketPreview?: boolean;
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const PAGE_SIZE = 20;
  const submission = usePurchaseOrderSubmission();

  const { data: orderData, isLoading: loading, isFetching, error: queryError } = useQuery({
    queryKey: queryKeys.purchaseOrders.list({
      page: String(page),
      filter,
      ...(orderId ? { orderId } : {}),
      ...(supplierId ? { supplierId } : {}),
    }),
    queryFn: () => purchaseOrdersApi.list({
      page,
      limit: PAGE_SIZE,
      filter,
      orderId,
      supplierId,
    }),
    placeholderData: previousData => previousData,
  });
  const isRefreshing = isFetching && !loading;

  const orders = orderData?.items ?? [];
  const total = orderData?.total ?? 0;
  const counts = orderData?.counts ?? { all: 0, draft: 0, pending: 0, ordered: 0, shipped: 0, received: 0, cancelled: 0 };
  const error = queryError ? (isApiError(queryError) ? queryError.detail : '발주 데이터를 불러오는데 실패했습니다.') : null;

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      purchaseOrdersApi.updateStatus({
        purchaseOrderId: vars.id,
        status: vars.status,
      }),
    onMutate: (vars) => setActionLoading(vars.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all }),
    onError: (err) => toast.error(isApiError(err) ? err.detail : '상태 변경에 실패했습니다.'),
    onSettled: () => setActionLoading(null),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      purchaseOrdersApi.delete(id),
    onMutate: (id) => setActionLoading(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all }),
    onError: (err) => toast.error(isApiError(err) ? err.detail : '삭제에 실패했습니다.'),
    onSettled: () => setActionLoading(null),
  });

  const reconciliationMutation = useMutation({
    mutationFn: (vars: {
      id: string;
      outcome: 'provider_succeeded' | 'provider_failed';
    }) => purchaseOrdersApi.reconcile({
      purchaseOrderId: vars.id,
      outcome: vars.outcome,
    }),
    onMutate: (vars) => setActionLoading(vars.id),
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: queryKeys.purchaseOrders.all,
    }),
    onError: (err) => toast.error(
      isApiError(err) ? err.detail : '외부 주문 확인 반영에 실패했습니다.',
    ),
    onSettled: () => setActionLoading(null),
  });

  const handleStatusChange = (id: string, newStatus: string) => statusMutation.mutate({ id, status: newStatus });
  const handleDelete = (id: string) => {
    if (!confirm('이 발주를 삭제하시겠습니까?')) return;
    deleteMutation.mutate(id);
  };
  const handleSubmit = (id: string) => {
    void submission.submit(id).catch(() => undefined);
  };
  const handleReconcile = (
    id: string,
    outcome: 'provider_succeeded' | 'provider_failed',
  ) => {
    const message = outcome === 'provider_succeeded'
      ? '외부 주문이 실제로 생성되었음을 확인했습니까?'
      : '외부 주문이 생성되지 않았음을 확인했습니까?';
    if (!confirm(message)) return;
    reconciliationMutation.mutate({ id, outcome });
  };

  const totalAmount = orders.reduce((sum, o) => sum + parseFloat(o.totalAmountCny || '0'), 0);
  const waitingCount = counts.draft + counts.pending;

  const kpis = [
    { label: '대기중', value: waitingCount, dot: 'bg-yellow-400' },
    { label: '발주완료', value: counts.ordered, dot: 'bg-blue-400' },
    { label: '배송중', value: counts.shipped, dot: 'bg-purple-400' },
    { label: '입고완료', value: counts.received, dot: 'bg-green-400' },
  ];

  const tabs = [
    { key: 'all', label: '전체', count: counts.all },
    { key: 'waiting', label: '대기', count: waitingCount },
    { key: 'ordered', label: '발주완료', count: counts.ordered },
    { key: 'shipped', label: '배송중', count: counts.shipped },
    { key: 'received', label: '입고완료', count: counts.received },
  ];

  const refreshData = () => queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={refreshData} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}
      <PurchaseOrderHeader
        headingLevel={headingLevel}
        total={total}
        totalAmountCny={totalAmount}
        onRefresh={refreshData}
        onCreateOrder={() => setShowCreateModal(true)}
      />
      {includeRocketPreview ? <RocketPurchasePreviewSection /> : null}
      {isRefreshing && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm" aria-live="polite">
          <RefreshCw size={14} className="animate-spin text-purple-600" />
          발주 목록을 갱신 중입니다.
        </div>
      )}
      <div className="space-y-4" aria-busy={isRefreshing}>
      <PurchaseOrderKpiCards kpis={kpis} />
      <PurchaseOrderFilterTabs filter={filter} tabs={tabs} onFilterChange={setFilter} />
      <PurchaseOrderTable
        orders={orders}
        loading={loading && !orderData}
        actionLoading={submission.submittingId ?? actionLoading}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        selectedOrderId={orderId}
        onPageChange={setPage}
        onStatusChange={handleStatusChange}
        onSubmit={handleSubmit}
        onReconcile={handleReconcile}
        onDelete={handleDelete}
      />
      </div>
      {showCreateModal && (
        <CreateOrderModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            refreshData();
          }}
        />
      )}
    </div>
  );
}
