'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { roasColor } from '../../lib/status-colors';

interface SnapshotKeyMetrics {
  totalAdSpend: number;
  totalAdRevenue: number;
  overallRoas: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  ctr: number;
  cvr: number;
  adRatio: number;
}

interface PlanData {
  generatedAt: string;
  totalProducts: number;
  summary: {
    scaleUp: number;
    optimize: number;
    reduce: number;
    stop: number;
    newStart: number;
  };
  keyMetrics: {
    totalAdSpend: number;
    totalAdRevenue: number;
    overallRoas: number;
  };
}

interface Props {
  plan?: PlanData;
  keyMetrics?: SnapshotKeyMetrics | null;
  hasSnapshotData?: boolean;
  period?: string;
}

const PERIOD_LABELS: Record<string, string> = { '7d': '7일', '14d': '14일', 'month': '이번달' };

export function PlanSummary({ plan, keyMetrics, hasSnapshotData, period }: Props) {
  const { data: adsConfig } = useQuery({
    queryKey: queryKeys.ads.config(),
    queryFn: () => apiClient.get<{ roas: { thresholds: { excellent: number; warning: number; poor: number } } }>('/api/ads/config'),
  });
  const roasT = adsConfig?.roas?.thresholds ?? { excellent: 300, warning: 200, poor: 100 };
  const periodLabel = period ? (PERIOD_LABELS[period] ?? period) : '14일';

  return (
    <div className="space-y-4">
      {/* KPI 지표 카드 */}
      {hasSnapshotData && keyMetrics && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">광고 KPI <span className="text-sm font-normal text-slate-400">({periodLabel} 누적)</span></h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="rounded-lg border border-slate-100 p-3">
              <div className="text-[11px] font-medium text-slate-500 mb-1">광고전환매출</div>
              <div className="text-[15px] font-extrabold text-slate-900 tabular-nums">{formatKRW(keyMetrics.totalAdRevenue)}원</div>
            </div>
            <div className="rounded-lg border border-slate-100 p-3">
              <div className="text-[11px] font-medium text-slate-500 mb-1">집행광고비</div>
              <div className="text-[15px] font-extrabold text-slate-900 tabular-nums">{formatKRW(keyMetrics.totalAdSpend)}원</div>
            </div>
            <div className="rounded-lg border border-slate-100 p-3">
              <div className="text-[11px] font-medium text-slate-500 mb-1">ROAS</div>
              <div className={cn('text-[15px] font-extrabold tabular-nums', roasColor(keyMetrics.overallRoas, roasT))}>
                {keyMetrics.overallRoas}%
              </div>
            </div>
            <div className="rounded-lg border border-slate-100 p-3">
              <div className="text-[11px] font-medium text-slate-500 mb-1">노출수</div>
              <div className="text-[15px] font-extrabold text-slate-900 tabular-nums">{formatNumber(keyMetrics.totalImpressions)}</div>
            </div>
            <div className="rounded-lg border border-slate-100 p-3">
              <div className="text-[11px] font-medium text-slate-500 mb-1">클릭수</div>
              <div className="text-[15px] font-extrabold text-slate-900 tabular-nums">{formatNumber(keyMetrics.totalClicks)}</div>
            </div>
            <div className="rounded-lg border border-slate-100 p-3">
              <div className="text-[11px] font-medium text-slate-500 mb-1">전환수</div>
              <div className="text-[15px] font-extrabold text-slate-900 tabular-nums">{formatNumber(keyMetrics.totalConversions)}건</div>
            </div>
            <div className="rounded-lg border border-slate-100 p-3">
              <div className="text-[11px] font-medium text-slate-500 mb-1">구매전환율(CVR)</div>
              <div className="text-[15px] font-extrabold text-slate-900 tabular-nums">{keyMetrics.cvr.toFixed(2)}%</div>
            </div>
          </div>
        </div>
      )}

      {/* 주간 액션 플랜 */}
      {!plan ? (
        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 mb-4">주간 액션 플랜</h3>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
            {['확대', '최적화', '축소', '중단', '신규'].map((label) => (
              <div key={label} className="rounded-lg p-3 border text-center bg-slate-50 border-slate-200 text-slate-400">
                <div className="card-value">-</div>
                <div className="text-xs font-medium mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">주간 액션 플랜</h3>
            <span className="text-xs text-slate-400">{plan.totalProducts}개 상품 분석</span>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-4">
            {[
              { label: '확대', value: plan.summary.scaleUp, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
              { label: '최적화', value: plan.summary.optimize, color: 'text-purple-600 bg-purple-50 border-purple-200' },
              { label: '축소', value: plan.summary.reduce, color: 'text-amber-600 bg-amber-50 border-amber-200' },
              { label: '중단', value: plan.summary.stop, color: 'text-red-600 bg-red-50 border-red-200' },
              { label: '신규', value: plan.summary.newStart, color: 'text-purple-600 bg-purple-50 border-purple-200' },
            ].map((c) => (
              <div key={c.label} className={cn('rounded-lg p-3 border text-center', c.color)}>
                <div className="card-value">{c.value}</div>
                <div className="text-xs font-medium mt-1">{c.label}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-6 pt-3 border-t border-slate-100 text-sm">
            <div>
              <span className="text-slate-500">총 광고비:</span>{' '}
              <strong className="text-slate-900">{formatKRW(plan.keyMetrics.totalAdSpend)}원</strong>
            </div>
            <div>
              <span className="text-slate-500">광고 매출:</span>{' '}
              <strong className="text-slate-900">{formatKRW(plan.keyMetrics.totalAdRevenue)}원</strong>
            </div>
            <div>
              <span className="text-slate-500">ROAS:</span>{' '}
              <strong className={roasColor(plan.keyMetrics.overallRoas, roasT)}>
                {plan.keyMetrics.overallRoas}%
              </strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
