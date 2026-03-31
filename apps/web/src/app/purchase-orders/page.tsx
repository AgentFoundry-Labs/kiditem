'use client';

import { useEffect, useState, useCallback } from 'react';
import { Package, RefreshCw, Plus, Trash2, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { formatKRW } from '@/lib/utils';
import { Pagination } from '@/components/ui/Pagination';

interface PurchaseOrderItem {
  id: string;
  productName: string;
  quantity: number;
  unitPriceCny: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface PurchaseOrder {
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

const STATUS_MAP: Record<string, { label: string; color: string; dot: string }> = {
  draft: { label: '임시저장', color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
  pending: { label: '대기', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-400' },
  ordered: { label: '발주완료', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-400' },
  shipped: { label: '배송중', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-400' },
  received: { label: '입고완료', color: 'bg-green-100 text-green-700', dot: 'bg-green-400' },
  cancelled: { label: '취소', color: 'bg-red-100 text-red-700', dot: 'bg-red-400' },
};

const TRANSITION_LABELS: Record<string, string> = {
  pending: '발주대기',
  ordered: '발주확정',
  shipped: '배송시작',
  received: '입고완료',
};

const NEXT_STATUS: Record<string, string> = {
  draft: 'pending',
  pending: 'ordered',
  ordered: 'shipped',
  shipped: 'received',
};

const DEFAULT_ITEM = { productName: '', quantity: 1, unitPriceCny: '' };

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Counts>({
    all: 0, draft: 0, pending: 0, ordered: 0, shipped: 0, received: 0, cancelled: 0,
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const PAGE_SIZE = 20;

  const fetchOrders = useCallback(async (p: number, f: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: String(PAGE_SIZE),
      });
      const backendStatus = f === 'all' || f === 'waiting' ? undefined : f;
      if (backendStatus) params.set('status', backendStatus);

      const data = await apiClient.get<{
        items: PurchaseOrder[];
        counts?: Counts;
        total?: number;
      }>(`/api/purchase-orders?${params}`);
      let fetchedItems: PurchaseOrder[] = data.items || [];

      if (f === 'waiting') {
        fetchedItems = fetchedItems.filter(
          (o) => o.status === 'draft' || o.status === 'pending',
        );
      }

      setOrders(fetchedItems);
      if (data.counts) setCounts(data.counts);

      const waitingTotal = (data.counts?.draft || 0) + (data.counts?.pending || 0);
      setTotal(f === 'waiting' ? waitingTotal : (data.total || 0));
      setError(null);
    } catch (err) {
      setError(isApiError(err) ? err.detail : '발주 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    fetchOrders(1, filter);
  }, [filter, fetchOrders]);

  useEffect(() => {
    fetchOrders(page, filter);
  }, [page, fetchOrders, filter]);

  const postAction = async (body: Record<string, unknown>) => {
    return apiClient.post<unknown>('/api/purchase-orders', body);
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    setActionLoading(id);
    try {
      await postAction({ action: 'updateStatus', id, status: newStatus });
      fetchOrders(page, filter);
    } catch (err) {
      alert(isApiError(err) ? err.detail : '상태 변경에 실패했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 발주를 삭제하시겠습니까?')) return;
    setActionLoading(id);
    try {
      await postAction({ action: 'delete', id });
      fetchOrders(page, filter);
    } catch (err) {
      alert(isApiError(err) ? err.detail : '삭제에 실패했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  const totalAmount = orders.reduce(
    (sum, o) => sum + parseFloat(o.totalAmountCny || '0'),
    0,
  );

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

  const refreshData = () => fetchOrders(page, filter);

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package size={20} className="text-purple-500" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">발주 관리</h1>
            <p className="text-sm text-gray-500">
              {total}건 · 총 {formatKRW(totalAmount)} CNY
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200"
          >
            <RefreshCw size={14} />
            새로고침
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            <Plus size={14} />
            발주 등록
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white rounded-lg border border-gray-200 p-4"
          >
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2 h-2 rounded-full ${kpi.dot}`} />
              <span className="text-sm text-gray-500">{kpi.label}</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{kpi.value}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              filter === tab.key
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="animate-pulse space-y-2 py-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="py-20 text-center">
          <Package size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">발주 내역이 없습니다</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>상태</th>
                  <th>공급업체</th>
                  <th>품목</th>
                  <th className="text-right">총금액 (CNY)</th>
                  <th>발주일</th>
                  <th>입고예정일</th>
                  <th>트래킹번호</th>
                  <th>액션</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const statusInfo = STATUS_MAP[order.status] || {
                    label: order.status,
                    color: 'bg-gray-100 text-gray-700',
                    dot: 'bg-gray-400',
                  };
                  const nextStatus = NEXT_STATUS[order.status];
                  const canDelete =
                    order.status === 'draft' || order.status === 'pending';
                  const isActioning = actionLoading === order.id;

                  return (
                    <tr key={order.id}>
                      <td>
                        <span
                          className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="font-medium text-gray-900">
                        {order.supplier?.name || order.supplierName}
                      </td>
                      <td className="text-sm text-gray-600 max-w-[200px] truncate">
                        {order.items.length > 0
                          ? order.items
                              .map((i) => `${i.productName}(${i.quantity})`)
                              .join(', ')
                          : '-'}
                      </td>
                      <td className="text-right tabular-nums font-semibold">
                        {formatKRW(parseFloat(order.totalAmountCny))}
                      </td>
                      <td className="text-sm text-gray-500 tabular-nums">
                        {new Date(order.orderDate).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="text-sm text-gray-500 tabular-nums">
                        {order.expectedDeliveryDate
                          ? new Date(order.expectedDeliveryDate).toLocaleDateString('ko-KR')
                          : '-'}
                      </td>
                      <td className="text-sm text-gray-500 font-mono">
                        {order.trackingNumber || '-'}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          {nextStatus && (
                            <button
                              onClick={() => handleStatusChange(order.id, nextStatus)}
                              disabled={isActioning}
                              className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded disabled:opacity-50"
                            >
                              {isActioning ? '...' : TRANSITION_LABELS[nextStatus]}
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(order.id)}
                              disabled={isActioning}
                              className="p-1 text-gray-400 hover:text-red-500 rounded disabled:opacity-50"
                              title="삭제"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            limit={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </div>
      )}

      {showCreateModal && (
        <CreateModal
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

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [supplierName, setSupplierName] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [items, setItems] = useState([{ ...DEFAULT_ITEM }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const addItem = () => setItems([...items, { ...DEFAULT_ITEM }]);

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (
    index: number,
    field: keyof typeof DEFAULT_ITEM,
    value: string | number,
  ) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleSubmit = async () => {
    setError('');
    if (!supplierName.trim()) {
      setError('공급업체명을 입력하세요');
      return;
    }
    const validItems = items.filter(
      (i) => i.productName.trim() && Number(i.quantity) > 0 && parseFloat(i.unitPriceCny) > 0,
    );
    if (validItems.length === 0) {
      setError('유효한 품목을 1개 이상 추가하세요');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/api/purchase-orders', {
        action: 'create',
        companyId: '00000000-0000-0000-0000-000000000000',
        supplierName: supplierName.trim(),
        expectedDeliveryDate: expectedDate || undefined,
        items: validItems.map((i) => ({
          productName: i.productName.trim(),
          quantity: Number(i.quantity),
          unitPriceCny: parseFloat(i.unitPriceCny),
        })),
      });
      onCreated();
    } catch (err) {
      setError(isApiError(err) ? err.detail : '발주 생성에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const calculatedTotal = items.reduce((sum, i) => {
    const qty = Number(i.quantity) || 0;
    const price = parseFloat(i.unitPriceCny) || 0;
    return sum + qty * price;
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">발주 등록</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              공급업체명
            </label>
            <input
              type="text"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="예: 이우 XX무역"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">품목</label>
              <button
                onClick={addItem}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
              >
                <Plus size={12} /> 품목 추가
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={item.productName}
                    onChange={(e) => updateItem(idx, 'productName', e.target.value)}
                    placeholder="상품명"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                    placeholder="수량"
                    min={1}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  <input
                    type="number"
                    value={item.unitPriceCny}
                    onChange={(e) => updateItem(idx, 'unitPriceCny', e.target.value)}
                    placeholder="단가(CNY)"
                    step="0.01"
                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  {items.length > 1 && (
                    <button
                      onClick={() => removeItem(idx)}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {calculatedTotal > 0 && (
              <div className="text-right text-sm text-gray-500 mt-1">
                합계: {formatKRW(calculatedTotal)} CNY
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              입고예정일
            </label>
            <input
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? '생성 중...' : '발주 등록'}
          </button>
        </div>
      </div>
    </div>
  );
}
