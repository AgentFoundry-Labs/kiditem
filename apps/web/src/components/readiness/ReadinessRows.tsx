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
import { toast } from 'sonner';
import { businessDateKey, toBusinessDate } from '@kiditem/shared/common';
import { snapshotBasisPartial, snapshotBasisStatus } from '@kiditem/shared/dashboard';
import {
  SOURCE_READINESS_LABELS,
  sourceReadinessStatus,
  type SourceReadinessStatus,
} from '@kiditem/shared/source-readiness';
import { adCampaignSweepCollection } from '@/app/(advertising)/ad-ops/lib/ad-campaign-collection';
import { adKeywordCollection } from '@/app/(advertising)/ad-ops/lib/ad-keyword-collection';
import { SELLPIA_INVENTORY_START_TITLE } from '@/app/(inventory)/_shared/SellpiaSyncAction';
import { useSellpiaInventoryCollection } from '@/app/(inventory)/_shared/sellpia-inventory-source-owner';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import {
  sellpiaSalesCollection,
  sellpiaSalesReadinessRange,
} from '@/lib/sellpia-sales-source-collection';
import { cn, formatNumber, timeAgo } from '@/lib/utils';
import { InfoDisclosure } from '@/components/ui/InfoDisclosure';
import {
  buildCoupangCatalogProgress,
  resolveCoupangCatalogError,
} from '@/app/(product-pipeline)/product-pipeline/registered-products/lib/coupang-catalog-progress';
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

function collectLabel(check: ReadinessCheck, catalog?: CatalogReadinessState): string {
  const overallState = catalog ? catalogOverallState(catalog) : null;
  if (check.key === 'wing_kpi') return '순위 받기';
  if (check.key === 'coupang_products' && catalog && catalogWholeFlowPending(catalog)) {
    return '상태 확인 중';
  }
  if (check.key === 'coupang_products' && overallState === 'COMPLETE') return '다시 받기';
  if (check.key === 'coupang_products' && overallState === 'RUNNING' && !catalog?.browser?.active) {
    return '이어서 받기';
  }
  if (check.key === 'coupang_products') return '상품 받기';
  return '지금 받기';
}

function catalogWholeFlowPending(catalog: CatalogReadinessState): boolean {
  const owner = catalog.owner;
  const stage = owner?.currentStage ?? owner?.plan.stage;
  const hasPendingDetailsChild = owner?.plan.detailsIdempotencyKey != null;
  return Boolean(
    owner &&
    catalog.chainOverallState == null &&
    ((stage === 'details' && owner.currentAttemptId && owner.currentAttemptId !== owner.attemptId) ||
      (stage === 'basics' && owner.state === 'COMPLETE' && hasPendingDetailsChild)),
  );
}

function catalogPendingLabel(catalog: CatalogReadinessState): string {
  const stage = catalog.owner?.currentStage ?? catalog.owner?.plan.stage;
  return stage === 'details'
    ? '상세 상품 받기 상태 확인 중'
    : '전체 상품 받기 상태 확인 중';
}

function catalogOverallState(catalog: CatalogReadinessState) {
  if (catalog.chainOverallState != null) {
    // A basics owner is a valid saved partial publication, not a whole-flow
    // receipt. Only trust COMPLETE when the server also projects a terminal
    // details child onto that root; the child attempt/stage are the durable
    // chain proof, not the root's individual state.
    const owner = catalog.owner;
    const ownerStage = owner?.plan.stage ?? 'full';
    const hasDetailsReceipt = ownerStage !== 'basics' || (
      owner?.currentStage === 'details' &&
      owner.currentAttemptId != null &&
      owner.currentAttemptId !== owner.attemptId
    );
    if (catalog.chainOverallState === 'COMPLETE' && !hasDetailsReceipt) return null;
    return catalog.chainOverallState;
  }
  if (catalogWholeFlowPending(catalog)) return null;
  if ((catalog.owner?.plan.stage ?? 'full') === 'basics') return null;
  return catalog.owner?.overallState ?? catalog.owner?.state ?? null;
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

/** Sellpia inventory is ready only when fresh; it covers through the KST date of its last verification. */
function sellpiaReadiness(state: { status: string; lastVerifiedAt: string | null }): SourceReadinessStatus {
  const verifiedDate = toBusinessDate(state.lastVerifiedAt);
  return sourceReadinessStatus({
    ready: state.status === 'fresh',
    latestComplete: verifiedDate ? { actualCutoff: businessDateKey(verifiedDate) } : null,
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

function catalogPhaseLabel(catalog: CatalogReadinessState): string | null {
  const owner = catalog.owner;
  if (!owner) return null;
  const savedBasicsPartial =
    owner.state === 'COMPLETE' &&
    (owner.plan.stage ?? 'full') === 'basics' &&
    (owner.currentStage ?? 'basics') === 'basics' &&
    (owner.currentAttemptId ?? owner.attemptId) === owner.attemptId &&
    owner.plan.detailsIdempotencyKey == null;
  if (savedBasicsPartial) return '기본 목록 반영 완료 · 전체 상세 수집 필요';
  if (catalogWholeFlowPending(catalog)) return catalogPendingLabel(catalog);
  const overallState = catalogOverallState(catalog);
  if (overallState === 'COMPLETE') return '전체 상품 반영 완료';
  if (overallState === 'FAILED') return '수집 실패';
  if (catalog.browser?.attention) return '확인 필요';
  const stage = owner.currentStage ?? owner.plan.stage ?? 'full';
  switch (catalog.browser?.phase ?? owner.phase) {
    case 'discovery':
      return stage === 'details' ? '상세 목록 확인 중' : '기본 목록 확인 중';
    case 'hydration':
      return stage === 'details' ? '전체 상세 수집 중' : '상품 상세 수집 중';
    case 'ready_to_finalize':
      return '전체 상품 반영 준비';
    default:
      return '상품 받기 진행 중';
  }
}

function CatalogStatusBlock({
  catalog,
  pending,
}: {
  catalog: CatalogReadinessState;
  pending: boolean;
}) {
  const owner = catalog.owner;
  const browser = catalog.browser;
  const childPending = catalogWholeFlowPending(catalog);
  const overallState = catalogOverallState(catalog);
  const progress = owner
    ? buildCoupangCatalogProgress(
        owner,
        Date.now(),
        owner.plan.stage ?? 'full',
      )
    : null;
  const error = owner && overallState !== 'FAILED'
    ? resolveCoupangCatalogError({
        browserActive: browser?.active === true,
        extensionError: browser?.error ?? null,
        startError: catalog.actionError,
        serverError: owner.error?.message ?? null,
      })
    : null;
  const isRunning = overallState === 'RUNNING' ||
    (childPending && (owner?.overallState === 'RUNNING' || owner?.state === 'RUNNING'));

  return (
    <div className="mt-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="readiness-coupang-account" className="text-[11px] font-semibold text-[var(--text-secondary)]">
          쿠팡 계정
        </label>
        <select
          id="readiness-coupang-account"
          aria-label="쿠팡 계정"
          value={catalog.accountId ?? ''}
          onChange={(event) => catalog.setAccountId(event.target.value || null)}
          disabled={catalog.accountLocked || pending || catalog.isCancelling || isRunning || catalog.accountsLoading}
          className="h-7 min-w-[9rem] rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 text-[11px] font-medium text-[var(--text-secondary)] disabled:opacity-60"
        >
          {catalog.accounts.length === 0 && (
            <option value="">
              {catalog.accountsLoading ? '계정 확인 중…' : '쿠팡 계정 없음'}
            </option>
          )}
          {catalog.accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name?.trim() || account.id}
            </option>
          ))}
        </select>
        {catalog.owner && (
          <span className="text-[11px] font-semibold text-[var(--text-secondary)]" aria-live="polite">
            {catalogPhaseLabel(catalog)}
          </span>
        )}
      </div>

      {Boolean(catalog.accountsError) && (
        <p className="mt-1 text-[11px] text-[var(--danger)]">
          쿠팡 계정을 확인하지 못했습니다. 상품 받기를 다시 눌러 재시도해주세요.
        </p>
      )}
      {catalog.linkError && (
        <p className="mt-1 text-[11px] font-medium text-[var(--danger)]">{catalog.linkError}</p>
      )}
      {!catalog.accountsLoading && !catalog.accountsError && catalog.accounts.length === 0 && (
        <p className="mt-1 text-[11px] text-[var(--danger)]">
          활성 쿠팡 채널 계정이 없습니다. 채널 설정에서 먼저 연결해주세요.
        </p>
      )}
      {catalog.ownerLoading && !catalog.owner && (
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">기존 상품 받기 상태를 확인하는 중입니다.</p>
      )}
      {Boolean(catalog.ownerError) && (
        <p className="mt-1 text-[11px] text-[var(--danger)]">
          상품 받기 상태를 확인하지 못했습니다. 잠시 후 다시 확인해주세요.
        </p>
      )}
      {error && (
        <p className="mt-1 text-[11px] font-medium text-[var(--danger)]">{error}</p>
      )}
      {catalog.actionError && !error && (
        <p className="mt-1 text-[11px] font-medium text-[var(--danger)]">{catalog.actionError}</p>
      )}
      {catalog.cancelError && (
        <p className="mt-1 text-[11px] font-medium text-[var(--danger)]">
          {catalog.cancelError}
        </p>
      )}
      {childPending && (
        <p className="mt-1 text-[11px] font-medium text-amber-700">
          {catalogPendingLabel(catalog)}입니다. 잠시 후 다시 확인해주세요.
        </p>
      )}
      {browser?.error && !browser.attention && (
        <p className="mt-1 text-[11px] text-[var(--danger)]">{browser.error}</p>
      )}
      {browser?.attention && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-amber-700">
          <span>{browser.attention.message}</span>
          {browser.attention.canOpenTab && (
            <button
              type="button"
              onClick={() => void catalog.openAttention().catch((error) => {
                toast.error(error instanceof Error ? error.message : '확인 탭을 열지 못했습니다.');
              })}
              className="font-semibold underline underline-offset-2"
            >
              확인 탭 열기
            </button>
          )}
        </div>
      )}

      {owner && (
        <>
          {progress && (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-muted)]" aria-live="polite">
                <span>{progress.discoveredLabel}</span>
                <span>·</span>
                <span>{progress.hydratedLabel}</span>
                <span>·</span>
                <span className="text-[var(--text-secondary)]">{progress.publishedLabel}</span>
                <span>·</span>
                <span>{progress.publicationDetailsLabel}</span>
                {progress.rateLabel && <span>· {progress.rateLabel}</span>}
                {progress.etaLabel && <span>· {progress.etaLabel}</span>}
              </div>
              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface)]"
                role="progressbar"
                aria-label="쿠팡 상품 받기 진행률"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress.percent}
              >
                <div className="h-full rounded-full bg-[var(--primary)] transition-[width]" style={{ width: `${progress.percent}%` }} />
              </div>
              {progress.resumeLabel && (
                <p className="mt-1 text-[11px] text-amber-700">{progress.resumeLabel}</p>
              )}
            </>
          )}
          {overallState === 'FAILED' && (
            <p className="mt-1 text-[11px] text-[var(--danger)]">
              {owner.error?.message ??
                (owner.overallState === 'FAILED' && owner.state !== 'FAILED'
                  ? '전체 상품 받기가 완료되지 않았습니다. 서버 상태를 다시 확인해주세요.'
                  : error ?? '쿠팡 상품 받기에 실패했습니다.')} · 저장된 상품은 유지됩니다.
            </p>
          )}
          {overallState === 'COMPLETE' && owner.publication && (
            <p className="mt-1 text-[11px] text-emerald-700">
              {owner.publication.duplicate
                ? '변경 없이 최신 상품 상태를 확인했습니다.'
                : '상품·옵션·이미지 반영 결과를 확인했습니다.'}
            </p>
          )}
          {isRunning && (
            <button
              type="button"
              onClick={() => void catalog.cancel().catch(() => undefined)}
              disabled={catalog.isCancelling}
              className="mt-2 text-[11px] font-medium text-[var(--text-secondary)] underline underline-offset-2 disabled:opacity-60"
            >
              {catalog.isCancelling ? '중단 확인 중…' : '수집 중단'}
            </button>
          )}
        </>
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
  const isCatalog = check.key === 'coupang_products';
  const catalogWholeFlowPendingState = Boolean(catalog && catalogWholeFlowPending(catalog));
  const catalogState = catalog ? catalogOverallState(catalog) : null;
  const notBeforeMs = catalog?.owner?.error?.notBefore
    ? Date.parse(String(catalog.owner.error.notBefore))
    : Number.NaN;
  const catalogResumeBlocked = isCatalog && Number.isFinite(notBeforeMs) && notBeforeMs > Date.now();
  const catalogCanResume = isCatalog && catalogState === 'RUNNING' &&
    catalog?.browser?.active !== true && !catalogResumeBlocked && !catalogWholeFlowPendingState;
  const catalogRunningInBrowser = isCatalog && catalogState === 'RUNNING' && catalog?.browser?.active === true;
  // The campaign sweep keeps one control in this modal, 광고 동기화 below;
  // the ad readiness card only points to it.
  const collectsThroughAdSync = check.key === 'coupang_ads';
  // Sellpia sales keeps one shared control across readiness and the sales screens.
  const collectsThroughSalesControl = check.key === 'wing_sales';

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
        ) : (
          <button
            onClick={() => onCollect(check)}
            disabled={(pending && !catalogCanResume) || catalog?.isCancelling ||
              Boolean(catalogRunningInBrowser) || Boolean(catalogResumeBlocked) || catalogWholeFlowPendingState}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition',
              'bg-[var(--primary)] text-[var(--primary-contrast)] hover:bg-[var(--primary-hover)]',
              'disabled:opacity-60',
            )}
          >
            {catalogWholeFlowPendingState ? (
              <>상태 확인 중</>
            ) : pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                받는 중…
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                {catalogResumeBlocked ? '재개 대기' : collectLabel(check, catalog)}
              </>
            )}
          </button>
        )}
      </div>

      {isCatalog && catalog && (
        <div className="px-4 pb-3">
          <CatalogStatusBlock catalog={catalog} pending={pending} />
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
                ? (attempt.errorMessage ?? '수집 실패. 새로 수집해 주세요.')
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
                ? (attempt.errorMessage ?? '수집 실패. 새로 수집해 주세요.')
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
            마지막 검증 {formatRelative(state?.lastVerifiedAt ?? null)}
          </p>
          {state?.status === 'failed' && state.errorMessage && (
            <p className="mt-1 text-xs text-[var(--danger)]">{state.errorMessage}</p>
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
