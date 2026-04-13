'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList,
  Play,
  CheckCircle,
  ScanBarcode,
  MapPin,
  Package,
  Clock,
  RefreshCw,
  Link2,
  Scissors,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

interface PickingItem {
  id: string;
  productName: string;
  sku: string | null;
  quantity: number;
  location: string | null;
  isPicked: boolean;
  isVerified: boolean;
}

interface PickingList {
  id: string;
  listNumber: string;
  status: string;
  totalItems: number;
  pickedItems: number;
  assignedTo: string | null;
  createdAt: string;
  items: PickingItem[];
}

const statusLabel: Record<string, { text: string; color: string }> = {
  pending: { text: '대기', color: 'bg-slate-100 text-slate-700' },
  picking: { text: '피킹중', color: 'bg-blue-100 text-blue-700' },
  verifying: { text: '검수중', color: 'bg-yellow-100 text-yellow-700' },
  completed: { text: '완료', color: 'bg-green-100 text-green-700' },
};

export default function SmartPicking() {
  const queryClient = useQueryClient();

  const { data: lists = [] } = useQuery({
    queryKey: queryKeys.picking.all,
    queryFn: () => apiClient.get<PickingList[]>('/api/picking'),
  });

  const [selected, setSelected] = useState<PickingList | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [bundleResult, setBundleResult] = useState<any>(null);

  const generateMutation = useMutation({
    mutationFn: () => apiClient.post<PickingList>('/api/picking/generate'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['picking'] }),
  });

  const pickItemMutation = useMutation({
    mutationFn: ({ listId, itemId }: { listId: string; itemId: string }) =>
      apiClient.patch(`/api/picking/${listId}/items/${itemId}`, { isPicked: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['picking'] }),
  });

  const verifyItemMutation = useMutation({
    mutationFn: ({ listId, itemId }: { listId: string; itemId: string }) =>
      apiClient.patch(`/api/picking/${listId}/items/${itemId}`, { isVerified: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['picking'] }),
  });

  const completeMutation = useMutation({
    mutationFn: (listId: string) => apiClient.patch(`/api/picking/${listId}/complete`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['picking'] }),
  });

  const pickItem = (itemId: string) => {
    if (selected) {
      pickItemMutation.mutate({ listId: selected.id, itemId });
      setSelected({
        ...selected,
        items: selected.items.map((i) =>
          i.id === itemId ? { ...i, isPicked: true } : i
        ),
        pickedItems: selected.pickedItems + 1,
      });
    }
  };

  const verifyItem = (itemId: string) => {
    if (selected) {
      verifyItemMutation.mutate({ listId: selected.id, itemId });
      setSelected({
        ...selected,
        items: selected.items.map((i) =>
          i.id === itemId ? { ...i, isVerified: true } : i
        ),
      });
    }
  };

  const activeList = selected || lists.find((l) => l.status !== 'completed');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">
          <ClipboardList size={24} className="inline mr-2" />
          스마트 피킹
        </h1>
        <div className="flex gap-2">
          <button className="flex items-center gap-1 px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">
            <RefreshCw size={14} />
            새로고침
          </button>
          <button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium disabled:opacity-50">
            <Play size={16} />
            피킹리스트 생성
          </button>
        </div>
      </div>

      {/* 워크플로우 안내 */}
      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">
              1
            </div>
            <span>피킹리스트 생성</span>
          </div>
          <span className="text-blue-300">&rarr;</span>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">
              2
            </div>
            <span>위치순 피킹</span>
          </div>
          <span className="text-blue-300">&rarr;</span>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">
              3
            </div>
            <span>바코드 검수</span>
          </div>
          <span className="text-blue-300">&rarr;</span>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold">
              4
            </div>
            <span>출고 완료</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* 피킹 리스트 목록 */}
        <div className="col-span-4 space-y-3">
          <h2 className="font-semibold text-slate-700 text-sm">
            피킹 리스트 ({lists.length})
          </h2>
          {lists.map((l) => (
            <div
              key={l.id}
              onClick={() => setSelected(l)}
              className={cn('card cursor-pointer transition-all', selected?.id === l.id ? 'ring-2 ring-blue-500' : 'hover:border-blue-300')}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm font-semibold">
                  {l.listNumber}
                </span>
                <span
                  className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusLabel[l.status]?.color || 'bg-slate-100 text-slate-600')}
                >
                  {statusLabel[l.status]?.text || l.status}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{l.totalItems}건</span>
                <span>
                  피킹 {l.pickedItems}/{l.totalItems}
                </span>
              </div>
              <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all"
                  style={{
                    width: `${
                      l.totalItems > 0
                        ? (l.pickedItems / l.totalItems) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          ))}
          {lists.length === 0 && (
            <div className="empty-state">
              피킹 리스트가 없습니다
            </div>
          )}
        </div>

        {/* 피킹 상세 */}
        <div className="col-span-8">
          {activeList ? (
            <div className="table-card">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div>
                  <span className="font-mono font-semibold">
                    {activeList.listNumber}
                  </span>
                  <span
                    className={cn('ml-2 text-xs px-2 py-0.5 rounded-full', statusLabel[activeList.status]?.color)}
                  >
                    {statusLabel[activeList.status]?.text}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-600 text-white text-xs rounded-md hover:bg-purple-700 font-mono">
                    <Link2 size={12} /> 묶음배송
                  </button>
                  <div className="text-sm text-slate-500 flex items-center gap-1">
                    <Clock size={14} />
                    {new Date(activeList.createdAt).toLocaleString('ko-KR')}
                  </div>
                </div>
              </div>

              {/* 묶음배송 결과 */}
              {bundleResult && (
                <div className="p-3 bg-purple-50 border-b border-purple-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-purple-800 flex items-center gap-1">
                      <Link2 size={12} /> 묶음배송 분석
                    </span>
                    <button
                      onClick={() => setBundleResult(null)}
                      className="text-xs text-purple-500 hover:text-purple-700"
                    >
                      닫기
                    </button>
                  </div>
                  <p className="text-xs text-purple-700 mb-2">
                    {bundleResult.message}
                  </p>
                  {bundleResult.bundleGroups?.length > 0 && (
                    <div className="space-y-2">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {bundleResult.bundleGroups.map((g: any, i: number) => (
                        <div
                          key={i}
                          className="bg-white rounded-lg p-2.5 border border-purple-200"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-purple-900">
                              {g.receiverName} ({g.orderCount}건 &rarr; 1건 묶음)
                            </span>
                            <span className="text-purple-500 font-mono">
                              {g.totalQty}개
                            </span>
                          </div>
                          <div className="text-[10px] text-purple-400 mt-0.5 truncate">
                            {g.receiverAddr}
                          </div>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {g.items.map((item: any) => (
                              <span
                                key={item.id}
                                className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded"
                              >
                                {item.productName.slice(0, 15)}... x
                                {item.quantity}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div >
                {activeList.items
                  .sort((a, b) =>
                    (a.location || 'ZZ').localeCompare(b.location || 'ZZ')
                  )
                  .map((item) => (
                    <div
                      key={item.id}
                      className={cn('p-4 flex items-center gap-4', item.isVerified ? 'bg-green-50/50' : item.isPicked ? 'bg-blue-50/50' : '')}
                    >
                      <div className="flex-1">
                        <div className="font-medium text-sm text-slate-900">
                          {item.productName}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                          {item.sku && (
                            <span className="font-mono">{item.sku}</span>
                          )}
                          <span className="flex items-center gap-0.5">
                            <MapPin size={10} />
                            {item.location || '미지정'}
                          </span>
                          <span className="flex items-center gap-0.5">
                            <Package size={10} />
                            {item.quantity}개
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!item.isPicked && (
                          <button
                            className="p-1.5 text-orange-500 hover:bg-orange-50 rounded transition-colors"
                            title="분할배송 마킹"
                          >
                            <Scissors size={12} />
                          </button>
                        )}
                        {!item.isPicked ? (
                          <button
                            onClick={() => pickItem(item.id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700"
                          >
                            <Package size={12} />
                            피킹
                          </button>
                        ) : !item.isVerified ? (
                          <button
                            onClick={() => verifyItem(item.id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-xs font-medium hover:bg-yellow-600"
                          >
                            <ScanBarcode size={12} />
                            검수
                          </button>
                        ) : (
                          <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                            <CheckCircle size={14} />
                            완료
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              <ClipboardList size={48} className="mx-auto mb-3 opacity-30" />
              <p>피킹 리스트를 선택하거나 새로 생성하세요</p>
              <p className="text-xs mt-1">
                오늘 주문 기준으로 피킹 리스트가 자동 생성됩니다
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
