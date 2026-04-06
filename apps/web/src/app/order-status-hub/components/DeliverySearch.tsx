'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Truck,
  Search,
  Package,
  User,
  Calendar,
  MapPin,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

interface DeliveredOrder {
  id: string;
  coupangOrderId: string;
  orderedAt: string;
  status: string;
  quantity: number;
  amount: number;
  receiverName?: string | null;
  receiverAddr?: string | null;
  product?: { name: string; sku: string } | null;
}

export default function DeliverySearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [submitted, setSubmitted] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.orders.search({ search: submitted }),
    queryFn: () =>
      apiClient.get<{ items: DeliveredOrder[] }>(
        `/api/orders?search=${encodeURIComponent(submitted)}`
      ),
    enabled: !!submitted,
  });

  const results = data?.items ?? [];

  const handleSearch = () => {
    if (!searchTerm.trim()) return;
    setSubmitted(searchTerm.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">
          <Truck size={24} className="inline mr-2" />
          배송완료 검색
        </h1>
      </div>

      {/* 검색 */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-700">주문 검색</h3>
        </div>
        <div className="p-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="송장번호 또는 주문번호를 입력하세요..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={!searchTerm.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              검색
            </button>
          </div>
        </div>
      </div>

      {/* 검색 결과 */}
      {submitted && (
        <>
          <div className="text-sm text-slate-500">
            검색 결과: <strong>{isLoading ? '...' : `${results.length}건`}</strong>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-slate-400">
              로딩 중...
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Truck size={48} className="mx-auto mb-3 opacity-30" />
              <p>검색 결과가 없습니다</p>
              <p className="text-xs mt-1">
                송장번호 또는 주문번호를 확인하세요
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((order) => (
                <div
                  key={order.id}
                  className="bg-white rounded-xl border border-slate-200"
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-3 flex-1">
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            배송완료
                          </span>
                          <span className="text-xs font-mono text-slate-500">
                            {order.coupangOrderId}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="flex items-start gap-2">
                            <Package
                              size={14}
                              className="text-slate-400 mt-0.5 flex-shrink-0"
                            />
                            <div>
                              <div className="text-xs text-slate-500">상품</div>
                              <div className="text-sm font-medium">
                                {order.product?.name || '-'}
                              </div>
                              {order.product?.sku && (
                                <div className="text-xs text-slate-400 font-mono">
                                  {order.product.sku}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-start gap-2">
                            <User
                              size={14}
                              className="text-slate-400 mt-0.5 flex-shrink-0"
                            />
                            <div>
                              <div className="text-xs text-slate-500">
                                수취인
                              </div>
                              <div className="text-sm">
                                {order.receiverName || '-'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-start gap-2">
                            <Calendar
                              size={14}
                              className="text-slate-400 mt-0.5 flex-shrink-0"
                            />
                            <div>
                              <div className="text-xs text-slate-500">
                                주문일
                              </div>
                              <div className="text-sm">
                                {new Date(order.orderedAt).toLocaleDateString(
                                  'ko-KR'
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-start gap-2">
                            <MapPin
                              size={14}
                              className="text-slate-400 mt-0.5 flex-shrink-0"
                            />
                            <div>
                              <div className="text-xs text-slate-500">
                                배송지
                              </div>
                              <div className="text-sm truncate max-w-[200px]">
                                {order.receiverAddr || '-'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="text-right ml-4">
                        <div className="text-xs text-slate-500">수량</div>
                        <div className="text-lg font-bold text-slate-900">
                          {order.quantity}개
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!submitted && (
        <div className="text-center py-16 text-slate-400">
          <Search size={48} className="mx-auto mb-3 opacity-30" />
          <p>송장번호 또는 주문번호로 검색하세요</p>
        </div>
      )}
    </div>
  );
}
