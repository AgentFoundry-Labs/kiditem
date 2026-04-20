'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  ArrowRight,
  RefreshCw,
  Puzzle,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { ReadinessCheck, ReadinessResponse } from '@kiditem/shared';

const SESSION_DISMISSED_KEY = 'kiditem.readiness.dismissed';
const EXTENSION_ID_KEY = 'kiditem-ext-id';

type ChromeRuntime = {
  runtime?: {
    sendMessage?: (id: string, msg: unknown, cb: (resp: unknown) => void) => void;
    lastError?: { message?: string };
  };
};

function getChrome(): ChromeRuntime | undefined {
  return (window as unknown as { chrome?: ChromeRuntime }).chrome;
}

function sendToExtension(
  id: string,
  message: unknown,
): Promise<{ success?: boolean; results?: unknown[]; error?: string }> {
  return new Promise((resolve, reject) => {
    try {
      const c = getChrome();
      if (!c?.runtime?.sendMessage) {
        reject(new Error('Chrome 익스텐션 API 미지원'));
        return;
      }
      c.runtime.sendMessage(id, message, (response: unknown) => {
        if (c.runtime?.lastError) {
          reject(new Error(c.runtime.lastError.message ?? '익스텐션 통신 실패'));
          return;
        }
        resolve(response as { success?: boolean; results?: unknown[]; error?: string });
      });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function StatusIcon({ status, pending }: { status: ReadinessCheck['status']; pending: boolean }) {
  if (pending) return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
  if (status === 'ok') return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
  if (status === 'stale') return <AlertTriangle className="h-5 w-5 text-amber-500" />;
  return <XCircle className="h-5 w-5 text-rose-500" />;
}

function statusChip(status: ReadinessCheck['status']) {
  if (status === 'ok')
    return { text: '수집 완료', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (status === 'stale')
    return { text: '최신일자 없음', class: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { text: '미수집', class: 'bg-rose-50 text-rose-700 border-rose-200' };
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

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function CalendarGrid({
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
  const expectedSet = new Set(expectedDates);

  // 첫 expected 일자의 YMD 를 그대로 파싱 — Date 변환 후 UTC 로 읽으면 시차만큼 전월로 밀림
  const [yStr, mStr] = expectedDates[0].split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10) - 1;
  const monthFirst = new Date(Date.UTC(year, month, 1));
  const monthLast = new Date(Date.UTC(year, month + 1, 0));
  const daysInMonth = monthLast.getUTCDate();
  const startWeekday = monthFirst.getUTCDay();

  const cells: Array<{ ymd: string; day: number } | null> = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ ymd, day });
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">
          {year}년 {month + 1}월 일자별 수집 현황
        </span>
        <span className="text-[11px] text-gray-500">
          수집 {expectedDates.length - missingDates.length} / {expectedDates.length}일
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={cn(
              'text-[10px] font-medium pb-1',
              i === 0 ? 'text-rose-400' : i === 6 ? 'text-blue-400' : 'text-gray-400',
            )}
          >
            {w}
          </div>
        ))}
        {cells.map((cell, idx) => {
          if (!cell) return <div key={`pad-${idx}`} className="h-9" />;
          const expected = expectedSet.has(cell.ymd);
          const missing = missingSet.has(cell.ymd);
          const isReference = cell.ymd === referenceDate;
          return (
            <div
              key={cell.ymd}
              title={cell.ymd}
              className={cn(
                'flex h-9 items-center justify-center rounded-md text-xs font-medium border transition',
                !expected
                  ? 'border-transparent text-gray-300'
                  : missing
                    ? 'border-rose-200 bg-rose-50 text-rose-600'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                isReference && 'ring-2 ring-blue-400 ring-offset-1',
              )}
            >
              {cell.day}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-500">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded border border-emerald-200 bg-emerald-50" /> 수집됨
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded border border-rose-200 bg-rose-50" /> 미수집
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded ring-2 ring-blue-400" /> 기준일(전일)
        </span>
      </div>
    </div>
  );
}

function CheckCard({
  check,
  onCollect,
  pending,
}: {
  check: ReadinessCheck;
  onCollect: (c: ReadinessCheck) => void;
  pending: boolean;
}) {
  const chip = statusChip(check.status);
  return (
    <div
      className={cn(
        'rounded-xl border bg-white p-4 transition',
        check.status === 'ok'
          ? 'border-emerald-200'
          : check.status === 'stale'
            ? 'border-amber-200'
            : 'border-rose-200',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          <StatusIcon status={check.status} pending={pending} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{check.label}</h3>
            <span
              className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', chip.class)}
            >
              {chip.text}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-600">{check.detail}</p>
          <p className="mt-0.5 text-[11px] text-gray-400">
            마지막 수집: {formatRelative(check.lastSyncedAt)}
          </p>
          {check.expectedDates && check.expectedDates.length > 0 && (
            <CalendarGrid
              expectedDates={check.expectedDates}
              missingDates={check.missingDates ?? []}
              referenceDate={check.referenceDate}
            />
          )}
        </div>
        {check.status !== 'ok' && (
          <button
            onClick={() => onCollect(check)}
            disabled={pending}
            className={cn(
              'shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
              check.collector === 'server'
                ? 'bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60'
                : 'bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60',
            )}
          >
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : check.collector === 'server' ? (
              <RefreshCw className="h-3 w-3" />
            ) : (
              <Puzzle className="h-3 w-3" />
            )}
            수집하기
          </button>
        )}
      </div>
    </div>
  );
}

/** 익스텐션 ID 자동 감지 — 저장된 ID 로 ping. 실패 시 null. */
async function detectExtensionId(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(EXTENSION_ID_KEY);
  if (!stored) return null;
  try {
    const r = await sendToExtension(stored, { action: 'ping' });
    if (r?.success) return stored;
  } catch {
    /* */
  }
  return null;
}

/** 익스텐션 미감지 시 fallback — 새 탭으로 URL 열어 content script 가 자동 동기화하게 함. */
function fallbackOpenTabs(urls: string[]) {
  for (const url of urls) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export default function ReadinessModal() {
  const [open, setOpen] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['readiness'],
    queryFn: () => apiClient.get<ReadinessResponse>('/api/readiness'),
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!query.data) return;
    if (query.data.allOk) return;
    const dismissed = sessionStorage.getItem(SESSION_DISMISSED_KEY);
    if (dismissed) return;
    setOpen(true);
  }, [query.data]);

  const close = () => {
    sessionStorage.setItem(SESSION_DISMISSED_KEY, '1');
    setOpen(false);
  };

  const collectMutation = useMutation({
    mutationFn: async (endpoint: string) => apiClient.post(endpoint, {}),
    onSuccess: async () => {
      toast.success('수집 완료');
      await query.refetch();
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : '수집 실패';
      toast.error(msg);
    },
    onSettled: () => setPendingKey(null),
  });

  const handleCollect = async (check: ReadinessCheck) => {
    if (check.collector === 'server') {
      if (!check.collectEndpoint) return;
      setPendingKey(check.key);
      collectMutation.mutate(check.collectEndpoint);
      return;
    }

    // extension
    if (!check.scrapeUrls || check.scrapeUrls.length === 0) {
      toast.error('수집 URL 없음');
      return;
    }

    setPendingKey(check.key);
    try {
      const eid = await detectExtensionId();
      if (!eid) {
        // 익스텐션 ID 없음 → 직접 새 탭 열기. content script 가 페이지에서 자동 동기화.
        fallbackOpenTabs(check.scrapeUrls);
        toast.info(
          `${check.scrapeUrls.length}개 탭을 열었습니다. 익스텐션이 자동 수집합니다.`,
          {
            description:
              '익스텐션 미등록 시 등록: 익스텐션 팝업 > "대시보드 연동 등록"',
            duration: 6000,
          },
        );
        // 잠시 기다린 후 refetch
        setTimeout(() => query.refetch(), 8000);
        return;
      }

      const result = await sendToExtension(eid, {
        action: 'scrapeTargets',
        urls: check.scrapeUrls.map((url: string, i: number) => ({
          id: `${check.key}-${i}`,
          url,
          label: check.label,
        })),
      });
      if (result?.success === false) throw new Error(result.error ?? '익스텐션 수집 실패');

      // 익스텐션이 즉시 응답 + 백그라운드 순차 실행 → 진행률 폴링
      const totalUrls = check.scrapeUrls.length;
      toast.info(`${totalUrls}개 날짜 순차 수집 시작`, { duration: 3000 });

      await new Promise<void>((resolve) => {
        const start = Date.now();
        const maxMs = totalUrls * 210_000; // 날짜당 최대 3.5분 여유
        const tick = async () => {
          try {
            const status = (await sendToExtension(eid, { action: 'getBatchScrapeStatus' })) as {
              status?: string;
              completed?: number;
              failed?: number;
              total?: number;
              current?: number;
            };
            if (status?.status === 'done' || status?.status === 'error' || status?.status === 'idle') {
              toast.success(
                `익스텐션 수집 완료 (${status?.completed ?? 0}/${status?.total ?? totalUrls})`,
              );
              resolve();
              return;
            }
            if (Date.now() - start > maxMs) {
              toast.warning(`수집 타임아웃 — ${status?.completed ?? 0}/${totalUrls} 완료`);
              resolve();
              return;
            }
            setTimeout(tick, 3000);
          } catch {
            resolve();
          }
        };
        tick();
      });
      await query.refetch();
    } catch (e) {
      // 익스텐션 통신 실패 → fallback 으로 새 탭 열기
      try {
        fallbackOpenTabs(check.scrapeUrls);
        toast.warning('익스텐션 통신 실패 — 탭으로 열어 자동 수집을 시도합니다', {
          description: e instanceof Error ? e.message : String(e),
          duration: 6000,
        });
        setTimeout(() => query.refetch(), 8000);
      } catch {
        toast.error(e instanceof Error ? e.message : '익스텐션 통신 실패');
      }
    } finally {
      setPendingKey(null);
    }
  };

  if (!open) return null;

  const data = query.data;
  const doneCount = data?.checks.filter((c: ReadinessCheck) => c.status === 'ok').length ?? 0;
  const totalCount = data?.checks.length ?? 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.06)]">
        <div className="p-6">
          <button
            onClick={close}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="mb-5">
            <h2 className="text-xl font-semibold tracking-tight text-gray-900">
              대시보드로 가기 전 확인
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              전일자 주문·광고 데이터와 월 합계가 수집됐는지 점검합니다.
            </p>
          </div>

          <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <div className="relative h-9 w-9">
                <svg className="h-9 w-9 -rotate-90 transform">
                  <circle cx="18" cy="18" r="14" className="fill-none stroke-gray-200" strokeWidth="3" />
                  <circle
                    cx="18"
                    cy="18"
                    r="14"
                    className="fill-none stroke-emerald-500 transition-all"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 14}
                    strokeDashoffset={2 * Math.PI * 14 * (1 - (totalCount ? doneCount / totalCount : 0))}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-gray-700">
                  {doneCount}/{totalCount}
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {data?.allOk ? '모든 데이터 준비 완료' : '수집이 필요한 항목이 있어요'}
                </p>
                <p className="text-[11px] text-gray-500">
                  {query.isLoading ? '상태 확인 중…' : `${totalCount}개 중 ${doneCount}개 완료`}
                </p>
              </div>
            </div>
            <button
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            >
              <RefreshCw className={cn('h-3 w-3', query.isFetching && 'animate-spin')} />
              새로고침
            </button>
          </div>

          <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
            {query.isLoading ? (
              <div className="flex items-center justify-center py-10 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              data?.checks.map((check: ReadinessCheck) => (
                <CheckCard
                  key={check.key}
                  check={check}
                  onCollect={handleCollect}
                  pending={pendingKey === check.key}
                />
              ))
            )}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <button
              onClick={close}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              나중에 하기
            </button>
            <button
              onClick={close}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition',
                data?.allOk
                  ? 'bg-violet-600 text-white hover:bg-violet-700'
                  : 'bg-slate-200 text-slate-500 cursor-not-allowed',
              )}
              disabled={!data?.allOk}
            >
              대시보드로 이동
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
