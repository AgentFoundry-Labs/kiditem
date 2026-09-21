import { useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  Database,
  KeyRound,
  LineChart,
  Loader2,
  Megaphone,
  Package,
  RefreshCw,
  Trophy,
  XCircle,
} from 'lucide-react';
import { businessDateKey, toBusinessDate } from '@kiditem/shared/common';
import { snapshotBasisPartial, snapshotBasisStatus } from '@kiditem/shared/dashboard';
import {
  SOURCE_READINESS_LABELS,
  sourceReadinessStatus,
  type SourceReadinessStatus,
} from '@kiditem/shared/source-readiness';
import { adCampaignSweepCollection } from '@/app/(advertising)/ad-ops/lib/ad-campaign-collection';
import { adKeywordCollection } from '@/app/(advertising)/ad-ops/lib/ad-keyword-collection';
import { wingRankBatchCollection } from '@/app/(advertising)/rank-tracking/lib/wing-rank-batch-collection';
import { SELLPIA_INVENTORY_START_TITLE } from '@/app/(inventory)/_shared/SellpiaSyncAction';
import { useSellpiaInventoryCollection } from '@/app/(inventory)/_shared/sellpia-inventory-source-owner';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { COLLECTION_STOPPED_MESSAGE, stoppedAttempt } from '@/lib/collection-source-status-query';
import {
  sellpiaSalesCollection,
  sellpiaSalesReadinessRange,
} from '@/lib/sellpia-sales-source-collection';
import { cn, formatNumber, timeAgo } from '@/lib/utils';
import { InfoDisclosure } from '@/components/ui/InfoDisclosure';
import { CatalogReadinessAction, CatalogReadinessStatus } from './CatalogReadinessControl';
import type { LucideIcon } from 'lucide-react';
import type { ReadinessCheck } from '@kiditem/shared/readiness';
import type { CatalogReadinessState } from './useReadinessCollection';

type DisplayMeta = { title: string; hint: string; icon: LucideIcon };

const DISPLAY: Record<string, DisplayMeta> = {
  wing_sales: { title: '일별 매출', hint: '셀피아 몰별 매출', icon: LineChart },
  coupang_ads: { title: '광고 성과', hint: '클릭·전환·지출', icon: Megaphone },
  coupang_products: { title: '상품 목록', hint: '등록된 SKU 동기화', icon: Package },
  wing_kpi: { title: 'Wing 판매순위', hint: '자사 상품 판매순위', icon: Trophy },
};

function getDisplay(check: ReadinessCheck): DisplayMeta {
  return DISPLAY[check.key] ?? { title: check.label, hint: check.detail, icon: Database };
}

function readinessStatus(check: ReadinessCheck): SourceReadinessStatus {
  const basisStatus = snapshotBasisStatus(check.basis);
  return sourceReadinessStatus({
    ready: basisStatus === 'current' && !snapshotBasisPartial(check.basis),
    latestComplete: check.basis.measured ? { actualCutoff: check.basis.asOf } : null,
  });
}

function statusMeta(status: SourceReadinessStatus) {
  if (status === 'ready')
    return {
      text: SOURCE_READINESS_LABELS.ready,
      chipClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      Icon: CheckCircle2,
      iconClass: 'text-emerald-500',
    };
  if (status === 'stale')
    return {
      text: SOURCE_READINESS_LABELS.stale,
      chipClass: 'bg-amber-50 text-amber-700 border-amber-200',
      Icon: AlertTriangle,
      iconClass: 'text-amber-500',
    };
  return {
    text: SOURCE_READINESS_LABELS.missing,
    chipClass: 'bg-rose-50 text-rose-700 border-rose-200',
    Icon: XCircle,
    iconClass: 'text-rose-500',
  };
}

function SourceReadinessChip({ status }: { status: SourceReadinessStatus }) {
  const meta = statusMeta(status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        meta.chipClass,
      )}
    >
      <meta.Icon className={cn('h-3 w-3', meta.iconClass)} />
      {meta.text}
    </span>
  );
}

/** Campaign and keyword owners cover through the end date of their latest completed plan. */
function ownerSourceReadiness(source: {
  ready: boolean;
  latestComplete: { plan: { endDate: string } } | null;
}): SourceReadinessStatus {
  return sourceReadinessStatus({
    ready: source.ready,
    latestComplete: source.latestComplete
      ? { actualCutoff: source.latestComplete.plan.endDate }
      : null,
  });
}

/** Sellpia inventory is ready after a completed collection; it has no age cutoff. */
function sellpiaReadiness(state: { status: string; lastCompletedAt: string | null }): SourceReadinessStatus {
  const completedDate = toBusinessDate(state.lastCompletedAt);
  return sourceReadinessStatus({
    ready: state.status === 'complete',
    latestComplete: completedDate ? { actualCutoff: businessDateKey(completedDate) } : null,
  });
}

function formatRelative(iso: string | null): string {
  return iso ? timeAgo(iso) : '이력 없음';
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

function DailyStatusDisclosure({ check }: { check: ReadinessCheck }) {
  const [expanded, setExpanded] = useState(false);
  const expectedDates = check.expectedDates ?? [];
  if (expectedDates.length === 0) return null;
  const title = getDisplay(check).title;
  const actionLabel = expanded ? '날짜별 현황 접기' : '날짜별 현황 보기';

  return (
    <div className="border-t border-[var(--border-subtle)] px-4 pb-3 pt-2">
      <button
        type="button"
        aria-label={`${title} ${actionLabel}`}
        onClick={() => setExpanded((value) => !value)}
        className={cn(
          'inline-flex items-center gap-1 text-[11px] font-medium transition-colors',
          'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
        )}
      >
        <ChevronDown
          className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')}
        />
        {actionLabel}
      </button>
      {expanded && (
        <DateStrip
          expectedDates={expectedDates}
          missingDates={check.missingDates ?? []}
          referenceDate={check.referenceDate}
        />
      )}
    </div>
  );
}

export function CompactOkRow({ check }: { check: ReadinessCheck }) {
  const meta = getDisplay(check);
  const Icon = meta.icon;
  return (
    <div
      className="overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)]"
      data-readiness-item={check.key}
    >
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="text-sm font-medium text-[var(--text-primary)]">{meta.title}</p>
            <InfoDisclosure label={meta.title}>
              <p>{check.detail}</p>
            </InfoDisclosure>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
          <Check className="h-3 w-3 text-emerald-500" />
          {formatRelative(check.lastSyncedAt)} 업데이트
        </span>
      </div>
      <DailyStatusDisclosure check={check} />
    </div>
  );
}

/** The readiness card's Sellpia sales control: the same collection as the sales screens. */
function SellpiaSalesCardControl({ check }: { check: ReadinessCheck }) {
  const control = useCollectionSourceControl(sellpiaSalesCollection);
  return (
    <CollectionStartControl
      control={control}
      startLabel="매출 받기"
      startTitle="준비 상태에서 비어 있는 날짜의 셀피아 판매현황을 받습니다."
      onStart={() => control.start(sellpiaSalesReadinessRange(check))}
      onStop={control.stop}
      className="self-center"
    />
  );
}

/**
 * The readiness card's Wing rank control: the same batch as the rank tracking
 * screen, which alone shows its per-keyword progress, failures and attention tabs.
 */
function WingRankCardControl() {
  const control = useCollectionSourceControl(wingRankBatchCollection);
  return (
    <CollectionStartControl
      control={control}
      startLabel="순위 받기"
      startTitle="자사 상품 전체의 Wing 판매순위를 수집합니다."
      onStart={() => control.start()}
      onStop={control.stop}
      runningLink={{ href: '/rank-tracking', label: '진행 보기' }}
      className="self-center"
    />
  );
}

export function ActionCheckCard({
  check,
  onCollect,
  pending,
  catalog,
}: {
  check: ReadinessCheck;
  onCollect: (c: ReadinessCheck) => void;
  pending: boolean;
  catalog?: CatalogReadinessState;
}) {
  const meta = getDisplay(check);
  const Icon = meta.icon;
  const readiness = readinessStatus(check);
  const status = statusMeta(readiness);
  const missingCount = check.missingDates?.length ?? 0;
  // 상품 받기 is the selected Coupang account's shared collection control.
  const isCatalog = check.key === 'coupang_products';
  // The campaign sweep keeps one control in this modal, 광고 동기화 below;
  // the ad readiness card only points to it.
  const collectsThroughAdSync = check.key === 'coupang_ads';
  // Sellpia sales keeps one shared control across readiness and the sales screens.
  const collectsThroughSalesControl = check.key === 'wing_sales';
  const collectsThroughRankControl = check.key === 'wing_kpi';

  const subline = (() => {
    if (missingCount > 0) {
      return `최근 ${check.expectedDates?.length ?? missingCount}일 중 ${missingCount}일이 비어 있어요`;
    }
    if (readiness === 'stale') return '어제 데이터가 아직 반영되지 않았어요';
    return meta.hint;
  })();

  return (
    <div
      className={cn(
        'rounded-xl border bg-[var(--surface)] transition-all',
        readiness === 'stale' ? 'border-amber-200' : 'border-rose-200',
      )}
      data-readiness-item={check.key}
    >
      <div className="flex items-start gap-3 p-4">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            readiness === 'stale'
              ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400'
              : 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
          )}
        >
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{meta.title}</h3>
            <InfoDisclosure label={meta.title}>
              <p>{meta.hint}</p>
              <p className="mt-1">브라우저 익스텐션에서 최신 데이터를 받아옵니다.</p>
            </InfoDisclosure>
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
          <p className={cn(
            'mt-1 text-xs',
            readiness === 'stale' ? 'text-amber-700' : 'text-[var(--text-secondary)]',
          )}>
            {check.detail || subline}
          </p>
          {check.detail && check.detail !== subline && (
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{subline}</p>
          )}
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            마지막 업데이트 {formatRelative(check.lastSyncedAt)}
          </p>
        </div>

        {collectsThroughAdSync ? (
          <p className="shrink-0 self-center text-[11px] text-[var(--text-muted)]">
            {'아래 ‘광고 동기화’에서 받아요'}
          </p>
        ) : collectsThroughSalesControl ? (
          <SellpiaSalesCardControl check={check} />
        ) : collectsThroughRankControl ? (
          <WingRankCardControl />
        ) : isCatalog && catalog ? (
          <CatalogReadinessAction catalog={catalog} />
        ) : (
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
                지금 받기
              </>
            )}
          </button>
        )}
      </div>

      {isCatalog && catalog && (
        <div className="px-4 pb-3">
          <CatalogReadinessStatus catalog={catalog} />
        </div>
      )}

      <DailyStatusDisclosure check={check} />
    </div>
  );
}

/**
 * The campaign sweep's one control in the readiness modal. Start, refusal,
 * running scope and stop come from the shared collection control.
 */
export function AdSyncRow() {
  const control = useCollectionSourceControl(adCampaignSweepCollection);
  const source = control.status;
  const readiness = source ? ownerSourceReadiness(source) : null;
  const attempt = source?.latestAttempt ?? null;

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] transition-all">
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
          <Megaphone className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">광고 동기화</h3>
            <InfoDisclosure label="광고 동기화">
              <p>최근 31일 캠페인과 광고상품을 전체 순회해요. 기존 완료본은 수집 중에도 유지됩니다.</p>
            </InfoDisclosure>
            {readiness && <SourceReadinessChip status={readiness} />}
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            {source?.latestComplete
              ? `사용 중인 데이터: ${source.latestComplete.plan.startDate} ~ ${source.latestComplete.plan.endDate}`
              : '완료된 데이터가 없습니다. 전체 순회 완료 후 결과를 표시합니다.'}
          </p>
          {attempt && (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {attempt.state === 'FAILED'
                ? (stoppedAttempt(attempt)
                  ? COLLECTION_STOPPED_MESSAGE
                  : attempt.errorMessage ?? '수집 실패. 새로 수집해 주세요.')
                : attempt.state === 'RUNNING'
                  ? `캠페인 ${attempt.campaignCount}개 수집 중 · 미발행`
                  : `전체 수집 완료${attempt.rawOnlyCampaignCount ? ` · ${attempt.rawOnlyCampaignCount}개 원본만 보존` : ''}`}
            </p>
          )}
        </div>

        <CollectionStartControl
          control={control}
          startLabel="광고 동기화"
          onStart={() => control.start()}
          onStop={control.stop}
        />
      </div>
    </div>
  );
}

/**
 * Standalone keyword collection row.
 *
 * Kept separate from `AdSyncRow` because the two collect different things:
 * the ad sync walks 31 days of campaign/product facts, while this pulls the
 * keyword table of every advertised product. Keyword collection also runs on
 * its own — it does not need the 31-day sweep to finish first.
 */
export function AdKeywordRow() {
  const control = useCollectionSourceControl(adKeywordCollection);
  const source = control.status;
  const readiness = source ? ownerSourceReadiness(source) : null;
  const attempt = source?.latestAttempt ?? null;

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] transition-all">
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
          <KeyRound className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">광고 키워드 수집</h3>
            <InfoDisclosure label="광고 키워드 수집">
              <p>전체 캠페인의 광고상품별 노출 키워드를 수집해요. 완료 전에는 이전 완료본을 사용합니다.</p>
            </InfoDisclosure>
            {readiness && <SourceReadinessChip status={readiness} />}
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            완료본 유지 · 필요하면 명시적으로 다시 실행
          </p>
          {attempt && (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {attempt.state === 'FAILED'
                ? (stoppedAttempt(attempt)
                  ? COLLECTION_STOPPED_MESSAGE
                  : attempt.errorMessage ?? '수집 실패. 새로 수집해 주세요.')
                : attempt.state === 'COMPLETE'
                  ? '전체 수집 완료'
                  : `수집 진행 ${attempt.completedGroupCount}/${attempt.groupCount} 광고그룹 · 미발행`}
            </p>
          )}
          {source?.latestComplete && (
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              사용 중인 데이터: {source.latestComplete.plan.startDate} ~{' '}
              {source.latestComplete.plan.endDate}
            </p>
          )}
        </div>

        <CollectionStartControl
          control={control}
          startLabel="키워드 수집"
          onStart={() => control.start()}
          onStop={control.stop}
        />
      </div>
    </div>
  );
}

/**
 * 셀피아 동기화 행. AdSyncRow 와 마찬가지로 readiness check 가 아닌 별도 행이라
 * 진행바 분모(N/5)를 바꾸지 않는다. 시작, 진행 중, 중단은 재고 화면과 같은 공용 수집
 * 컨트롤이 보여 주고, 행은 freshness 로 준비 상태만 표시한다.
 */
export function StockSyncRow() {
  const { control, state } = useSellpiaInventoryCollection();
  const readiness = state ? sellpiaReadiness(state) : null;

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] transition-all">
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
          <Boxes className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">셀피아 데이터</h3>
            <InfoDisclosure label="셀피아 데이터">
              <p>현재고만 받아 재고분석과 발주 판단을 최신으로 맞춰요.</p>
            </InfoDisclosure>
            {readiness && <SourceReadinessChip status={readiness} />}
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            마지막 수집 {formatRelative(state?.lastCompletedAt ?? null)}
          </p>
          {state?.status === 'failed' && state.errorMessage && (
            <p className="mt-1 text-xs text-[var(--danger)]">{state.errorMessage}</p>
          )}
          {state?.stopped && (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{COLLECTION_STOPPED_MESSAGE}</p>
          )}
        </div>

        <CollectionStartControl
          control={control}
          startLabel="재고 동기화"
          startTitle={SELLPIA_INVENTORY_START_TITLE}
          onStart={() => control.start()}
          onStop={control.stop}
        />
      </div>
    </div>
  );
}
