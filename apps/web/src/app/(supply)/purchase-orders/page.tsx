'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ChannelAccountListItemSchema } from '@kiditem/shared/channel-account';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import CreateOrderModal from './components/CreateOrderModal';
import { PurchaseOrderHeader } from './components/PurchaseOrderHeader';
import { PurchaseOrderKpiCards } from './components/PurchaseOrderKpiCards';
import { PurchaseOrderFilterTabs } from './components/PurchaseOrderFilterTabs';
import { PurchaseOrderTable } from './components/PurchaseOrderTable';
import { RocketPurchaseWorkspace } from './components/RocketPurchaseWorkspace';
import { purchaseOrdersApi } from './lib/purchase-orders-api';
import { usePurchaseOrderSubmission } from './hooks/usePurchaseOrderSubmission';

const ChannelAccountListSchema = z.array(ChannelAccountListItemSchema);

export default function PurchaseOrdersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRocketAccountId, setSelectedRocketAccountId] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const PAGE_SIZE = 20;
  const submission = usePurchaseOrderSubmission();

  const rocketAccountsQuery = useQuery({
    queryKey: queryKeys.channelAccounts.active(),
    queryFn: () => apiClient.getParsed('/api/channels/accounts', ChannelAccountListSchema),
  });
  const rocketAccounts = (rocketAccountsQuery.data ?? [])
    .filter((account) => account.channel === 'rocket');
  const selectedRocketAccount = rocketAccounts.find(
    ({ id }) => id === selectedRocketAccountId,
  ) ?? rocketAccounts[0] ?? null;

  const { data: orderData, isLoading: loading, isFetching, error: queryError } = useQuery({
    queryKey: queryKeys.purchaseOrders.list({ page: String(page), filter }),
    queryFn: () => purchaseOrdersApi.list({ page, limit: PAGE_SIZE, filter }),
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
        total={total}
        totalAmountCny={totalAmount}
        onRefresh={refreshData}
        onCreateOrder={() => setShowCreateModal(true)}
      />
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h2 className="font-bold text-slate-900">쿠팡 로켓 발주 미리보기</h2>
          <p className="text-sm text-slate-500">
            활성 로켓 계정을 선택하고 Sellpia 최신 재고 기준 검토수량을 계산합니다.
          </p>
        </div>
        {selectedRocketAccount ? (
          <>
            <label className="block max-w-md space-y-1 text-sm font-semibold text-slate-600">
              <span>로켓 채널 계정</span>
              <select
                aria-label="로켓 채널 계정"
                value={selectedRocketAccount.id}
                onChange={(event) => setSelectedRocketAccountId(event.target.value)}
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              >
                {rocketAccounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </label>
            <RocketPurchaseWorkspace
              key={selectedRocketAccount.id}
              channelAccountId={selectedRocketAccount.id}
            />
          </>
        ) : rocketAccountsQuery.isLoading ? (
          <p className="text-sm text-slate-500">로켓 계정을 불러오는 중입니다.</p>
        ) : (
          <p className="text-sm text-amber-700">활성 로켓 채널 계정이 없습니다.</p>
        )}
      </section>
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
