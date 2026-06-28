'use client';

import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Package,
  PackageCheck,
  RefreshCw,
  Rocket,
  Truck,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { RocketConfirmPanel } from './components/RocketConfirmPanel';
import { RocketConfirmFileList } from './components/RocketConfirmFileList';

interface RocketItem {
  name: string;
  qty: number;
  amount: number;
}

interface RocketOrder {
  poSeq: number;
  businessDate: string;
  status: string | null;
  vendorName: string | null;
  centerName: string | null;
  firstSkuName: string | null;
  skuCount: number;
  orderQty: number;
  orderAmount: number;
  items: RocketItem[];
}

const STATUS_OPTIONS = [
  { value: '', label: '전체 상태' },
  { value: '거래처확인요청', label: '신규 주문 (거래확인서요청)' },
  { value: '발주확정', label: '발주확정' },
];

// 워크플로 단계 (로켓 물류 발주)
const STAGES = [
  { icon: Rocket, label: '신규 주문', desc: '거래확인서요청 발주' },
  { icon: PackageCheck, label: '납품물량 확정', desc: '업체 납품가능 수량 확정' },
  { icon: Truck, label: '쉽먼트 / 밀크런', desc: '9박스 이하 택배 · 초과 밀크런' },
  { icon: FileText, label: '송장 · 출력', desc: '송장 입력 → 부착/동봉 문서 출력' },
];

function todayYmd() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function monthStartYmd() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`;
}

export default function RocketOrdersPage() {
  const [from, setFrom] = useState(monthStartYmd());
  const [to, setTo] = useState(todayYmd());
  const [status, setStatus] = useState('거래처확인요청');
  const [openPo, setOpenPo] = useState<number | null>(null);
  const [fileRefreshKey, setFileRefreshKey] = useState(0);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['dashboard', 'rocket-orders', from, to, status],
    queryFn: () =>
      apiClient.get<RocketOrder[]>(
        `/api/dashboard/rocket-orders?from=${from}&to=${to}${status ? `&status=${encodeURIComponent(status)}` : ''}`,
      ),
    staleTime: 0,
  });

  const orders = data ?? [];
  const totalAmount = orders.reduce((s, o) => s + o.orderAmount, 0);
  const totalQty = orders.reduce((s, o) => s + o.orderQty, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50">
            <Rocket size={20} className="text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">쿠팡 로켓 발주</h1>
            <div className="text-sm text-slate-500">공급사 발주(로켓 물류) 처리 — 발주 리스트 · 납품 · 송장 · 출력</div>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} /> 새로고침
        </button>
      </div>

      {/* 워크플로 단계 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STAGES.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                  <Icon size={15} />
                </span>
                <span className="text-[11px] font-medium text-slate-400">STEP {i + 1}</span>
              </div>
              <div className="mt-1.5 text-sm font-semibold text-slate-900">{s.label}</div>
              <div className="text-[11px] text-slate-400">{s.desc}</div>
            </div>
          );
        })}
      </div>

      {/* 발주확정 양식 생성 + 편집 미리보기 (입고예정일 다음 7일 기준) */}
      <RocketConfirmPanel onSaved={() => setFileRefreshKey((k) => k + 1)} />

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
        />
        <span className="text-slate-400">~</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="text-slate-500">발주 <b className="tabular-nums text-slate-900">{formatNumber(orders.length)}</b>건</span>
          <span className="text-slate-500">수량 <b className="tabular-nums text-slate-900">{formatNumber(totalQty)}</b>개</span>
          <span className="text-slate-500">금액 <b className="tabular-nums text-purple-700">{formatKRW(totalAmount)}</b>원</span>
        </div>
      </div>

      {isLoading && <PageSkeleton variant="table" />}

      {data && orders.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-400">
          <Rocket size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">해당 조건의 발주가 없습니다</p>
        </div>
      )}

      {/* 발주 리스트 */}
      {orders.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="grid grid-cols-[110px_minmax(0,1fr)_88px_120px_120px] gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <div>발주번호</div>
            <div>상품</div>
            <div className="text-right">수량</div>
            <div className="text-right">발주금액</div>
            <div className="text-center">상태 / 처리</div>
          </div>
          {orders.map((po) => {
            const open = openPo === po.poSeq;
            return (
              <Fragment key={po.poSeq}>
                <div
                  className={cn(
                    'grid cursor-pointer grid-cols-[110px_minmax(0,1fr)_88px_120px_120px] items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm hover:bg-slate-50',
                    open && 'bg-purple-50/50',
                  )}
                  onClick={() => setOpenPo(open ? null : po.poSeq)}
                >
                  <div className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
                    {open ? (
                      <ChevronDown size={13} className="flex-none text-purple-500" />
                    ) : (
                      <ChevronRight size={13} className="flex-none text-slate-400" />
                    )}
                    {po.poSeq}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-slate-800">
                      {po.firstSkuName}
                      {po.skuCount > 1 && <span className="text-slate-400"> 외 {po.skuCount - 1}종</span>}
                    </div>
                    <div className="text-[11px] text-slate-400">{po.businessDate} · {po.centerName}</div>
                  </div>
                  <div className="text-right tabular-nums text-slate-600">{formatNumber(po.orderQty)}개</div>
                  <div className="text-right font-semibold tabular-nums text-slate-800">{formatKRW(po.orderAmount)}원</div>
                  <div className="text-center">
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                      {po.status}
                    </span>
                  </div>
                </div>
                {open && (
                  <div className="border-b border-slate-200 bg-slate-50/60 px-4 py-3 pl-9">
                    {/* 품목(SKU) */}
                    {po.items.length === 0 ? (
                      <div className="text-[11px] text-slate-400">품목 상세 없음 (대표상품: {po.firstSkuName})</div>
                    ) : (
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="text-[10px] text-slate-400">
                            <th className="py-1 text-left font-medium">품목 (SKU)</th>
                            <th className="py-1 text-right font-medium">수량</th>
                            <th className="py-1 text-right font-medium">금액</th>
                          </tr>
                        </thead>
                        <tbody>
                          {po.items.map((it, i) => (
                            <tr key={i} className="border-t border-slate-100">
                              <td className="py-1 pr-2 text-slate-600">
                                <Package size={11} className="mr-1 inline text-purple-400" />
                                {it.name}
                              </td>
                              <td className="py-1 text-right tabular-nums text-slate-500">{formatNumber(it.qty)}</td>
                              <td className="py-1 text-right tabular-nums text-slate-700">{formatKRW(it.amount)}원</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {/* 워크플로 액션 (다음 단계 — 쿠팡 쓰기 동작 연동 예정) */}
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
                      <span className="text-[11px] text-slate-400">처리:</span>
                      <button disabled className="cursor-not-allowed rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-400">
                        납품물량 확정
                      </button>
                      <button disabled className="cursor-not-allowed rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-400">
                        쉽먼트/밀크런
                      </button>
                      <button disabled className="cursor-not-allowed rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-400">
                        송장 입력
                      </button>
                      <button disabled className="cursor-not-allowed rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-400">
                        문서 출력
                      </button>
                      <span className="text-[10px] text-slate-300">연동 예정</span>
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      )}

      {/* 생성한 발주확정 파일 관리 (목록 · 재다운로드 · 삭제) */}
      <RocketConfirmFileList refreshKey={fileRefreshKey} />
    </div>
  );
}
