'use client';
import Link from 'next/link';
import { Loader2, CheckCircle, RotateCcw } from 'lucide-react';
import { cn, formatKRW } from '@/lib/utils';
import { buildRocketEventDraftHref } from '@/app/(inventory)/inventory-hub/lib/rocket-event-draft';

interface ReturnLineItem {
  id: string;
  vendorItemName: string | null;
  sellerProductName: string | null;
  purchaseCount: number;
  cancelCount: number;
}

interface ReturnItem {
  id: string;
  receiptId: number;
  orderId: string;
  requesterName: string;
  receiptStatus: string;
  receiptType: string;
  faultByType: string;
  cancelReason: string;
  cancelReasonCategory1: string;
  cancelReasonCategory2: string;
  reasonCodeText: string;
  enclosePrice: number;
  requestedAt: string;
  completedAt: string | null;
  createdAt: string;
  status?: string;
  lineItems?: ReturnLineItem[];
}

const reasonLabels: Record<string, string> = {
  CHANGE_MIND: '고객변심',
  ORDER_MISTAKE: '주문실수',
  BETTER_PRICE: '다른 곳에서 더 저렴',
  LATE_DELIVERY: '배송 지연',
  WRONG_DELIVERY: '오배송',
  DEFECTIVE: '상품 불량/파손',
  DIFFERENT_FROM_DESC: '상품 상이',
  MISSING_PARTS: '부품/구성품 누락',
  SIZE_COLOR_CHANGE: '사이즈/색상 변경',
  '10ac': '고객변심',
  '10bc': '주문실수',
  '20ac': '상품 불량',
  '20bc': '오배송',
  '20cc': '상품 상이',
  '20dc': '배송 지연',
};

const statusLabels: Record<string, { label: string; color: string }> = {
  UC: { label: '미확인', color: 'bg-red-100 text-red-800' },
  RC: { label: '수거완료', color: 'bg-blue-100 text-blue-800' },
  CC: { label: '완료', color: 'bg-green-100 text-green-800' },
  RETURNS_COMPLETED: { label: '반품완료', color: 'bg-green-100 text-green-800' },
  RETURNS_REQUESTED: { label: '반품요청', color: 'bg-yellow-100 text-yellow-800' },
  RETURNS_ACCEPTED: { label: '반품승인', color: 'bg-blue-100 text-blue-800' },
  EXCHANGE_REQUESTED: { label: '교환요청', color: 'bg-purple-100 text-purple-800' },
  EXCHANGE_COMPLETED: { label: '교환완료', color: 'bg-green-100 text-green-800' },
};

function getReasonLabel(reason: string | undefined): string {
  if (!reason) return '-';
  if (/[\uAC00-\uD7AF]/.test(reason)) return reason;
  return reasonLabels[reason] || reason;
}

function getStatusLabel(status: string | undefined): { label: string; color: string } {
  if (!status) return { label: '-', color: 'bg-slate-100 text-slate-600' };
  return statusLabels[status] || { label: status, color: 'bg-slate-100 text-slate-600' };
}

interface ReturnsTableProps {
  returns: ReturnItem[];
  processing: number | null;
  onApprove: (id: number) => void;
}

export function ReturnsTable({ returns, processing, onApprove }: ReturnsTableProps) {
  return (
    <div className="table-card">
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>접수번호</th>
              <th>주문번호</th>
              <th>상품명</th>
              <th>요청일</th>
              <th>요청자</th>
              <th>반품사유</th>
              <th>상태</th>
              <th>환불금액</th>
              <th>액션</th>
            </tr>
          </thead>
          <tbody>
            {returns.map((r: ReturnItem) => {
              const st = getStatusLabel(r.receiptStatus);
              const reason = getReasonLabel(r.cancelReason || r.cancelReasonCategory1);
              const firstItem = r.lineItems?.[0];
              const firstItemName = firstItem?.sellerProductName || firstItem?.vendorItemName || '-';
              return (
                <tr key={r.receiptId}>
                  <td className="text-xs font-mono">{r.receiptId}</td>
                  <td className="text-xs font-mono text-slate-500">{r.orderId}</td>
                  <td className="text-sm max-w-[200px] truncate" title={firstItemName === '-' ? '' : firstItemName}>
                    {firstItemName}
                  </td>
                  <td className="text-xs text-slate-500">{new Date(r.requestedAt || r.createdAt).toLocaleDateString('ko-KR')}</td>
                  <td className="text-sm">{r.requesterName || '-'}</td>
                  <td className="text-sm max-w-[200px] truncate">{reason}</td>
                  <td><span className={cn('px-2 py-0.5 rounded text-xs font-medium', st.color)}>{st.label}</span></td>
                  <td className="text-right">{r.enclosePrice ? `${formatKRW(r.enclosePrice)}원` : '-'}</td>
                  <td>
                    <div className="flex flex-col items-end gap-1">
                      {r.receiptStatus === 'UC' && (
                      <button
                        onClick={() => onApprove(r.receiptId)}
                        disabled={processing === r.receiptId}
                        className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        {processing === r.receiptId ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                        승인
                      </button>
                      )}
                      {r.lineItems?.map((item) => (
                        <Link
                          key={item.id}
                          href={buildRocketEventDraftHref({
                            eventType: 'return_restock',
                            quantity: item.cancelCount || item.purchaseCount || 1,
                            sourceRef: `return-${r.receiptId}-line-${item.id}`,
                            note: r.orderId
                              ? `쿠팡 반품 ${r.orderId} ${item.vendorItemName ?? item.sellerProductName ?? item.id}`
                              : undefined,
                          })}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          <RotateCcw size={12} />
                          재고 처리 초안
                        </Link>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ExchangesTable({ exchanges }: { exchanges: ReturnItem[] }) {
  return (
    <div className="table-card">
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>접수번호</th>
              <th>주문번호</th>
              <th>상품명</th>
              <th>요청일</th>
              <th>상태</th>
              <th>사유</th>
            </tr>
          </thead>
          <tbody>
            {exchanges.map((e: ReturnItem, i: number) => {
              const st = getStatusLabel(e.receiptStatus || e.status);
              const reason = getReasonLabel(e.cancelReason);
              const firstItem = e.lineItems?.[0];
              const firstItemName = firstItem?.sellerProductName || firstItem?.vendorItemName || '-';
              return (
                <tr key={e.receiptId || i}>
                  <td className="text-xs font-mono">{e.receiptId || '-'}</td>
                  <td className="text-xs font-mono text-slate-500">{e.orderId || '-'}</td>
                  <td className="text-sm max-w-[200px] truncate" title={firstItemName === '-' ? '' : firstItemName}>
                    {firstItemName}
                  </td>
                  <td className="text-xs text-slate-500">{e.createdAt ? new Date(e.createdAt).toLocaleDateString('ko-KR') : '-'}</td>
                  <td><span className={cn('px-2 py-0.5 rounded text-xs font-medium', st.color)}>{st.label}</span></td>
                  <td className="text-sm max-w-[250px] truncate">{reason}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
