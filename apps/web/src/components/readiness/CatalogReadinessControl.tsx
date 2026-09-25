'use client';

import { useQuery } from '@tanstack/react-query';
import { useWingCatalogCollection } from '@/app/(product-pipeline)/product-pipeline/registered-products/hooks/use-wing-catalog-collection';
import {
  accountCatalogOperations,
  runningCatalogOperation,
  wingCatalogOperationsQueryOptions,
} from '@/app/(product-pipeline)/product-pipeline/registered-products/lib/wing-catalog-collection';
import { describeAccountCatalog } from '@/app/(product-pipeline)/product-pipeline/registered-products/lib/wing-catalog-progress';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import type { CollectionControlView } from '@/hooks/use-collection-source-control';
import { COLLECTION_STOPPED_MESSAGE } from '@/lib/collection-source-status-query';
import type { OperationView } from '@kiditem/shared/operation';
import type { CatalogReadinessState } from './useReadinessCollection';

const START_TITLE = '선택한 쿠팡 계정의 Wing 등록 상품 목록을 받고, 바뀐 상품만 상세를 받습니다.';
// Nothing can start before an account is chosen.
const NO_ACCOUNT_VIEW: CollectionControlView = {
  state: 'idle',
  statusRead: 'current',
  running: null,
  canStop: false,
  notice: null,
};

function startLabel(latest: OperationView | null): string {
  return latest === null ? '상품 받기' : '다시 받기';
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
  const control = useWingCatalogCollection(channelAccountId, accountName);
  const latest = accountCatalogOperations(control.status, channelAccountId)[0] ?? null;
  return (
    <CollectionStartControl
      control={control}
      startLabel={startLabel(latest)}
      startTitle={START_TITLE}
      onStart={() => control.start()}
      onStop={control.stop}
      className="self-center"
    />
  );
}

/** 쿠팡 계정 선택과 그 계정의 최근 Wing 카탈로그 실행(실행 reader). */
export function CatalogReadinessStatus({ catalog }: { catalog: CatalogReadinessState }) {
  const operations = useQuery({
    ...wingCatalogOperationsQueryOptions(),
    enabled: Boolean(catalog.accountId),
  });
  const accountOperations = catalog.accountId ? accountCatalogOperations(operations.data, catalog.accountId) : [];
  // 읽을 때마다(dataUpdatedAt) 다시 그려 상세를 기다리던 목록이 제시간을 넘기면 실패로 바뀐다.
  const view = describeAccountCatalog(accountOperations, Math.max(Date.now(), operations.dataUpdatedAt));

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
          disabled={catalog.accountLocked || catalog.accountsLoading || runningCatalogOperation(accountOperations) !== null}
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
        {view && (
          <span className="text-[11px] font-semibold text-[var(--text-secondary)]" aria-live="polite">
            {view.phase}
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
      {view && (
        <>
          {view.detail && view.tone !== 'failed' && (
            <p className="mt-2 text-[11px] text-[var(--text-muted)]" aria-live="polite">{view.detail}</p>
          )}
          {view.tone === 'running' && view.percent !== null && (
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface)]"
              role="progressbar"
              aria-label="쿠팡 상품 받기 진행률"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={view.percent}
            >
              <div className="h-full rounded-full bg-[var(--primary)] transition-[width]" style={{ width: `${view.percent}%` }} />
            </div>
          )}
          {view.tone === 'stopped' && (
            <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{COLLECTION_STOPPED_MESSAGE}</p>
          )}
          {view.tone === 'failed' && (
            <p className="mt-1 text-[11px] text-[var(--danger)]">{view.detail} 저장된 상품은 유지됩니다.</p>
          )}
        </>
      )}
    </div>
  );
}
