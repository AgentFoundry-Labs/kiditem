'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import {
  DEFAULT_REVIEW_COLLECTION_MONTHS,
  REVIEW_COLLECTION_MONTH_OPTIONS,
  cancelCoupangReviewCollection,
  detectReviewExtensionGate,
  getCoupangReviewCollectionStatus,
  recoverCoupangReviewCollection,
  reviewExtensionGateMessage,
  runCoupangReviewCollection,
  type ReviewCollectionStatus,
} from '../lib/review-extension';

const POLL_INTERVAL_MS = 1500;

interface Props {
  /** 수집이 끝나면 리뷰 목록을 다시 불러온다. */
  onCollected: () => void;
}

/**
 * 쿠팡 Wing 상품평 크롤링 수집 트리거.
 *
 * 쿠팡은 판매자 상품평 Open API 를 제공하지 않아, 확장이 Wing 상품평 화면을
 * 백그라운드 탭에서 크롤링한다. Wing 이 1개월 단위 조회만 허용하므로 기간을
 * 늘리면 그만큼 요청 횟수(=시간)가 늘어난다.
 */
export function CoupangReviewCollectSection({ onCollected }: Props) {
  const [months, setMonths] = useState<number>(DEFAULT_REVIEW_COLLECTION_MONTHS);
  const [extensionId, setExtensionId] = useState<string | null>(null);
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<ReviewCollectionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const notifiedRunIdRef = useRef<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const attemptControlRef = useRef<{ runId: string; attemptToken: string } | null>(null);

  const isRunning = status?.status === 'running';

  useEffect(() => {
    let cancelled = false;
    detectReviewExtensionGate().then(async (gate) => {
      if (cancelled) return;
      setGateMessage(reviewExtensionGateMessage(gate));
      if (gate.status !== 'ready') {
        setExtensionId(null);
        return;
      }
      setExtensionId(gate.extensionId);
      const recovered = await recoverCoupangReviewCollection(gate.extensionId).catch(() => null);
      if (cancelled || !recovered || recovered.status === 'idle') return;
      setStatus(recovered);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!extensionId || !isRunning) return;
    const runId = status?.runId ?? null;
    const timer = window.setInterval(() => {
      getCoupangReviewCollectionStatus(extensionId, runId)
        .then((nextStatus) => {
          setStatus((currentStatus) => {
            // A late read from an older poll must not replace a newer attempt.
            if (currentStatus?.runId !== runId || nextStatus.runId !== runId) {
              return currentStatus;
            }
            const control = attemptControlRef.current;
            return control?.runId === nextStatus.runId
              ? { ...nextStatus, attemptToken: control.attemptToken }
              : nextStatus;
          });
        })
        .catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [extensionId, isRunning, status?.runId]);

  useEffect(() => {
    if (!status || status.status === 'running' || status.status === 'idle') return;
    const runId = status.runId ?? null;
    if (notifiedRunIdRef.current === runId) return;
    notifiedRunIdRef.current = runId;
    idempotencyKeyRef.current = null;
    attemptControlRef.current = null;
    onCollected();
  }, [status, onCollected]);

  const start = useCallback(async () => {
    if (!extensionId) return;
    setError(null);
    setStarting(true);
    notifiedRunIdRef.current = null;
    attemptControlRef.current = null;
    try {
      idempotencyKeyRef.current ??= createSecureRandomUuid();
      const response = await runCoupangReviewCollection(
        extensionId,
        months,
        idempotencyKeyRef.current,
      );
      if (response.runId && response.attemptToken) {
        attemptControlRef.current = {
          runId: response.runId,
          attemptToken: response.attemptToken,
        };
      }
      setStatus(response);
    } catch (e) {
      setError(e instanceof Error ? e.message : '쿠팡 리뷰 수집 시작 실패');
    } finally {
      setStarting(false);
    }
  }, [extensionId, months]);

  const cancel = useCallback(async () => {
    if (!extensionId) return;
    setError(null);
    const runId = status?.runId ?? null;
    const control = attemptControlRef.current;
    try {
      await cancelCoupangReviewCollection(
        extensionId,
        runId,
        control?.runId === runId ? control.attemptToken : null,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '쿠팡 리뷰 수집 중단 실패');
    }
  }, [extensionId, status?.runId]);

  const total = status?.total ?? 0;
  const completed = status?.completed ?? 0;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <div className="text-sm font-semibold text-slate-800">쿠팡 상품평 수집</div>
          <p className="mt-0.5 text-xs text-slate-500">
            Wing 상품평 화면을 확장프로그램이 직접 크롤링합니다. 쿠팡이 1개월 단위
            조회만 허용해 기간이 길수록 오래 걸립니다.
          </p>
        </div>

        <select
          value={months}
          onChange={(event) => setMonths(Number(event.target.value))}
          disabled={isRunning}
          className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 disabled:opacity-50"
          aria-label="수집 기간"
        >
          {REVIEW_COLLECTION_MONTH_OPTIONS.map((option) => (
            <option key={option} value={option}>
              최근 {option}개월
            </option>
          ))}
        </select>

        {isRunning ? (
          <button
            onClick={cancel}
            disabled={!!status?.cancelRequested}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            {status?.cancelRequested ? '중단 중' : '중단'}
          </button>
        ) : (
          <button
            onClick={start}
            disabled={!extensionId || starting}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {starting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            리뷰 수집
          </button>
        )}
      </div>

      {gateMessage && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {gateMessage}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      {status && status.status !== 'idle' && (
        <div className="mt-3 space-y-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                status.status === 'error' ? 'bg-red-500' : 'bg-purple-500',
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            <span className="font-medium text-slate-700">
              {statusLabel(status.status)}
            </span>
            <span>
              {completed}/{total} 개월
              {status.current ? ` · ${status.current}` : ''}
            </span>
            <span>수집 {formatNumber(status.collected ?? 0)}건</span>
            <span>
              신규 {formatNumber(status.created ?? 0)} · 갱신{' '}
              {formatNumber(status.updated ?? 0)}
            </span>
            {(status.unlinked ?? 0) > 0 && (
              <span className="text-amber-600">
                상품 미매칭 {formatNumber(status.unlinked ?? 0)}건
              </span>
            )}
          </div>
          {status.error && <p className="text-xs text-red-600">{status.error}</p>}
          {!!status.failures?.length && (
            <p className="text-xs text-amber-600">
              실패 구간: {status.failures.map((f) => f.month).join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function statusLabel(status: string): string {
  if (status === 'running') return '수집 중';
  if (status === 'done') return '수집 완료';
  if (status === 'cancelled') return '중단됨';
  if (status === 'error') return '수집 실패';
  return status;
}
