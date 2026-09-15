'use client';

import { useQuery } from '@tanstack/react-query';
import { useCoupangCatalogCollection } from '@/app/(product-pipeline)/product-pipeline/registered-products/hooks/use-coupang-catalog-collection';
import {
  catalogImportResumable,
  catalogImportState,
  catalogImportStopped,
  coupangCatalogSourceQueryOptions,
  currentCatalogAttempt,
} from '@/app/(product-pipeline)/product-pipeline/registered-products/lib/coupang-catalog-collection';
import { buildCoupangCatalogProgress } from '@/app/(product-pipeline)/product-pipeline/registered-products/lib/coupang-catalog-progress';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import type { CollectionControlView } from '@/hooks/use-collection-source-control';
import { COLLECTION_STOPPED_MESSAGE } from '@/lib/collection-source-status-query';
import type {
  CoupangCatalogCollectionRun,
  CoupangCatalogSourceStatus,
} from '@kiditem/shared/coupang-catalog-snapshot';
import type { CatalogReadinessState } from './useReadinessCollection';

const START_TITLE = '선택한 쿠팡 계정의 Wing 등록 상품을 기본 목록부터 전체 상세까지 받습니다.';
const HANGUL = /[가-힣]/;
// Nothing can start before an account is chosen.
const NO_ACCOUNT_VIEW: CollectionControlView = {
  state: 'idle',
  statusRead: 'current',
  running: null,
  canStop: false,
  notice: null,
};

function startLabel(status: CoupangCatalogSourceStatus | undefined): string {
  if (catalogImportResumable(status)) return '이어서 받기';
  return catalogImportState(status) === null ? '상품 받기' : '다시 받기';
}

function phaseLabel(status: CoupangCatalogSourceStatus): string | null {
  const root = status.latestAttempt;
  const current = currentCatalogAttempt(status);
  if (!root || !current) return null;
  const state = catalogImportState(status);
  if (state === 'COMPLETE') {
    const savedBasicsOnly = (root.plan.stage ?? 'full') === 'basics' &&
      !status.detailsAttempt && !root.plan.detailsIdempotencyKey;
    return savedBasicsOnly ? '기본 목록 반영 완료 · 전체 상세 수집 필요' : '전체 상품 반영 완료';
  }
  if (state === 'FAILED') return catalogImportStopped(status) ? '수집 중단됨' : '수집 실패';
  if (current.error?.code === 'WING_PROVIDER_RATE_LIMITED') {
    return catalogImportResumable(status)
      ? 'Wing 요청 한도 대기 끝 · 이어서 받을 수 있음'
      : 'Wing 요청 한도 대기 중';
  }
  const stage = current.plan.stage ?? 'full';
  switch (current.phase) {
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

function failureMessage(run: CoupangCatalogCollectionRun): string {
  if (run.error?.code === 'ATTEMPT_EXPIRED') return '수집 시간이 지나 끝났습니다.';
  const message = run.error?.message?.trim() ?? '';
  return HANGUL.test(message) ? message : '쿠팡 상품 받기에 실패했습니다.';
}

/**
 * The readiness card's 상품 받기 for the selected Coupang account: the shared
 * collection control, so its running account, refusal and stop match every
 * other control of that account.
 */
export function CatalogReadinessAction({ catalog }: { catalog: CatalogReadinessState }) {
  if (!catalog.accountId || catalog.linkError) {
    const reason = catalog.linkError ??
      (catalog.accountsLoading ? '쿠팡 계정을 확인하는 중입니다.' : '쿠팡 계정을 선택해 주세요.');
    return (
      <CollectionStartControl
        control={NO_ACCOUNT_VIEW}
        startLabel="상품 받기"
        startBlockedReason={reason}
        onStart={() => undefined}
        onStop={() => undefined}
        className="self-center"
      />
    );
  }
  const account = catalog.accounts.find((candidate) => candidate.id === catalog.accountId);
  return (
    <CatalogStartControl
      channelAccountId={catalog.accountId}
      accountName={account?.name?.trim() || null}
    />
  );
}

function CatalogStartControl({
  channelAccountId,
  accountName,
}: {
  channelAccountId: string;
  accountName: string | null;
}) {
  const control = useCoupangCatalogCollection(channelAccountId, accountName);
  return (
    <CollectionStartControl
      control={control}
      startLabel={startLabel(control.status)}
      startTitle={START_TITLE}
      onStart={() => control.start()}
      onStop={control.stop}
      className="self-center"
    />
  );
}

/** The Coupang account choice and the chosen account's import progress from the owner read. */
export function CatalogReadinessStatus({ catalog }: { catalog: CatalogReadinessState }) {
  const source = useQuery({
    ...coupangCatalogSourceQueryOptions(catalog.accountId ?? ''),
    enabled: Boolean(catalog.accountId),
  });
  const status = catalog.accountId ? source.data : undefined;
  const label = status ? phaseLabel(status) : null;

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
          disabled={catalog.accountLocked || catalog.accountsLoading || catalogImportState(status) === 'RUNNING'}
          className="h-7 min-w-[9rem] rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 text-[11px] font-medium text-[var(--text-secondary)] disabled:opacity-60"
        >
          {(catalog.accounts.length === 0 || !catalog.accountId) && (
            <option value="">
              {catalog.accountsLoading
                ? '계정 확인 중…'
                : catalog.accounts.length === 0
                  ? '쿠팡 계정 없음'
                  : '계정 선택'}
            </option>
          )}
          {catalog.accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name?.trim() || account.id}
            </option>
          ))}
        </select>
        {label && (
          <span className="text-[11px] font-semibold text-[var(--text-secondary)]" aria-live="polite">
            {label}
          </span>
        )}
      </div>

      {Boolean(catalog.accountsError) && (
        <p className="mt-1 text-[11px] text-[var(--danger)]">
          쿠팡 계정을 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.
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
      {status && <CatalogImportProgress status={status} />}
    </div>
  );
}

function CatalogImportProgress({ status }: { status: CoupangCatalogSourceStatus }) {
  const current = currentCatalogAttempt(status);
  if (!current) return null;
  const state = catalogImportState(status);
  const progress = buildCoupangCatalogProgress(current, Date.now(), current.plan.stage ?? 'full');

  return (
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
      {state === 'RUNNING' && progress.resumeLabel && (
        <p className="mt-1 text-[11px] text-[var(--warning)]">{progress.resumeLabel}</p>
      )}
      {state === 'FAILED' && (catalogImportStopped(status) ? (
        <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{COLLECTION_STOPPED_MESSAGE}</p>
      ) : (
        <p className="mt-1 text-[11px] text-[var(--danger)]">
          {failureMessage(current)} 저장된 상품은 유지됩니다.
        </p>
      ))}
      {state === 'COMPLETE' && current.publication && (
        <p className="mt-1 text-[11px] text-[var(--success)]">
          {current.publication.duplicate
            ? '변경 없이 최신 상품 상태를 확인했습니다.'
            : '상품·옵션·이미지 반영 결과를 확인했습니다.'}
        </p>
      )}
    </>
  );
}
