import {
  type DashboardMetricBasis,
  type DashboardMetricBasisMap,
  type DashboardComparisonBasis,
  type DashboardPeriodBasis,
  type DashboardSnapshotBasis,
} from '@kiditem/shared/dashboard';
import { cn } from '@/lib/utils';

export type {
  DashboardMetricBasis,
  DashboardComparisonBasis,
  DashboardPeriodBasis,
  DashboardSnapshotBasis,
};

/** Any dashboard summary that may publish an additive basis map. */
export type MetricBasisCarrier = { metricBasis?: DashboardMetricBasisMap } | null | undefined;

const QUERY_SOURCE_LABELS: Record<string, string> = {
  orders: '주문',
  sellpia: '셀피아',
  sellpia_sales: '셀피아 판매현황',
  coupang_ads: '쿠팡 광고',
  wing: 'Wing',
  wing_traffic: 'Wing 트래픽',
};

/** Read the basis published under one stable dotted path, or null. */
export function readMetricBasis(value: MetricBasisCarrier, key: string): DashboardMetricBasis | null {
  return value?.metricBasis?.[key] ?? null;
}

/** Read the first basis published under one of the stable dotted paths. */
export function readFirstMetricBasis(
  value: MetricBasisCarrier,
  keys: readonly string[],
): DashboardMetricBasis | null {
  for (const key of keys) {
    const basis = readMetricBasis(value, key);
    if (basis) return basis;
  }
  return null;
}

export function basisHasValues(basis: DashboardMetricBasis | null): boolean {
  if (!basis) return false;
  if (basis.kind === 'period') {
    return basis.includedDays > 0
      || basis.includedDates.length > 0
      || basis.status === 'unverified';
  }
  if (basis.kind === 'comparison') return basis.status === 'comparable';
  // An unknown snapshot is still a real snapshot. Keep its numeric value
  // visible and make the uncertainty explicit in the status label instead of
  // silently turning it into an empty card.
  return basis.status !== 'unavailable';
}

function dateCount(basis: DashboardPeriodBasis): number {
  return basis.includedDays ?? basis.includedDates?.length ?? 0;
}

function rangeText(basis: DashboardPeriodBasis): string {
  return `${basis.from} ~ ${basis.to}`;
}

function dateListText(dates: string[]): string {
  return dates.join(', ');
}

function sourceText(sources: string[]): string {
  return sources.length > 0 ? sources.join(' · ') : '원천 미상';
}

function queryFailureText(basis: DashboardMetricBasis): string | null {
  if (basis.kind !== 'period') return null;
  const queryFailedSources = basis.queryFailedSources ?? [];
  if (queryFailedSources.length === 0) return null;
  return `조회 실패 · ${queryFailedSources.map((source) => QUERY_SOURCE_LABELS[source] ?? source).join(' · ')}`;
}

function snapshotStatusText(status: 'current' | 'stale' | 'unavailable' | 'unknown'): string {
  if (status === 'current') return '현재';
  if (status === 'stale') return '오래됨';
  if (status === 'unavailable') return '사용 불가';
  return '상태 미상';
}

/**
 * A snapshot's age and its population coverage are separate facts, so this
 * reads beside the status rather than replacing it: a count read today can be
 * current and still have left members out. The number is what makes "partial"
 * mean something — the snapshot counterpart of a period's missing dates.
 *
 * A withheld population that is not partial is one whose every member was
 * withheld, which is why the value is unavailable — so the same number reads
 * as the reason the card is blank rather than as a qualifier on a number.
 */
function snapshotCoverageText(basis: DashboardSnapshotBasis): string | null {
  if (basis.withheldCount === 0) return null;
  return basis.partial
    ? `부분 집계 · 근거 부족 ${basis.withheldCount}건 제외`
    : `근거 부족 ${basis.withheldCount}건`;
}

function periodEvidenceText(basis: DashboardPeriodBasis): string {
  const evidence = `${basis.status === 'complete' ? '집계 완료' : basis.status === 'partial' ? '부분 집계' : basis.status === 'unverified' ? '날짜 근거 확인 필요' : '데이터 없음'} · ${dateCount(basis)}/${basis.targetDays}일 · ${rangeText(basis)}`;
  const failure = queryFailureText(basis);
  return failure ? `${evidence} · ${failure}` : evidence;
}

export function basisSummary(basis: DashboardMetricBasis | null): string {
  if (!basis) return '근거 정보 없음';
  if (basis.kind === 'snapshot') {
    const asOf = basis.asOf ?? '기준 시점 확인 불가';
    const coverage = snapshotCoverageText(basis);
    return `스냅샷 ${snapshotStatusText(basis.status)}${coverage ? ` · ${coverage}` : ''} · 기준시점 ${asOf} · ${sourceText(basis.sources)}`;
  }
  if (basis.kind === 'comparison') {
    return basis.status === 'comparable'
      ? `비교 가능 · 현재 ${periodEvidenceText(basis.current)} · 이전 ${periodEvidenceText(basis.previous)} · 공통 오프셋 ${basis.matchedOffsets.join(', ')}`
      : `비교 불가${basis.reason ? ` · ${basis.reason}` : ''}`;
  }
  return periodEvidenceText(basis);
}

export function DashboardDataBasis({
  basis,
  className,
}: {
  basis: DashboardMetricBasis | null;
  className?: string;
}) {
  if (!basis) return null;

  if (basis.kind === 'snapshot') {
    return (
      <div className={cn('text-[11px] text-slate-400', className)} data-testid="dashboard-data-basis">
        {basisSummary(basis)}
        {basis.observedAt && <span className="ml-1">· 관측 {String(basis.observedAt)}</span>}
      </div>
    );
  }

  if (basis.kind === 'comparison') {
    return (
      <details className={cn('text-[11px] text-slate-400', className)} data-testid="dashboard-data-basis">
        <summary className="cursor-pointer list-none hover:text-slate-600">{basisSummary(basis)}</summary>
        <div className="mt-1 space-y-0.5 pl-2 leading-relaxed">
          <div>현재 근거 {periodEvidenceText(basis.current)}</div>
          <div>현재 실제 날짜 {dateListText(basis.current.includedDates) || '없음'}</div>
          <div>현재 누락 날짜 {dateListText(basis.current.missingDates) || '없음'}</div>
          <div>이전 근거 {periodEvidenceText(basis.previous)}</div>
          <div>이전 실제 날짜 {dateListText(basis.previous.includedDates) || '없음'}</div>
          <div>이전 누락 날짜 {dateListText(basis.previous.missingDates) || '없음'}</div>
          <div>공통 오프셋 {basis.matchedOffsets.join(', ') || '없음'}</div>
          <div>원천 {sourceText([...new Set([...basis.current.sources, ...basis.previous.sources])])}</div>
        </div>
      </details>
    );
  }

  const missing = basis.missingDates ?? [];
  const invalid = basis.invalidDates ?? [];
  return (
    <details className={cn('text-[11px] text-slate-400', className)} data-testid="dashboard-data-basis">
      <summary className="cursor-pointer list-none hover:text-slate-600">
        {basisSummary(basis)}
      </summary>
      <div className="mt-1 space-y-0.5 pl-2 leading-relaxed">
        <div>실제 날짜 {dateListText(basis.includedDates) || '없음'}</div>
        {missing.length > 0 && <div>누락 날짜 {dateListText(missing)}</div>}
        {invalid.length > 0 && <div>제외 날짜 {dateListText(invalid)}</div>}
        <div>원천 {sourceText(basis.sources)}</div>
        {queryFailureText(basis) && <div>{queryFailureText(basis)}</div>}
      </div>
    </details>
  );
}
