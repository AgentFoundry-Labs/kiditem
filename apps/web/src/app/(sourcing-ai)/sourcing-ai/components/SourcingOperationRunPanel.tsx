'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { OperationRun } from '@kiditem/shared/operations';
import {
  Sourcing1688BatchResultSchema,
  SourcingOperationResultSchema,
  type SourcingOperationResult,
} from '@kiditem/shared/sourcing';

const ACTIVE_STATUSES = new Set<OperationRun['status']>([
  'queued',
  'waiting_runtime',
  'waiting_dependency',
  'running',
  'attention_required',
]);

const STATUS_LABELS: Record<OperationRun['status'], string> = {
  queued: '대기열에서 준비 중',
  waiting_runtime: '브라우저 연결 대기 중',
  waiting_dependency: '선행 작업 대기 중',
  running: '작업 진행 중',
  attention_required: '운영자 확인 필요',
  succeeded: '작업 완료',
  failed: '작업 실패',
  cancelled: '작업 취소됨',
  skipped: '작업 건너뜀',
};

const STAGE_LABELS: Readonly<Record<string, string>> = {
  loading_targets: '대상 불러오는 중',
  waiting_browser: '브라우저 연결 대기 중',
  waiting_login: '로그인 확인 필요',
  collecting_keyword: '키워드 상품 수집 중',
  persisting: '수집 결과 저장 중',
  building_snapshot: '스냅샷 생성 중',
  searching_1688_keywords: '1688 키워드 검색 중',
  persisting_1688_keyword: '1688 키워드 결과 저장 중',
  matching_1688_images: '1688 이미지 매칭 중',
  persisting_1688_image_match: '1688 이미지 매칭 결과 저장 중',
  finalizing: '결과 마무리 중',
  completed: '작업 완료',
};

const BUTTON_CLASS_NAME =
  'rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] disabled:cursor-wait disabled:opacity-60';

export interface SourcingOperationRunPanelProps {
  run: OperationRun | null;
  onCancel?: () => void | Promise<void>;
  onRetryAttention?: () => void | Promise<void>;
  isCancelling?: boolean;
  isRetrying?: boolean;
  className?: string;
}

function toTimestamp(value: string | Date): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

function formatElapsed(
  startedAt: string | Date,
  finishedAt: string | Date | null,
  nowMs: number,
): string {
  const startMs = toTimestamp(startedAt);
  const endMs = finishedAt === null ? nowMs : toTimestamp(finishedAt);
  const seconds = Math.max(0, Math.floor((endMs - startMs) / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) return `${hours}시간 ${minutes}분`;
  if (minutes > 0) return `${minutes}분 ${remainingSeconds}초`;
  return `${remainingSeconds}초`;
}

function describeSucceeded(result: SourcingOperationResult): string {
  if (result.outcome === 'partial') {
    return `일부 수집 완료 · 반영 ${result.summary.accepted}개 · 실패 ${result.summary.failed}개`;
  }
  if (result.outcome === 'no_change') {
    return '변경 없음 · 새로 반영된 항목이 없습니다.';
  }
  return `수집 완료 · 반영 ${result.summary.accepted}개`;
}

export function SourcingOperationRunPanel({
  run,
  onCancel,
  onRetryAttention,
  isCancelling = false,
  isRetrying = false,
  className = '',
}: SourcingOperationRunPanelProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const malformedResultLoggedForRunRef = useRef<string | null>(null);
  const isActive = run !== null && ACTIVE_STATUSES.has(run.status);
  const parsedResult = useMemo(() => {
    if (run?.status !== 'succeeded') return null;
    const batchResult = Sourcing1688BatchResultSchema.safeParse(run.result);
    if (batchResult.success) return batchResult;
    return SourcingOperationResultSchema.safeParse(run.result);
  }, [run?.result, run?.status]);

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [isActive]);

  useEffect(() => {
    if (
      run === null
      || parsedResult === null
      || parsedResult.success
      || malformedResultLoggedForRunRef.current === run.id
    ) {
      return;
    }
    malformedResultLoggedForRunRef.current = run.id;
    console.error('[SourcingOperationRunPanel] Invalid operation result', {
      runId: run.id,
      issueCount: parsedResult.error.issues.length,
      issues: parsedResult.error.issues.slice(0, 5).map((issue) => ({
        code: issue.code,
        path: issue.path.slice(0, 4).map((part) => String(part).slice(0, 80)),
      })),
    });
  }, [parsedResult, run]);

  if (run === null) return null;

  const stageLabel = run.stage === null
    ? STATUS_LABELS[run.status]
    : STAGE_LABELS[run.stage] ?? STATUS_LABELS[run.status];
  const start = run.startedAt ?? run.createdAt;
  const elapsed = formatElapsed(start, run.finishedAt, nowMs);
  const hasCounts = run.progressCurrent !== null && run.progressTotal !== null;
  let terminalMessage: string | null = null;

  if (run.status === 'succeeded') {
    terminalMessage = parsedResult?.success
      ? describeSucceeded(parsedResult.data)
      : '작업이 완료되었습니다. 최신 스냅샷을 확인해주세요.';
  } else if (run.status === 'failed') {
    terminalMessage = run.error?.message ?? '작업에 실패했습니다. 다시 시도해주세요.';
  } else if (run.status === 'cancelled') {
    terminalMessage = '작업이 취소되었습니다.';
  } else if (run.status === 'skipped') {
    terminalMessage = '실행 조건이 맞지 않아 작업을 건너뛰었습니다.';
  }

  return (
    <section
      aria-live="polite"
      className={`rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-4 ${className}`.trim()}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{run.title}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{stageLabel}</p>
        </div>
        <p className="text-xs tabular-nums text-[var(--text-tertiary)]">경과 {elapsed}</p>
      </div>

      {hasCounts ? (
        <p className="mt-3 text-sm tabular-nums text-[var(--text-secondary)]">
          진행 {run.progressCurrent} / {run.progressTotal}
        </p>
      ) : null}

      {terminalMessage ? (
        <p className="mt-3 text-sm text-[var(--text-primary)]">{terminalMessage}</p>
      ) : null}

      {(isActive && onCancel) || (run.status === 'attention_required' && onRetryAttention) ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {run.status === 'attention_required' && onRetryAttention ? (
            <button
              type="button"
              className={BUTTON_CLASS_NAME}
              disabled={isRetrying}
              onClick={() => void onRetryAttention()}
            >
              다시 시도
            </button>
          ) : null}
          {isActive && onCancel ? (
            <button
              type="button"
              className={BUTTON_CLASS_NAME}
              disabled={isCancelling}
              onClick={() => void onCancel()}
            >
              취소
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
