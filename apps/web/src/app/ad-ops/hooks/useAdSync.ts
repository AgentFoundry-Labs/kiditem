'use client';

// 광고동기화 실행 훅 — 운영중 캠페인 자동 순회 + 어제 단일일자 일별 적재.
// AdSyncButton(헤더 단독 버튼) 과 ReadinessModal 의 인라인 row 가 공유.

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

const EXTENSION_ID_KEY = 'kiditem-ext-id';
const SWEEP_URL = 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1';

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
): Promise<{
  success?: boolean;
  error?: string;
  status?: string;
  cancelled?: boolean;
  total?: number;
  current?: number;
  completed?: number;
  failed?: number;
  currentLabel?: string;
  runId?: string;
  startedAt?: number;
  endedAt?: number;
}> {
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
        resolve(response as { success?: boolean; error?: string });
      });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

interface BatchScrapeStatus {
  status?: 'starting' | 'running' | 'done' | 'error' | 'idle' | 'cancelled';
  total?: number;
  current?: number;
  completed?: number;
  failed?: number;
  currentLabel?: string;
  runId?: string;
  startedAt?: number;
  endedAt?: number;
  cancelled?: boolean;
}

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

interface UseAdSyncOptions {
  onComplete?: () => void;
}

export function useAdSync({ onComplete }: UseAdSyncOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<BatchScrapeStatus | null>(null);
  const cancelRef = useRef<(() => Promise<void>) | null>(null);
  const queryClient = useQueryClient();

  const cancel = useCallback(async () => {
    if (!cancelRef.current) return;
    await cancelRef.current();
  }, []);

  const run = async () => {
    const runId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const runStartedAt = Date.now();
    let sawCurrentRun = false;
    setLoading(true);
    setStatus({ status: 'starting', runId, total: 1, current: 0, completed: 0, failed: 0 });
    try {
      const eid = await detectExtensionId();
      if (!eid) {
        window.open(SWEEP_URL, '_blank', 'noopener,noreferrer');
        toast.warning('익스텐션 미연결 — 새 탭으로 광고센터를 엽니다', {
          description:
            'chrome://extensions 에서 KIDITEM 익스텐션 등록 후 다시 시도하면 자동 실행됩니다.',
          duration: 8000,
        });
        return;
      }

      cancelRef.current = async () => {
        await sendToExtension(eid, { action: 'cancelBatchScrape', runId });
        setStatus((prev) => ({ ...(prev ?? {}), runId, status: 'cancelled', cancelled: true }));
        toast.info('광고 동기화 중단 요청을 보냈습니다');
      };

      const startResp = await sendToExtension(eid, {
        action: 'scrapeTargets',
        runId,
        urls: [{ id: 'ad-sync', url: SWEEP_URL, label: '광고동기화 (운영중 캠페인 자동 수집)' }],
      });
      if (startResp?.success === false) {
        throw new Error(startResp.error ?? '익스텐션 동기화 시작 실패');
      }

      toast.info('운영중 캠페인 자동 수집 시작 — 새 탭에서 처리됩니다', {
        duration: 6000,
        action: {
          label: '중단',
          onClick: () => {
            void cancelRef.current?.();
          },
        },
      });

      await new Promise<void>((resolve) => {
        const start = Date.now();
        const maxMs = 5 * 60_000;
        const startGraceMs = 15_000;
        const tick = async () => {
          try {
            const nextStatus = await sendToExtension(eid, { action: 'getBatchScrapeStatus', runId });
            setStatus(nextStatus as BatchScrapeStatus);
            const statusStartedAt = nextStatus?.startedAt ?? 0;
            const isCurrentRun =
              nextStatus?.runId === runId ||
              (!nextStatus?.runId && statusStartedAt >= runStartedAt - 1000);

            if (isCurrentRun) sawCurrentRun = true;

            // 확장이 storage 에 running 상태를 쓰기 전이면 idle/지난 done 이 올 수 있다.
            // 현재 run 을 한 번도 못 봤다면 시작 유예 시간 동안 계속 기다린다.
            if (!isCurrentRun && !sawCurrentRun && Date.now() - start < startGraceMs) {
              setTimeout(tick, 1000);
              return;
            }

            if (!isCurrentRun && !sawCurrentRun) {
              toast.warning('광고 동기화 시작 상태를 확인하지 못했습니다', {
                description: '광고센터 탭이 열렸는지 확인해주세요.',
              });
              resolve();
              return;
            }

            if (
              isCurrentRun &&
              (nextStatus?.status === 'done' ||
                nextStatus?.status === 'error' ||
                nextStatus?.status === 'cancelled' ||
                nextStatus?.status === 'idle')
            ) {
              const ok = nextStatus?.completed ?? 0;
              const fail = nextStatus?.failed ?? 0;
              if (nextStatus?.status === 'cancelled') {
                toast.info(`광고 동기화 중단 — 성공 ${ok} / 실패 ${fail}`);
              } else if (nextStatus?.status === 'error') {
                toast.error('광고 동기화 실패');
              } else if (fail > 0) {
                toast.warning(`광고 동기화 종료 — 성공 ${ok} / 실패 ${fail}`);
              } else {
                toast.success('광고 동기화 완료');
              }
              resolve();
              return;
            }
            if (Date.now() - start > maxMs) {
              toast.warning('광고 동기화 타임아웃 — 백그라운드에서 계속 진행 중일 수 있습니다');
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

      queryClient.invalidateQueries({ queryKey: queryKeys.ads.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: ['traffic'] });
      queryClient.invalidateQueries({ queryKey: ['readiness'] });
      onComplete?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '광고 동기화 실패');
    } finally {
      cancelRef.current = null;
      setLoading(false);
    }
  };

  return { loading, run, cancel, status };
}
