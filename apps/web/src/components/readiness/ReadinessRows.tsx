import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Database,
  LineChart,
  Loader2,
  Megaphone,
  Package,
  RefreshCw,
  Rocket,
  Trophy,
  XCircle,
} from 'lucide-react';
import { useAdSync } from '@/app/(advertising)/ad-ops/hooks/useAdSync';
import { BrowserCollectionRunControls } from '@/components/browser-collection/BrowserCollectionRunControls';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import type { ReadinessCheck } from '@kiditem/shared/readiness';

type DisplayMeta = { title: string; hint: string; icon: LucideIcon };

const DISPLAY: Record<string, DisplayMeta> = {
  wing_sales: { title: '일별 매출', hint: '매출·방문·장바구니', icon: LineChart },
  rocket_sales: { title: '쿠팡 로켓', hint: '발주확정 매출', icon: Rocket },
  coupang_ads: { title: '광고 성과', hint: '클릭·전환·지출', icon: Megaphone },
  coupang_products: { title: '상품 목록', hint: '등록된 SKU 동기화', icon: Package },
  wing_kpi: { title: '아이템위너 순위', hint: '경쟁 현황', icon: Trophy },
};

function getDisplay(check: ReadinessCheck): DisplayMeta {
  return DISPLAY[check.key] ?? { title: check.label, hint: check.detail, icon: Database };
}

function collectLabel(check: ReadinessCheck): string {
  if (check.key === 'wing_sales') return '매출 받기';
  if (check.key === 'coupang_ads') return '광고 받기';
  if (check.key === 'wing_kpi') return '순위 받기';
  if (check.key === 'coupang_products') return '상품 받기';
  return '지금 받기';
}

function statusMeta(status: ReadinessCheck['status']) {
  if (status === 'ok')
    return {
      text: '최신',
      chipClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      Icon: CheckCircle2,
      iconClass: 'text-emerald-500',
    };
  if (status === 'stale')
    return {
      text: '업데이트 필요',
      chipClass: 'bg-amber-50 text-amber-700 border-amber-200',
      Icon: AlertTriangle,
      iconClass: 'text-amber-500',
    };
  return {
    text: '아직이에요',
    chipClass: 'bg-rose-50 text-rose-700 border-rose-200',
    Icon: XCircle,
    iconClass: 'text-rose-500',
  };
}

function formatRelative(iso: string | null): string {
  if (!iso) return '이력 없음';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function formatShortDate(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

function DateStrip({
  expectedDates,
  missingDates,
  referenceDate,
}: {
  expectedDates: string[];
  missingDates: string[];
  referenceDate: string | null;
}) {
  if (expectedDates.length === 0) return null;
  const missingSet = new Set(missingDates);
  const sorted = [...expectedDates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const collected = expectedDates.length - missingDates.length;

  return (
    <div className="mt-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between text-[11px]">
        <span className="font-medium text-[var(--text-secondary)]">
          {formatShortDate(first)} - {formatShortDate(last)}
        </span>
        <span className="text-[var(--text-tertiary)]">
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">{collected}</span>
          <span className="text-[var(--text-muted)]"> / {expectedDates.length}일 채워짐</span>
        </span>
      </div>
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${sorted.length}, minmax(0, 1fr))` }}
      >
        {sorted.map((ymd) => {
          const missing = missingSet.has(ymd);
          const isReference = ymd === referenceDate;
          return (
            <div
              key={ymd}
              title={ymd}
              className={cn(
                'h-6 rounded transition',
                missing ? 'bg-rose-500' : 'bg-emerald-500',
                isReference && 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--surface-sunken)]',
              )}
            />
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-[var(--text-muted)]">
        초록은 채워진 날, 빨강은 빈 날입니다. 테두리 있는 칸이 기준일(어제)이에요.
      </p>
    </div>
  );
}

export function CompactOkRow({ check }: { check: ReadinessCheck }) {
  const meta = getDisplay(check);
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--text-primary)]">{meta.title}</p>
      </div>
      <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
        <Check className="h-3 w-3 text-emerald-500" />
        {formatRelative(check.lastSyncedAt)} 업데이트
      </span>
    </div>
  );
}

export function ActionCheckCard({
  check,
  onCollect,
  pending,
}: {
  check: ReadinessCheck;
  onCollect: (c: ReadinessCheck) => void;
  pending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = getDisplay(check);
  const Icon = meta.icon;
  const status = statusMeta(check.status);
  const missingCount = check.missingDates?.length ?? 0;
  const hasStrip = !!check.expectedDates && check.expectedDates.length > 0;
  const canCollect = check.key !== 'rocket_sales';

  const subline = (() => {
    if (missingCount > 0) return `최근 ${check.expectedDates!.length}일 중 ${missingCount}일이 비어 있어요`;
    if (check.key === 'rocket_sales' && check.status === 'stale') return '오늘 로켓 매출이 아직 갱신되지 않았어요';
    if (check.status === 'stale') return '어제 데이터가 아직 반영되지 않았어요';
    return meta.hint;
  })();

  return (
    <div
      className={cn(
        'rounded-xl border bg-[var(--surface)] transition-all',
        check.status === 'stale' ? 'border-amber-200' : 'border-rose-200',
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            check.status === 'stale'
              ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400'
              : 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
          )}
        >
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{meta.title}</h3>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                status.chipClass,
              )}
            >
              <status.Icon className={cn('h-3 w-3', status.iconClass)} />
              {status.text}
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{subline}</p>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            마지막 업데이트 {formatRelative(check.lastSyncedAt)}
          </p>
        </div>

        {canCollect ? (
          <button
            onClick={() => onCollect(check)}
            disabled={pending}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition',
              'bg-[var(--primary)] text-[var(--primary-contrast)] hover:bg-[var(--primary-hover)]',
              'disabled:opacity-60',
            )}
          >
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                받는 중…
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                {collectLabel(check)}
              </>
            )}
          </button>
        ) : (
          <span className="shrink-0 rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-xs font-medium text-[var(--text-tertiary)]">
            조회 전용
          </span>
        )}
      </div>

      {hasStrip && (
        <div className="border-t border-[var(--border-subtle)] px-4 pb-3 pt-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1 text-[11px] font-medium transition-colors',
              'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
            )}
          >
            <ChevronDown
              className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')}
            />
            {expanded ? '날짜별 현황 접기' : '날짜별 현황 보기'}
          </button>
          {expanded && (
            <DateStrip
              expectedDates={check.expectedDates!}
              missingDates={check.missingDates ?? []}
              referenceDate={check.referenceDate}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function AdSyncRow({ onComplete }: { onComplete: () => void }) {
  const { collectionSession, loading, run } = useAdSync({ onComplete });

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] transition-all">
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
          <Megaphone className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">광고 동기화</h3>
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            운영중 캠페인을 자동 순회하며 캠페인별 상품 데이터를 수집해요
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            백그라운드에서 자동 처리 - 수 분 소요될 수 있어요
          </p>
        </div>

        <button
          onClick={run}
          disabled={loading}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition',
            'bg-[var(--primary)] text-[var(--primary-contrast)] hover:bg-[var(--primary-hover)]',
            'disabled:opacity-60',
          )}
        >
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              동기화 중…
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              광고 동기화
            </>
          )}
        </button>
      </div>
      {collectionSession?.data && (
        <BrowserCollectionRunControls
          session={collectionSession.data}
          onWebRestart={run}
          className="mx-4 mb-4"
        />
      )}
    </div>
  );
}
