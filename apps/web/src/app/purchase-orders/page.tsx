'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import CreateOrderModal from './components/CreateOrderModal';
import { PurchaseOrderHeader } from './components/PurchaseOrderHeader';
import { PurchaseOrderKpiCards } from './components/PurchaseOrderKpiCards';
import { PurchaseOrderFilterTabs } from './components/PurchaseOrderFilterTabs';
import { PurchaseOrderTable } from './components/PurchaseOrderTable';

export interface PurchaseOrderItem {
  id: string;
  productName: string;
  quantity: number;
  unitPriceCny: string;
}

export interface Supplier {
  id: string;
  name: string;
}

export interface PurchaseOrder {
  id: string;
  supplierName: string;
  totalAmountCny: string;
  status: string;
  orderDate: string;
  expectedDeliveryDate: string | null;
  trackingNumber: string | null;
  items: PurchaseOrderItem[];
  supplier: Supplier | null;
}

interface Counts {
  all: number;
  draft: number;
  pending: number;
  ordered: number;
  shipped: number;
  received: number;
  cancelled: number;
}

export default function PurchaseOrdersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const PAGE_SIZE = 20;

  const { data: orderData, isLoading: loading, error: queryError } = useQuery({
    queryKey: queryKeys.purchaseOrders.list({ page: String(page), filter }),
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      const backendStatus = filter === 'all' || filter === 'waiting' ? undefined : filter;
      if (backendStatus) params.set('status', backendStatus);

      const data = await apiClient.get<{ items: PurchaseOrder[]; counts?: Counts; total?: number }>(
        `/api/purchase-orders?${params}`,
      );
      let fetchedItems: PurchaseOrder[] = data.items || [];

      if (filter === 'waiting') {
        fetchedItems = fetchedItems.filter((o) => o.status === 'draft' || o.status === 'pending');
      }

      const counts = data.counts || { all: 0, draft: 0, pending: 0, ordered: 0, shipped: 0, received: 0, cancelled: 0 };
      const waitingTotal = (counts.draft || 0) + (counts.pending || 0);
      const total = filter === 'waiting' ? waitingTotal : (data.total || 0);

      return { items: fetchedItems, counts, total };
    },
  });

  const orders = orderData?.items ?? [];
  const total = orderData?.total ?? 0;
  const counts = orderData?.counts ?? { all: 0, draft: 0, pending: 0, ordered: 0, shipped: 0, received: 0, cancelled: 0 };
  const error = queryError ? (isApiError(queryError) ? queryError.detail : '발주 데이터를 불러오는데 실패했습니다.') : null;

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      apiClient.post<unknown>('/api/purchase-orders', { action: 'updateStatus', id: vars.id, status: vars.status }),
    onMutate: (vars) => setActionLoading(vars.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all }),
    onError: (err) => toast.error(isApiError(err) ? err.detail : '상태 변경에 실패했습니다.'),
    onSettled: () => setActionLoading(null),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiClient.post<unknown>('/api/purchase-orders', { action: 'delete', id }),
    onMutate: (id) => setActionLoading(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all }),
    onError: (err) => toast.error(isApiError(err) ? err.detail : '삭제에 실패했습니다.'),
    onSettled: () => setActionLoading(null),
  });

  const handleStatusChange = (id: string, newStatus: string) => statusMutation.mutate({ id, status: newStatus });
  const handleDelete = (id: string) => {
    if (!confirm('이 발주를 삭제하시겠습니까?')) return;
    deleteMutation.mutate(id);
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
      <PurchaseOrderKpiCards kpis={kpis} />
      <PurchaseOrderFilterTabs filter={filter} tabs={tabs} onFilterChange={setFilter} />
      <PurchaseOrderTable
        orders={orders}
        loading={loading}
        actionLoading={actionLoading}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        onStatusChange={handleStatusChange}
        onDelete={handleDelete}
      />
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
