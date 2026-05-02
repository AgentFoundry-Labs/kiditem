'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  ArrowRight,
  RefreshCw,
  X,
  ShoppingBag,
  Megaphone,
  Package,
  Trophy,
  Database,
  ChevronDown,
  Check,
  Sunrise,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import type { ReadinessCheck, ReadinessResponse } from '@kiditem/shared/readiness';
import { useAdSync } from '@/app/ad-ops/hooks/useAdSync';

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

type DisplayMeta = { title: string; hint: string; icon: LucideIcon };

const DISPLAY: Record<string, DisplayMeta> = {
  wing_sales: { title: '어제의 주문', hint: '매출·방문·장바구니', icon: ShoppingBag },
  coupang_ads: { title: '광고 성과', hint: '클릭·전환·지출', icon: Megaphone },
  coupang_products: { title: '상품 목록', hint: '등록된 SKU 동기화', icon: Package },
  wing_kpi: { title: '아이템위너 순위', hint: '경쟁 현황', icon: Trophy },
};

function getDisplay(check: ReadinessCheck): DisplayMeta {
  return DISPLAY[check.key] ?? { title: check.label, hint: check.detail, icon: Database };
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
          {formatShortDate(first)} – {formatShortDate(last)}
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

function CompactOkRow({ check }: { check: ReadinessCheck }) {
  const meta = getDisplay(check);
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--text-primary)]">{meta.title}</p>
      </div>
      <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
        <Check className="h-3 w-3 text-emerald-500" />
        {formatRelative(check.lastSyncedAt)} 업데이트
      </span>
    </div>
  );
}

function ActionCheckCard({
  check,
  onCollect,
  pending,
}: {
  check: ReadinessCheck;
  onCollect: (c: ReadinessCheck) => void;
  pending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = getDisplay(check);
  const Icon = meta.icon;
  const status = statusMeta(check.status);
  const missingCount = check.missingDates?.length ?? 0;
  const hasStrip = !!check.expectedDates && check.expectedDates.length > 0;

  const subline = (() => {
    if (missingCount > 0) return `최근 ${check.expectedDates!.length}일 중 ${missingCount}일이 비어 있어요`;
    if (check.status === 'stale') return '어제 데이터가 아직 반영되지 않았어요';
    return meta.hint;
  })();

  return (
    <div
      className={cn(
        'rounded-xl border bg-[var(--surface)] transition-all',
        check.status === 'stale' ? 'border-amber-200' : 'border-rose-200',
      )}
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
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{subline}</p>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            마지막 업데이트 {formatRelative(check.lastSyncedAt)}
          </p>
        </div>

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
      </div>

      {hasStrip && (
        <div className="border-t border-[var(--border-subtle)] px-4 pb-3 pt-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1 text-[11px] font-medium transition-colors',
              'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
            )}
          >
            <ChevronDown
              className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')}
            />
            {expanded ? '날짜별 현황 접기' : '날짜별 현황 보기'}
          </button>
          {expanded && (
            <DateStrip
              expectedDates={check.expectedDates!}
              missingDates={check.missingDates ?? []}
              referenceDate={check.referenceDate}
            />
          )}
        </div>
      )}
    </div>
  );
}

function AdSyncRow({ onComplete }: { onComplete: () => void }) {
  const { loading, run } = useAdSync({ onComplete });

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] transition-all">
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
          <Megaphone className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">광고 동기화</h3>
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            운영중 캠페인을 자동 순회하며 캠페인별 상품 데이터를 수집해요
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            새 탭에서 자동 처리 — 수 분 소요될 수 있어요
          </p>
        </div>

        <button
          onClick={run}
          disabled={loading}
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
              광고 동기화
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/** 익스텐션 ID 자동 감지.
 *  1) localStorage 에 저장된 ID 로 ping → 성공이면 채택.
 *  2) 저장 ID 가 없거나 실패하면 host-bridge.js (content script) 가 보내는
 *     postMessage("kiditem:ext-id") 를 짧게(최대 1.2s) 기다림. 페이지가 막
 *     열려서 content script 가 아직 안 박힌 케이스 회복.
 *  3) 그래도 없으면 페이지에서 직접 요청(postMessage) 후 한 번 더 대기.
 *  4) 끝까지 실패하면 null.
 */
async function detectExtensionId(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const tryPing = async (id: string): Promise<boolean> => {
    try {
      const r = await sendToExtension(id, { action: 'ping' });
      return !!r?.success;
    } catch {
      return false;
    }
  };

  const stored = localStorage.getItem(EXTENSION_ID_KEY);
  if (stored && (await tryPing(stored))) return stored;

  // postMessage 핸드셰이크 — content script 가 자동으로 broadcast 하거나, request 에 응답.
  const fromHandshake = await new Promise<string | null>((resolve) => {
    let done = false;
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data as { type?: string; extensionId?: string } | null;
      if (!data || data.type !== 'kiditem:ext-id' || !data.extensionId) return;
      if (done) return;
      done = true;
      window.removeEventListener('message', onMsg);
      try {
        localStorage.setItem(EXTENSION_ID_KEY, data.extensionId);
      } catch {
        /* noop */
      }
      resolve(data.extensionId);
    };
    window.addEventListener('message', onMsg);
    // 페이지 측에서 능동적으로도 요청
    try {
      window.postMessage({ type: 'kiditem:request-ext-id' }, window.location.origin);
    } catch {
      /* noop */
    }
    setTimeout(() => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMsg);
      resolve(null);
    }, 1200);
  });

  if (fromHandshake && (await tryPing(fromHandshake))) return fromHandshake;
  return null;
}

/** 익스텐션 미감지 시 fallback — 새 탭으로 URL 열어 content script 가 자동 동기화하게 함. */
function fallbackOpenTabs(urls: string[]) {
  for (const url of urls) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

interface ReadinessModalProps {
  /** 외부 controlled open. undefined 면 자동 열림 (allOk=false + 미dismissed). */
  open?: boolean;
  /** 외부 controlled close handler. */
  onClose?: () => void;
}

export default function ReadinessModal({ open: controlledOpen, onClose }: ReadinessModalProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (isControlled) {
      if (!v) onClose?.();
    } else {
      setInternalOpen(v);
    }
  };
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const invalidateCollectedData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
      queryClient.invalidateQueries({ queryKey: ['traffic'] }),
      queryClient.invalidateQueries({ queryKey: ['readiness'] }),
    ]);
  };

  const query = useQuery({
    queryKey: ['readiness'],
    queryFn: () => apiClient.get<ReadinessResponse>('/api/readiness'),
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (isControlled) return; // 외부 controlled 면 auto-open 비활성화
    if (!query.data) return;
    if (query.data.allOk) return;
    const dismissed = sessionStorage.getItem(SESSION_DISMISSED_KEY);
    if (dismissed) return;
    setInternalOpen(true);
  }, [query.data, isControlled]);

  const close = () => {
    if (!isControlled) {
      sessionStorage.setItem(SESSION_DISMISSED_KEY, '1');
    }
    setOpen(false);
  };

  const collectMutation = useMutation({
    mutationFn: async (endpoint: string) => apiClient.post(endpoint, {}),
    onSuccess: async () => {
      toast.success('수집 완료');
      await invalidateCollectedData();
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

    // 익스텐션 batch (scrapeTargets) → background 가 N개 URL 을 sequential 로 처리.
    //   25일 탭 열기 → 수집 → 닫기 → 26일 탭 열기 → 수집 → 닫기 → ...
    //   사용자가 한 번 클릭하면 모든 누락 일자가 자동으로 채워짐.
    // 익스텐션 미설치 fallback: 한 번에 새 탭 일괄 open (덜 안정적이지만 동작).
    if (!check.scrapeUrls || check.scrapeUrls.length === 0) {
      toast.error('수집 URL 없음');
      return;
    }

    setPendingKey(check.key);
    try {
      const eid = await detectExtensionId();
      if (!eid) {
        // 익스텐션 미설치 → 폴백: 한꺼번에 다 새 탭으로 (less ideal, but works)
        fallbackOpenTabs(check.scrapeUrls);
        toast.warning(
          `익스텐션 미연결 — ${check.scrapeUrls.length}개 탭 일괄 오픈`,
          {
            description:
              'chrome://extensions 에서 KIDITEM 익스텐션 등록하면 한 탭씩 자동 순차 수집됩니다.',
            duration: 8000,
          },
        );
        setTimeout(() => query.refetch(), 12000);
        return;
      }

      // 익스텐션 sequential batch 시작
      const startResp = await sendToExtension(eid, {
        action: 'scrapeTargets',
        urls: check.scrapeUrls.map((url: string, i: number) => ({
          id: `${check.key}-${i}`,
          url,
          label: check.label,
        })),
      });
      if (startResp?.success === false) {
        throw new Error(startResp.error ?? '익스텐션 수집 시작 실패');
      }

      const totalUrls = check.scrapeUrls.length;
      toast.info(`${totalUrls}일치 순차 수집 시작 — 한 탭씩 자동으로 처리됩니다`, {
        duration: 4000,
      });

      // 진행률 폴링 (chrome.storage.kiditem_batch_scrape) — 일자당 최대 3분 + 여유
      await new Promise<void>((resolve) => {
        const start = Date.now();
        const maxMs = totalUrls * 240_000;
        let lastCurrent = -1;
        const tick = async () => {
          try {
            const status = (await sendToExtension(eid, {
              action: 'getBatchScrapeStatus',
            })) as {
              status?: string;
              completed?: number;
              failed?: number;
              total?: number;
              current?: number;
              currentLabel?: string;
            };
            if (status?.current && status.current !== lastCurrent) {
              lastCurrent = status.current;
              toast.info(
                `[${status.current}/${status.total ?? totalUrls}] 수집 중...`,
                { duration: 2500 },
              );
            }
            if (
              status?.status === 'done' ||
              status?.status === 'error' ||
              status?.status === 'idle'
            ) {
              const ok = status?.completed ?? 0;
              const fail = status?.failed ?? 0;
              if (fail === 0) {
                toast.success(`${ok}/${status?.total ?? totalUrls}일 수집 완료`);
              } else {
                toast.warning(
                  `수집 종료: 성공 ${ok} / 실패 ${fail} / 전체 ${status?.total ?? totalUrls}`,
                );
              }
              resolve();
              return;
            }
            if (Date.now() - start > maxMs) {
              toast.warning(
                `수집 타임아웃 — ${status?.completed ?? 0}/${totalUrls} 완료`,
              );
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

      // coupang_ads: 일별 수집 후 캠페인별 상품 sweep 추가 — 광고 동기화와 동일 흐름.
      // 운영중/일시정지 상관없이 모든 캠페인의 상품 목록(상품명·on/off·집행광고비·전환율 등)
      // 을 자동 수집해 광고 전략용 스냅샷으로 적재.
      if (check.key === 'coupang_ads') {
        try {
          const sweepUrl = 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1';
          toast.info('캠페인별 상품 수집 시작 — 새 탭에서 처리됩니다', { duration: 4000 });
          const sweepResp = await sendToExtension(eid, {
            action: 'scrapeTargets',
            urls: [{ id: 'ad-sync-sweep', url: sweepUrl, label: '광고 동기화 (캠페인별 상품)' }],
          });
          if (sweepResp?.success !== false) {
            // 캠페인 N개 × ~30s. 최대 8분.
            await new Promise<void>((resolve) => {
              const sStart = Date.now();
              const sMaxMs = 8 * 60_000;
              const sTick = async () => {
                try {
                  const st = (await sendToExtension(eid, {
                    action: 'getBatchScrapeStatus',
                  })) as { status?: string; failed?: number };
                  if (
                    st?.status === 'done' ||
                    st?.status === 'error' ||
                    st?.status === 'idle'
                  ) {
                    if (st?.status === 'error') toast.error('광고 동기화 실패');
                    else if ((st?.failed ?? 0) > 0) toast.warning('광고 동기화 일부 실패');
                    else toast.success('광고 동기화 완료');
                    resolve();
                    return;
                  }
                  if (Date.now() - sStart > sMaxMs) {
                    toast.warning('광고 동기화 타임아웃 — 백그라운드에서 진행 중일 수 있습니다');
                    resolve();
                    return;
                  }
                  setTimeout(sTick, 3000);
                } catch {
                  resolve();
                }
              };
              sTick();
            });
          }
        } catch {
          /* sweep 실패는 일별 수집 결과를 무효화하지 않음 — 무시 */
        }
      }

      await invalidateCollectedData();
      await query.refetch();
    } catch (e) {
      // 익스텐션 통신 실패 → 폴백
      try {
        fallbackOpenTabs(check.scrapeUrls);
        toast.warning('익스텐션 통신 실패 — 폴백으로 탭 일괄 오픈', {
          description: e instanceof Error ? e.message : String(e),
          duration: 7000,
        });
        setTimeout(() => query.refetch(), 12000);
      } catch {
        toast.error(e instanceof Error ? e.message : '익스텐션 통신 실패');
      }
    } finally {
      setPendingKey(null);
    }
  };

  if (!open) return null;

  const data = query.data;
  const checks = data?.checks ?? [];
  const doneCount = checks.filter((c: ReadinessCheck) => c.status === 'ok').length;
  const totalCount = checks.length;
  const pendingCount = totalCount - doneCount;
  const progressRatio = totalCount ? doneCount / totalCount : 0;

  const actionChecks = checks.filter((c) => c.status !== 'ok');
  const okChecks = checks.filter((c) => c.status === 'ok');

  const headline = data?.allOk
    ? 'AI 가 직접 운영합니다'
    : pendingCount === 1
      ? '거의 다 됐어요, 하나만 더'
      : `${pendingCount}개만 업데이트하면 돼요`;

  const subhead = data?.allOk
    ? '모든 데이터가 어제까지 잘 들어왔어요.'
    : '어제까지의 숫자를 채워두면 오늘 대시보드가 정확해져요.';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm animate-in">
      <div
        className={cn(
          'relative w-full max-w-2xl overflow-hidden rounded-2xl',
          'border border-[var(--border-subtle)] bg-[var(--surface-raised)]',
          'shadow-[var(--shadow-md)] animate-scale',
        )}
      >
        <button
          onClick={close}
          className={cn(
            'absolute right-4 top-4 z-10 rounded-lg p-1.5 transition-colors',
            'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-secondary)]',
          )}
          aria-label="닫기"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Hero */}
        <div className="px-7 pt-8 pb-6 text-center">
          <div
            className={cn(
              'mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl',
              data?.allOk
                ? 'bg-emerald-50 text-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-400'
                : 'bg-[var(--primary-soft)] text-[var(--primary)]',
            )}
          >
            {data?.allOk ? <CheckCircle2 className="h-7 w-7" /> : <Sunrise className="h-7 w-7" />}
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            {headline}
          </h2>
          <p className="mt-1.5 text-sm text-[var(--text-tertiary)]">{subhead}</p>

          {/* Progress bar */}
          <div className="mx-auto mt-5 max-w-[280px]">
            <div className="text-center text-[11px] font-medium text-[var(--text-tertiary)]">
              {doneCount} / {totalCount} 준비됨
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  data?.allOk ? 'bg-emerald-500' : 'bg-[var(--primary)]',
                )}
                style={{ width: `${progressRatio * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[55vh] overflow-y-auto border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-5 py-4">
          {query.isLoading ? (
            <div className="flex items-center justify-center py-10 text-[var(--text-muted)]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              <div className="space-y-2.5">
                {actionChecks.map((check: ReadinessCheck) => (
                  <ActionCheckCard
                    key={check.key}
                    check={check}
                    onCollect={handleCollect}
                    pending={pendingKey === check.key}
                  />
                ))}
                <AdSyncRow onComplete={() => query.refetch()} />
              </div>

              {okChecks.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                    이미 준비된 항목
                  </p>
                  <div className="space-y-1.5">
                    {okChecks.map((check: ReadinessCheck) => (
                      <CompactOkRow key={check.key} check={check} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--surface)] px-6 py-4">
          <button
            onClick={close}
            className="text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
          >
            나중에
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={close}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all',
                data?.allOk
                  ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-[var(--shadow-sm)] hover:bg-[var(--primary-hover)]'
                  : 'cursor-not-allowed bg-[var(--surface-sunken)] text-[var(--text-muted)]',
              )}
              disabled={!data?.allOk}
            >
              대시보드 열기
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
