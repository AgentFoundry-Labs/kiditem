'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Truck,
  Search,
  Package,
  User,
  Calendar,
  MapPin,
  Info,
} from 'lucide-react';
import { allOrderStatusesKeyParams, fetchOrderListAcrossStatuses } from '../lib/orders-api';
import { filterOrderListItems, orderStatusBadge } from '../lib/order-projection';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatDate, formatNumber } from '@/lib/utils';

const SEARCH_WINDOW_DAYS = 14;

function isoDateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DeliverySearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [submitted, setSubmitted] = useState('');

  const range = useMemo(
    () => ({ from: isoDateDaysAgo(SEARCH_WINDOW_DAYS - 1), to: todayIsoDate() }),
    [],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.orders.search(allOrderStatusesKeyParams(range)),
    queryFn: () => fetchOrderListAcrossStatuses(range),
  });

  const allOrders = data?.items ?? [];
  const results = useMemo(
    () => (submitted ? filterOrderListItems(allOrders, submitted) : []),
    [allOrders, submitted],
  );

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
          배송 / 주문 검색
        </h1>
      </div>

      <div className="flex items-start gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
        <Info size={16} className="flex-shrink-0 mt-0.5" />
        <p>
          서버 검색 API는 아직 연결되어 있지 않습니다. 최근 {SEARCH_WINDOW_DAYS}일 주문
          ({range.from} ~ {range.to}) 안에서 송장번호 / 주문번호 / 수취인 / 상품명으로
          클라이언트 검색합니다.
        </p>
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
                placeholder="송장번호, 주문번호, 수취인, 상품명으로 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={!searchTerm.trim() || isLoading}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              검색
            </button>
          </div>
          {isLoading && (
            <p className="text-xs text-slate-400 mt-2">최근 주문을 불러오는 중...</p>
          )}
          {isError && (
            <p className="text-xs text-red-500 mt-2">최근 주문을 불러오지 못했습니다.</p>
          )}
        </div>
      </div>

      {/* 검색 결과 */}
      {submitted && (
        <>
          <div className="text-sm text-slate-500">
            검색 결과: <strong>{isLoading ? '...' : `${results.length}건`}</strong>
            <span className="text-xs text-slate-400 ml-2">
              (최근 {SEARCH_WINDOW_DAYS}일 / 총 {allOrders.length}건 대상)
            </span>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-slate-400">로딩 중...</div>
          ) : results.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Truck size={48} className="mx-auto mb-3 opacity-30" />
              <p>검색 결과가 없습니다</p>
              <p className="text-xs mt-1">
                최근 {SEARCH_WINDOW_DAYS}일 범위 안에서만 검색됩니다.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((order) => {
                const badge = orderStatusBadge(order.status);
                const productLabel = order.primaryProductName
                  ? order.primaryOptionName
                    ? `${order.primaryProductName} / ${order.primaryOptionName}`
                    : order.primaryProductName
                  : order.lineItems[0]?.productName ?? '-';
                const skuLabel = order.lineItems[0]?.sku ?? null;
                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-xl border border-slate-200"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-3 flex-1">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded text-xs font-medium',
                                badge.color,
                              )}
                            >
                              {badge.label}
                            </span>
                            <span className="text-xs font-mono text-slate-500">
                              주문번호 {order.displayOrderNumber}
                            </span>
                            {order.trackingNumber && (
                              <span className="text-xs font-mono text-slate-500">
                                송장 {order.shippingCompany ?? ''} {order.trackingNumber}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="flex items-start gap-2">
                              <Package
                                size={14}
                                className="text-slate-400 mt-0.5 flex-shrink-0"
                              />
                              <div>
                                <div className="text-xs text-slate-500">상품</div>
                                <div className="text-sm font-medium">{productLabel}</div>
                                {skuLabel && (
                                  <div className="text-xs text-slate-400 font-mono">
                                    {skuLabel}
                                  </div>
                                )}
                                {order.lineItemCount > 1 && (
                                  <div className="text-xs text-slate-400 mt-0.5">
                                    외 {order.lineItemCount - 1}건
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
                                <div className="text-xs text-slate-500">수취인</div>
                                <div className="text-sm">
                                  {order.receiverName || order.customerName || '-'}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-start gap-2">
                              <Calendar
                                size={14}
                                className="text-slate-400 mt-0.5 flex-shrink-0"
                              />
                              <div>
                                <div className="text-xs text-slate-500">주문일</div>
                                <div className="text-sm">{formatDate(order.orderedAt)}</div>
                              </div>
                            </div>

                            <div className="flex items-start gap-2">
                              <MapPin
                                size={14}
                                className="text-slate-400 mt-0.5 flex-shrink-0"
                              />
                              <div>
                                <div className="text-xs text-slate-500">배송지</div>
                                <div className="text-sm truncate max-w-[200px]">
                                  {order.receiverAddr || '-'}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="text-right ml-4 flex-shrink-0">
                          <div className="text-xs text-slate-500">총 수량</div>
                          <div className="text-lg font-bold text-slate-900">
                            {formatNumber(order.totalQuantity)}개
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            {formatNumber(order.totalPrice)}원
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {!submitted && (
        <div className="text-center py-16 text-slate-400">
          <Search size={48} className="mx-auto mb-3 opacity-30" />
          <p>송장번호, 주문번호, 수취인, 상품명으로 검색하세요</p>
        </div>
      )}
    </div>
  );
}
