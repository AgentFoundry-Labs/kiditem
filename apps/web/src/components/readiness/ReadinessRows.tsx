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
import { useAdKeywordCollect } from '@/app/(advertising)/ad-ops/hooks/useAdKeywordCollect';
import { useAdSync } from '@/app/(advertising)/ad-ops/hooks/useAdSync';
import { useSellpiaInventorySourceOwner } from '@/app/(inventory)/_shared/sellpia-inventory-source-owner';
import { cn, formatNumber } from '@/lib/utils';
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
  if (check.key === 'wing_sales') return '매출 받기';
  if (check.key === 'coupang_ads') return '광고 받기';
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
    case 'publishing':
      return 'DB 반영 중';
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
  const status = statusMeta(check.status);
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

  const subline = (() => {
    if (missingCount > 0) {
      return `최근 ${check.expectedDates?.length ?? missingCount}일 중 ${missingCount}일이 비어 있어요`;
    }
    if (check.status === 'stale') return '어제 데이터가 아직 반영되지 않았어요';
    return meta.hint;
  })();

  return (
    <div
      className={cn(
        'rounded-xl border bg-[var(--surface)] transition-all',
        check.status === 'stale' ? 'border-amber-200' : 'border-rose-200',
      )}
      data-readiness-item={check.key}
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
            <InfoDisclosure label={meta.title}>
              <p>{meta.hint}</p>
              {check.collector === 'extension' && (
                <p className="mt-1">브라우저 익스텐션에서 최신 데이터를 받아옵니다.</p>
              )}
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
            check.status === 'stale' ? 'text-amber-700' : 'text-[var(--text-secondary)]',
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

export function AdSyncRow({ onComplete }: { onComplete: () => void }) {
  const { source, status, loading, cancelling, run, cancel } = useAdSync({ onComplete });
  const isFresh = source.data?.status === 'READY';
  const isRunning = status?.state === 'RUNNING';

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
            {isFresh && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                최신
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            {source.data?.latestComplete
              ? `사용 중인 데이터: ${source.data.latestComplete.plan.startDate} ~ ${source.data.latestComplete.plan.endDate}${isFresh ? '' : ' · 갱신 필요'}`
              : '완료된 데이터가 없습니다. 전체 순회 완료 후 결과를 표시합니다.'}
          </p>
          {source.isError && (
            <p className="mt-1 text-xs text-[var(--danger)]">수집 상태를 확인하지 못했습니다.</p>
          )}
          {status && (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {status.state === 'FAILED'
                ? (status.errorMessage ?? '수집 실패. 새로 수집해 주세요.')
                : isRunning
                  ? `캠페인 ${status.campaignCount}개 수집 중 · 미발행`
                  : `전체 수집 완료${status.rawOnlyCampaignCount ? ` · ${status.rawOnlyCampaignCount}개 원본만 보존` : ''}`}
            </p>
          )}
        </div>

        <button
          onClick={() => void run()}
          disabled={loading || cancelling || source.isPending || source.isError}
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
              {isRunning ? '진행 확인·이어서 수집' : '광고 동기화'}
            </>
          )}
        </button>
      </div>
      {isRunning && (
        <button type="button" onClick={() => void cancel()} disabled={cancelling}
          className="mx-4 mb-4 text-xs text-[var(--text-secondary)] disabled:opacity-60">
          {cancelling ? '중단 확인 중…' : '수집 중단'}
        </button>
      )}
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
export function AdKeywordRow({ onComplete }: { onComplete: () => void }) {
  const { source, status, loading, cancelling, run, cancel } = useAdKeywordCollect({ onComplete });
  const canContinue = status?.state === 'RUNNING';

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
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            완료본 유지 · 필요하면 명시적으로 다시 실행
          </p>
          {source.isError && (
            <p className="mt-1 text-xs text-[var(--danger)]">
              수집 상태를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.
            </p>
          )}
          {status && (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {status.state === 'FAILED'
                ? (status.errorMessage ?? '수집 실패. 새로 수집해 주세요.')
                : status.state === 'COMPLETE'
                  ? '전체 수집 완료'
                  : `수집 진행 ${status.completedGroupCount}/${status.groupCount} 광고그룹 · 미발행`}
            </p>
          )}
          {source.data?.latestComplete && (
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              사용 중인 데이터: {source.data.latestComplete.plan.startDate} ~{' '}
              {source.data.latestComplete.plan.endDate}
              {source.data.status === 'STALE' ? ' · 갱신 필요' : ''}
            </p>
          )}
        </div>

        <button
          onClick={() => void run()}
          disabled={loading || cancelling || source.isPending || source.isError}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition',
            'bg-[var(--primary)] text-[var(--primary-contrast)] hover:bg-[var(--primary-hover)]',
            'disabled:opacity-60',
          )}
        >
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              수집 중…
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              {canContinue ? '이어서 수집' : '키워드 수집'}
            </>
          )}
        </button>
      </div>
      {canContinue && (
        <button
          type="button"
          onClick={() => void cancel()}
          disabled={cancelling}
          className="mx-4 mb-4 text-xs text-[var(--text-secondary)] disabled:opacity-60"
        >
          {cancelling ? '중단 확인 중…' : '수집 중단'}
        </button>
      )}
    </div>
  );
}

const STOCK_SYNC_STATUS: Record<string, { text: string; chipClass: string }> = {
  fresh: { text: '최신', chipClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  refresh_required: { text: '갱신 필요', chipClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  syncing: { text: '갱신 중', chipClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  failed: { text: '실패', chipClass: 'bg-rose-50 text-rose-700 border-rose-200' },
};

/**
 * 셀피아 동기화 행. AdSyncRow 와 마찬가지로 readiness check 가 아닌 별도 행이라
 * 진행바 분모(N/5)를 바꾸지 않는다. 공유 freshness 상태를 읽고 source-owner attempt 만
 * 시작한다 — TTL 계산이나 브라우저 수집 타이머를 자체 보유하지 않는다.
 */
export function StockSyncRow() {
  const { state, start, isStarting } = useSellpiaInventorySourceOwner({ enabled: true });
  const [requesting, setRequesting] = useState(false);
  const busy = requesting || isStarting || state?.status === 'syncing';
  const meta = state ? STOCK_SYNC_STATUS[state.status] : null;

  const run = async () => {
    setRequesting(true);
    try {
      await start();
      toast.success('셀피아 재고 동기화를 시작했습니다.');
    } catch {
      toast.error('셀피아 재고 동기화 요청에 실패했습니다.');
    } finally {
      setRequesting(false);
    }
  };

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
            {meta && (
              <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', meta.chipClass)}>
                {meta.text}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            마지막 검증 {formatRelative(state?.lastVerifiedAt ?? null)}
          </p>
        </div>

        <button
          onClick={() => void run()}
          disabled={busy}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition',
            'bg-[var(--primary)] text-[var(--primary-contrast)] hover:bg-[var(--primary-hover)]',
            'disabled:opacity-60',
          )}
        >
          {busy ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              동기화 중…
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              재고 동기화
            </>
          )}
        </button>
      </div>
    </div>
  );
}
