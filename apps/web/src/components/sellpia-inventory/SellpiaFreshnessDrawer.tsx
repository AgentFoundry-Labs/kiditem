'use client';

import * as Dialog from '@radix-ui/react-dialog';
import type { SellpiaImportRunSummary } from '@kiditem/shared/inventory';
import type { SellpiaInventoryFreshnessView } from '@kiditem/shared/sellpia-inventory-freshness';
import { X } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import { SellpiaManualImportForm } from './SellpiaManualImportForm';
import { SellpiaSyncHistory } from './SellpiaSyncHistory';

export function SellpiaFreshnessDrawer({
  open,
  onOpenChange,
  state,
  currentBasis,
  history,
  isHistoryLoading,
  userRole,
  ownerClaimToken,
  onCancel,
  onConfirmBinding,
  onRequestRefresh,
  onManualImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: SellpiaInventoryFreshnessView;
  currentBasis: SellpiaImportRunSummary | null;
  history: SellpiaImportRunSummary[];
  isHistoryLoading?: boolean;
  userRole: string;
  ownerClaimToken: string | null;
  onCancel: (claimToken: string) => void;
  onConfirmBinding: () => void;
  onRequestRefresh: () => void;
  onManualImport: (file: File, confirmed: true) => Promise<unknown>;
}) {
  const canConfirmBinding =
    !state.sourceBinding.confirmed && ['owner', 'admin'].includes(userRole);
  const canControl = Boolean(
    state.activeSync?.canControl
      && ownerClaimToken
      && state.activeSync.runId === ownerClaimToken,
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/20" />
        <Dialog.Content className="fixed right-0 top-0 z-[130] h-full w-full max-w-xl overflow-y-auto border-l border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-lg font-semibold text-[var(--text-primary)]">
                Sellpia 재고 최신성
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[var(--text-secondary)]">
                현재 재고 기준과 최근 동기화 시도를 구분해 확인합니다.
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="닫기" className="rounded-md p-2">
              <X aria-hidden="true" className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="mt-6 space-y-6">
            {canConfirmBinding ? (
              <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <h3 className="font-semibold">출처 연결 확인</h3>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt>origin</dt><dd>https://kiditem.sellpia.com</dd>
                  <dt>account</dt><dd>kiditem</dd>
                </dl>
                <button type="button" onClick={onConfirmBinding} className="mt-3 rounded-md bg-amber-800 px-3 py-2 font-semibold text-white">
                  출처 연결 확인
                </button>
              </section>
            ) : null}

            <section className="space-y-2">
              <h3 className="font-semibold text-[var(--text-primary)]">현재 재고 기준</h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt>파일</dt><dd>{currentBasis?.fileName ?? '-'}</dd>
                <dt>검증 시각</dt><dd>{formatDateTime(state.lastVerifiedAt)}</dd>
                <dt>만료 시각</dt><dd>{formatDateTime(state.expiresAt)}</dd>
                <dt>품질</dt>
                <dd>{currentBasis?.qualityReport?.issues.length
                  ? `${currentBasis.qualityReport.issues.length}개 경고`
                  : currentBasis ? '정상' : '-'}</dd>
              </dl>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-[var(--text-primary)]">최근 동기화 시도</h3>
              {state.activeSync ? (
                <div className="text-sm text-[var(--text-secondary)]">
                  <p>진행 중 · {state.refreshReason ?? '-'}</p>
                  <p>시작 {formatDateTime(state.activeSync.startedAt)}</p>
                  {canControl ? (
                    <button
                      type="button"
                      onClick={() => onCancel(state.activeSync!.runId)}
                      className="mt-2 rounded-md border border-red-300 px-3 py-2 font-medium text-red-700"
                    >
                      동기화 취소
                    </button>
                  ) : null}
                </div>
              ) : state.lastAttempt ? (
                <div className="text-sm text-[var(--text-secondary)]">
                  <p>{state.lastAttempt.status === 'completed' ? '완료' : '실패'} · {state.lastAttempt.trigger ?? '-'}</p>
                  <p>{state.lastAttempt.errorMessage ?? formatDateTime(state.lastAttempt.attemptedAt)}</p>
                </div>
              ) : <p className="text-sm text-[var(--text-secondary)]">시도 이력이 없습니다.</p>}
              {!state.activeSync && state.status !== 'fresh' ? (
                <button type="button" onClick={onRequestRefresh} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium">
                  다시 갱신
                </button>
              ) : null}
            </section>

            <SellpiaManualImportForm onSubmit={onManualImport} />
            <SellpiaSyncHistory items={history} isLoading={isHistoryLoading} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
