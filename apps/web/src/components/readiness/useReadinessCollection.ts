import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ReadinessCheck } from '@kiditem/shared/readiness';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import {
  cancelOperationAlert,
  failOperationAlert,
  progressOperationAlert,
  startOperationAlert,
  succeedOperationAlert,
} from '@/lib/operation-alerts';
import {
  classifyBatchScrapeStatus,
  summarizeBatchScrapeProgress,
} from '@/lib/operation-alert-lifecycle';
import { queryKeys } from '@/lib/query-keys';
import { collectRocketSalesRange } from '@/lib/rocket-sales-collection';

type ExtensionMessageResponse = {
  success?: boolean;
  results?: unknown[];
  error?: string;
  status?: 'idle' | 'running' | 'done' | 'error' | 'cancelled' | 'starting';
  runId?: string;
  completed?: number;
  failed?: number;
  total?: number;
  current?: number;
  currentLabel?: string;
};

interface UseReadinessCollectionOptions {
  refetchReadiness: () => Promise<unknown>;
}

function fallbackOpenTabs(urls: string[]) {
  for (const url of urls) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function collectHref(check: ReadinessCheck): string {
  if (check.key === 'wing_sales') return '/sales-analysis?tab=wing-daily';
  if (check.key === 'rocket_sales') return '/sales-analysis?tab=rocket-daily';
  if (check.key === 'coupang_ads') return '/ad-ops';
  return '/dashboard';
}

function todayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const date = new Date(`${ymd}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const to = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
  return { from, to };
}

function rocketCollectRange(check: ReadinessCheck): { from: string; to: string } {
  const dates = [...(check.expectedDates ?? [])].sort();
  if (dates.length > 0) return { from: dates[0], to: dates[dates.length - 1] };
  if (check.key === 'rocket_sales') return currentMonthRange();
  const from = check.referenceDate ?? todayYmd();
  return { from, to: addDaysYmd(from, 30) };
}

export function useReadinessCollection({ refetchReadiness }: UseReadinessCollectionOptions) {
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

  const handleServerCollect = async (check: ReadinessCheck, operationKey: string) => {
    if (!check.collectEndpoint) return;
    setPendingKey(check.key);
    const alert = await startOperationAlert({
      operationKey,
      type: 'dashboard_data_collect',
      title: `${check.label} 수집`,
      sourceType: 'readiness_check',
      sourceId: check.key,
      href: collectHref(check),
      metadata: { checkKey: check.key, collector: 'server' },
    });
    try {
      await apiClient.post(check.collectEndpoint, {});
      toast.success('수집 완료');
      if (alert) {
        void succeedOperationAlert(operationKey, {
          message: `${check.label} 수집 완료`,
          metadata: { checkKey: check.key, collector: 'server' },
        });
      }
      await invalidateCollectedData();
      await refetchReadiness();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '수집 실패';
      toast.error(msg);
      if (alert) {
        void failOperationAlert(operationKey, {
          message: msg,
          metadata: { checkKey: check.key, collector: 'server', error: msg },
        });
      }
    } finally {
      setPendingKey(null);
    }
  };

  const handleRocketSalesCollect = async (check: ReadinessCheck, operationKey: string) => {
    const { from, to } = rocketCollectRange(check);
    setPendingKey(check.key);
    const alert = await startOperationAlert({
      operationKey,
      type: 'dashboard_data_collect',
      title: `${check.label} 수집`,
      sourceType: 'readiness_check',
      sourceId: check.key,
      href: collectHref(check),
      metadata: { checkKey: check.key, collector: 'order-extension', from, to, status: 'PA' },
    });

    try {
      toast.info(`쿠팡 로켓 매출 동기화 시작 (${from} ~ ${to})`, { duration: 4000 });
      const result = await collectRocketSalesRange({ from, to, status: 'PA' });
      const rows = result.preview?.totalRows ?? result.rows.length;
      const message =
        rows > 0
          ? `쿠팡 로켓 발주 ${result.poCount}건 · ${rows}행 동기화`
          : '해당 기간 발주확정 데이터가 없습니다';
      if (rows > 0) toast.success(message);
      else toast.info(message);
      if (alert) {
        void succeedOperationAlert(operationKey, {
          severity: rows > 0 ? undefined : 'info',
          message,
          metadata: {
            checkKey: check.key,
            collector: 'order-extension',
            from,
            to,
            status: 'PA',
            poCount: result.poCount,
            rows,
          },
        });
      }
      await invalidateCollectedData();
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'rocket-sales'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'rocket-orders'] });
      await refetchReadiness();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '쿠팡 로켓 매출 수집 실패';
      toast.error(msg);
      if (alert) {
        void failOperationAlert(operationKey, {
          message: msg,
          metadata: { checkKey: check.key, collector: 'order-extension', from, to, status: 'PA', error: msg },
        });
      }
    } finally {
      setPendingKey(null);
    }
  };

  const handleCollect = async (check: ReadinessCheck) => {
    const operationKey = `dashboard.collect:${check.key}`;

    if (check.key === 'rocket_sales') {
      await handleRocketSalesCollect(check, operationKey);
      return;
    }

    if (check.collector === 'server') {
      await handleServerCollect(check, operationKey);
      return;
    }

    if (!check.scrapeUrls || check.scrapeUrls.length === 0) {
      toast.error('수집 URL 없음');
      return;
    }

    let alertStarted = false;
    let collectOutcome: 'succeeded' | 'warning' | 'failed' | 'cancelled' | null = null;

    setPendingKey(check.key);
    try {
      const eid = await detectExtensionId();
      if (!eid) {
        fallbackOpenTabs(check.scrapeUrls);
        toast.warning(
          `익스텐션 미연결 - ${check.scrapeUrls.length}개 탭 일괄 오픈`,
          {
            description:
              'chrome://extensions 에서 KIDITEM 익스텐션 등록하면 한 탭씩 자동 순차 수집됩니다.',
            duration: 8000,
          },
        );
        setTimeout(() => {
          void refetchReadiness();
        }, 12000);
        return;
      }

      const alert = await startOperationAlert({
        operationKey,
        type: 'dashboard_data_collect',
        title: `${check.label} 수집`,
        sourceType: 'readiness_check',
        sourceId: check.key,
        href: collectHref(check),
        metadata: {
          checkKey: check.key,
          totalUrls: check.scrapeUrls.length,
          missingDates: check.missingDates?.length ?? 0,
        },
      });
      alertStarted = !!alert;

      const startResp = await sendToExtension<ExtensionMessageResponse>(eid, {
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
      const runId = typeof startResp.runId === 'string' ? startResp.runId : undefined;
      const cancelCollect = async () => {
        if (!runId) return;
        await sendToExtension<ExtensionMessageResponse>(eid, { action: 'cancelBatchScrape', runId });
        toast.info('데이터 수집 중단 요청을 보냈습니다');
      };

      const totalUrls = check.scrapeUrls.length;
      toast.info(`${totalUrls}일치 순차 수집 시작 - 한 탭씩 자동으로 처리됩니다`, {
        duration: 6000,
        action: runId
          ? {
              label: '중단',
              onClick: () => {
                void cancelCollect();
              },
            }
          : undefined,
      });

      await new Promise<void>((resolve) => {
        const start = Date.now();
        const maxMs = totalUrls * 240_000;
        let lastCurrent = -1;
        const tick = async () => {
          try {
            const status = await sendToExtension<ExtensionMessageResponse>(eid, {
              action: 'getBatchScrapeStatus',
              runId,
            });
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
              status?.status === 'cancelled' ||
              status?.status === 'idle'
            ) {
              const summary = summarizeBatchScrapeProgress(status, totalUrls);
              const { ok, fail, total: totalSeen } = summary;
              const terminal = classifyBatchScrapeStatus(status);
              if (terminal === 'cancelled') {
                collectOutcome = 'cancelled';
                toast.info(`수집 중단: 성공 ${ok} / 실패 ${fail} / 전체 ${totalSeen}`);
                if (alertStarted) {
                  void cancelOperationAlert(operationKey, {
                    message: `수집 중단됨 (성공 ${ok} / 실패 ${fail} / 전체 ${totalSeen})`,
                    metadata: { ok, fail, total: totalSeen, phase: 'collect' },
                  });
                }
              } else if (terminal === 'failed') {
                collectOutcome = 'failed';
                toast.warning(
                  `수집 종료: 성공 ${ok} / 실패 ${fail} / 전체 ${totalSeen}`,
                );
                if (alertStarted) {
                  void failOperationAlert(operationKey, {
                    message: `수집 실패 (성공 ${ok} / 실패 ${fail} / 전체 ${totalSeen})`,
                    metadata: { ok, fail, total: totalSeen, phase: 'collect' },
                  });
                }
              } else if (terminal === 'succeeded' || terminal === 'warning') {
                collectOutcome = terminal;
                if (check.key === 'coupang_ads') {
                  if (alertStarted) {
                    void progressOperationAlert(operationKey, {
                      progress: 0.5,
                      message: `일별 수집 완료 (성공 ${ok} / 실패 ${fail} / 전체 ${totalSeen})`,
                      metadata: { ok, fail, total: totalSeen, phase: 'collect' },
                    });
                  }
                  resolve();
                  return;
                }
                if (terminal === 'succeeded') {
                  toast.success(`${ok}/${totalSeen}일 수집 완료`);
                  if (alertStarted) {
                    void succeedOperationAlert(operationKey, {
                      message: `${ok}/${totalSeen}일 수집 완료`,
                      metadata: { ok, fail, total: totalSeen, phase: 'collect' },
                    });
                  }
                } else {
                  toast.warning(
                    `수집 종료: 성공 ${ok} / 실패 ${fail} / 전체 ${totalSeen}`,
                  );
                  if (alertStarted) {
                    void succeedOperationAlert(operationKey, {
                      severity: 'warning',
                      message: `일부 수집 실패 (성공 ${ok} / 실패 ${fail} / 전체 ${totalSeen})`,
                      metadata: { ok, fail, total: totalSeen, phase: 'collect' },
                    });
                  }
                }
              }
              resolve();
              return;
            }
            const summary = summarizeBatchScrapeProgress(status, totalUrls);
            if (alertStarted) {
              void progressOperationAlert(operationKey, {
                progress:
                  check.key === 'coupang_ads' && summary.progress != null
                    ? summary.progress * 0.5
                    : summary.progress,
                message: `수집 중 (${summary.ok + summary.fail}/${summary.total})`,
                metadata: {
                  ok: summary.ok,
                  fail: summary.fail,
                  total: summary.total,
                  phase: 'collect',
                },
              });
            }
            if (Date.now() - start > maxMs) {
              collectOutcome = 'failed';
              toast.warning(
                `수집 타임아웃 - ${status?.completed ?? 0}/${totalUrls} 완료`,
              );
              if (alertStarted) {
                void failOperationAlert(operationKey, {
                  message: `수집 타임아웃 (${status?.completed ?? 0}/${totalUrls} 완료)`,
                  metadata: { phase: 'collect', timeout: true },
                });
              }
              resolve();
              return;
            }
            setTimeout(tick, 3000);
          } catch (err) {
            collectOutcome = 'failed';
            const message = err instanceof Error ? err.message : '수집 상태 확인 실패';
            if (alertStarted) {
              void failOperationAlert(operationKey, {
                message,
                metadata: { phase: 'collect', error: message },
              });
            }
            resolve();
          }
        };
        tick();
      });

      if (
        check.key === 'coupang_ads' &&
        (collectOutcome === 'succeeded' || collectOutcome === 'warning')
      ) {
        try {
          const sweepUrl =
            'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1';
          toast.info('캠페인별 상품 수집 시작 - 새 탭에서 처리됩니다', {
            duration: 4000,
          });
          const sweepResp = await sendToExtension<ExtensionMessageResponse>(eid, {
            action: 'scrapeTargets',
            urls: [
              {
                id: 'ad-sync-sweep',
                url: sweepUrl,
                label: '광고 동기화 (캠페인별 상품)',
              },
            ],
          });
          if (sweepResp?.success === false) {
            throw new Error(sweepResp.error ?? '광고 동기화 시작 실패');
          }

          const sweepRunId =
            typeof sweepResp.runId === 'string' ? sweepResp.runId : undefined;
          const cancelSweep = async () => {
            if (!sweepRunId) return;
            await sendToExtension<ExtensionMessageResponse>(eid, {
              action: 'cancelBatchScrape',
              runId: sweepRunId,
            });
            toast.info('광고 동기화 중단 요청을 보냈습니다');
          };
          if (sweepRunId) {
            toast.info('캠페인별 상품 수집 중...', {
              duration: 6000,
              action: {
                label: '중단',
                onClick: () => {
                  void cancelSweep();
                },
              },
            });
          }
          await new Promise<void>((resolve) => {
            const sStart = Date.now();
            const sMaxMs = 8 * 60_000;
            const sTick = async () => {
              try {
                const st = await sendToExtension<ExtensionMessageResponse>(eid, {
                  action: 'getBatchScrapeStatus',
                  runId: sweepRunId,
                });
                if (
                  st?.status === 'done' ||
                  st?.status === 'error' ||
                  st?.status === 'cancelled' ||
                  st?.status === 'idle'
                ) {
                  const summary = summarizeBatchScrapeProgress(st, st?.total ?? 1);
                  const sOk = summary.ok;
                  const sFail = summary.fail;
                  const terminal = classifyBatchScrapeStatus(st);
                  if (terminal === 'cancelled') {
                    toast.info('광고 동기화 중단됨');
                    if (alertStarted) {
                      void cancelOperationAlert(operationKey, {
                        message: '광고 동기화 중단됨 (캠페인 sweep 단계)',
                        metadata: { ok: sOk, fail: sFail, phase: 'ad_sweep' },
                      });
                    }
                  } else if (terminal === 'failed') {
                    toast.error('광고 동기화 실패');
                    if (alertStarted) {
                      void failOperationAlert(operationKey, {
                        message: '광고 동기화 실패 (캠페인 sweep 단계)',
                        metadata: { ok: sOk, fail: sFail, phase: 'ad_sweep' },
                      });
                    }
                  } else if (terminal === 'warning' || collectOutcome === 'warning') {
                    toast.warning('광고 동기화 일부 실패');
                    if (alertStarted) {
                      void succeedOperationAlert(operationKey, {
                        severity: 'warning',
                        message: `광고 동기화 일부 실패 (성공 ${sOk} / 실패 ${sFail})`,
                        metadata: { ok: sOk, fail: sFail, phase: 'ad_sweep' },
                      });
                    }
                  } else if (terminal === 'succeeded') {
                    toast.success('광고 동기화 완료');
                    if (alertStarted) {
                      void succeedOperationAlert(operationKey, {
                        message: `광고 동기화 완료 (캠페인 ${sOk}건)`,
                        metadata: { ok: sOk, fail: sFail, phase: 'ad_sweep' },
                      });
                    }
                  }
                  resolve();
                  return;
                }
                const summary = summarizeBatchScrapeProgress(st, st?.total ?? 1);
                if (alertStarted) {
                  void progressOperationAlert(operationKey, {
                    progress:
                      summary.progress == null
                        ? 0.5
                        : 0.5 + summary.progress * 0.5,
                    message: `캠페인별 상품 수집 중 (${summary.ok + summary.fail}/${summary.total})`,
                    metadata: {
                      ok: summary.ok,
                      fail: summary.fail,
                      total: summary.total,
                      phase: 'ad_sweep',
                    },
                  });
                }
                if (Date.now() - sStart > sMaxMs) {
                  toast.warning(
                    '광고 동기화 타임아웃 - 백그라운드에서 진행 중일 수 있습니다',
                  );
                  if (alertStarted) {
                    void failOperationAlert(operationKey, {
                      message: '광고 동기화 타임아웃 (캠페인 sweep 단계)',
                      metadata: { phase: 'ad_sweep', timeout: true },
                    });
                  }
                  resolve();
                  return;
                }
                setTimeout(sTick, 3000);
              } catch (err) {
                const message =
                  err instanceof Error ? err.message : '광고 동기화 상태 확인 실패';
                if (alertStarted) {
                  void failOperationAlert(operationKey, {
                    message,
                    metadata: { phase: 'ad_sweep', error: message },
                  });
                }
                resolve();
              }
            };
            sTick();
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : '광고 동기화 실패';
          if (alertStarted) {
            void failOperationAlert(operationKey, {
              message,
              metadata: { phase: 'ad_sweep', error: message },
            });
          }
        }
      }

      await invalidateCollectedData();
      await refetchReadiness();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (alertStarted) {
        void failOperationAlert(operationKey, {
          message: `익스텐션 통신 실패: ${errorMessage}`,
          metadata: { phase: 'collect', error: errorMessage },
        });
      }
      try {
        fallbackOpenTabs(check.scrapeUrls);
        toast.warning('익스텐션 통신 실패 - 폴백으로 탭 일괄 오픈', {
          description: errorMessage,
          duration: 7000,
        });
        setTimeout(() => {
          void refetchReadiness();
        }, 12000);
      } catch {
        toast.error(errorMessage);
      }
    } finally {
      setPendingKey(null);
    }
  };

  return { pendingKey, handleCollect };
}
