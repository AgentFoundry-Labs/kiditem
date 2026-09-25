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
  readLatestCoupangReviewCollection,
  resolveCoupangReviewAccountId,
  reviewExtensionGateMessage,
  startCoupangReviewCollection,
  type ReviewCollectionStatus,
} from '../lib/review-extension';

/** 실행 중일 때만 서버 실행을 다시 읽는다. */
const POLL_INTERVAL_MS = 2_000;

type ActiveStatus = Exclude<ReviewCollectionStatus, { status: 'idle' }>;

interface Props {
  /** 수집이 끝나면 리뷰 목록을 다시 불러온다. */
  onCollected: () => void;
}

/**
 * 쿠팡 Wing 상품평 수집(실행 kind `orders.coupang_reviews`).
 *
 * 쿠팡은 판매자 상품평 Open API를 제공하지 않아 확장이 Wing 상품평 검색을 읽는다. Wing이 1개월 단위
 * 조회만 허용하므로 기간을 늘리면 그만큼 요청 횟수(=시간)가 늘어난다. 진행·결과는 서버 실행에서 읽는다.
 */
export function CoupangReviewCollectSection({ onCollected }: Props) {
  const [months, setMonths] = useState<number>(DEFAULT_REVIEW_COLLECTION_MONTHS);
  const [extensionId, setExtensionId] = useState<string | null>(null);
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<ActiveStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const notifiedRef = useRef<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

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
      // 페이지를 다시 열어도 돌고 있는 실행은 서버에서 이어서 본다. 끝난 실행은 새로 보이지 않는다.
      const latest = await readLatestCoupangReviewCollection().catch(() => null);
      if (cancelled || !latest || latest.status !== 'running') return;
      setStatus(latest);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const operationId = status?.operationId ?? null;
  useEffect(() => {
    if (!isRunning || !operationId) return;
    const timer = window.setInterval(() => {
      readLatestCoupangReviewCollection()
        .then((next) => {
          // 더 늦은 읽기가 다른 실행을 가리키면(다른 창에서 새로 시작) 그 실행을 따른다.
          if (next.status !== 'idle') setStatus(next);
        })
        .catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isRunning, operationId]);

  useEffect(() => {
    if (!status || status.status === 'running') return;
    if (notifiedRef.current === status.operationId) return;
    notifiedRef.current = status.operationId;
    idempotencyKeyRef.current = null;
    setCancelling(false);
    onCollected();
  }, [status, onCollected]);

  const start = useCallback(async () => {
    if (!extensionId) return;
    setError(null);
    setStarting(true);
    try {
      idempotencyKeyRef.current ??= createSecureRandomUuid();
      const channelAccountId = await resolveCoupangReviewAccountId();
      await startCoupangReviewCollection(extensionId, { channelAccountId, months }, idempotencyKeyRef.current);
      const latest = await readLatestCoupangReviewCollection();
      if (latest.status !== 'idle') setStatus(latest);
    } catch (e) {
      setError(e instanceof Error ? e.message : '쿠팡 리뷰 수집 시작 실패');
    } finally {
      setStarting(false);
    }
  }, [extensionId, months]);

  const cancel = useCallback(async () => {
    if (!operationId) return;
    setError(null);
    setCancelling(true);
    try {
      await cancelCoupangReviewCollection(operationId);
    } catch (e) {
      setCancelling(false);
      setError(e instanceof Error ? e.message : '쿠팡 리뷰 수집 중단 실패');
    }
  }, [operationId]);

  const total = status?.total ?? 0;
  const completed = status?.completed ?? 0;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <div className="text-sm font-semibold text-slate-800">쿠팡 상품평 수집</div>
          <p className="mt-0.5 text-xs text-slate-500">
            확장프로그램이 Wing 상품평을 달마다 읽어 옵니다. 쿠팡이 1개월 단위
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
            disabled={cancelling}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            {cancelling ? '중단 중' : '중단'}
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

      {status && (
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
              {`${completed}/${total} 개월${status.current ? ` · ${status.current}` : ''}`}
            </span>
            <span>{`수집 ${formatNumber(status.collected)}건`}</span>
            {status.inserted !== null && status.updated !== null && (
              <span>{`신규 ${formatNumber(status.inserted)} · 갱신 ${formatNumber(status.updated)}`}</span>
            )}
          </div>
          {status.error && <p className="text-xs text-red-600">{status.error}</p>}
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
