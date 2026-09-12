"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  ExternalLink,
  Loader2,
  PackageCheck,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { downloadBlob } from "@/lib/browser-download";
import { formatNumber } from "@/lib/utils";
import { createSecureRandomUuid } from "@/lib/secure-random-uuid";
import {
  collectAndPersistCoupangShipmentSummary,
  loadCoupangShipmentSummarySource,
  CoupangShipmentExtensionError,
} from "@/lib/coupang-shipment-summary-action";
import {
  COUPANG_SHIPMENT_PAGE_URL,
  displayKind,
  mergeCoupangShipmentFiles,
  type CoupangShipmentFileKind,
  type CoupangShipmentMergedFile,
} from "./lib/coupang-shipment-files";
import {
  clearCoupangCookiesViaExtension,
  collectCoupangShipmentDraftsViaExtension,
  isCoupangCookieBloatError,
  isCoupangShipmentSessionRequiredError,
  openCoupangShipmentPageViaExtension,
} from "./lib/coupang-shipment-extension";
import { ShipmentDateCalendar } from "./components/ShipmentDateCalendar";
import {
  ShipmentNotifications,
  type ShipmentNotification,
  type ShipmentNotificationStatus,
} from "./components/ShipmentNotifications";
import {
  downloadCoupangShipmentServerFile,
  loadCoupangShipmentServerFiles,
  type CoupangShipmentServerDay,
  type CoupangShipmentServerFile,
  type CoupangShipmentServerFileKind,
} from "./lib/coupang-shipment-api";
import {
  deleteCoupangShipmentFile,
  loadCoupangShipmentFiles,
  saveCoupangShipmentFiles,
} from "./lib/coupang-shipment-store";
import { useCoupangShipmentViewState } from "./hooks/useCoupangShipmentViewState";

type ResultKind = CoupangShipmentFileKind | CoupangShipmentServerFileKind;

type ResultFile =
  | {
      source: "server";
      id: string;
      kind: CoupangShipmentServerFileKind;
      shipmentDate: string;
      centers: string[];
      sourceCount: number;
      pageCount: number;
      fileName: string;
      createdAt: number;
      sizeBytes: number;
      serverFile: CoupangShipmentServerFile;
    }
  | {
      source: "browser";
      id: string;
      kind: CoupangShipmentFileKind;
      shipmentDate: string;
      centers: string[];
      sourceCount: number;
      pageCount: number;
      fileName: string;
      createdAt: number;
      blob: Blob;
    };

export default function CoupangShipmentsPage() {
  const [calendarView, setCalendarView] = useCoupangShipmentViewState();
  const selectedDate = calendarView.date;
  const [history, setHistory] = useState<CoupangShipmentMergedFile[]>([]);
  const [serverHistory, setServerHistory] = useState<
    CoupangShipmentServerDay[]
  >([]);
  const [serverHistoryLoading, setServerHistoryLoading] = useState(false);
  const [extensionBusy, setExtensionBusy] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const source = useQuery({
    queryKey: queryKeys.inventory.coupangShipmentSummary(),
    queryFn: loadCoupangShipmentSummarySource,
    refetchInterval: (query) => (
      query.state.data?.latestAttempt?.state === "RUNNING" ? 1_000 : false
    ),
  });
  const dateSummary = source.data?.items ?? [];
  const [notifications, setNotifications] = useState<ShipmentNotification[]>(
    [],
  );

  const notify = useCallback(
    (status: ShipmentNotificationStatus, message: string) => {
      setNotifications((prev) =>
        [
          { id: createSecureRandomUuid(), status, message, at: Date.now() },
          ...prev,
        ].slice(0, 30),
      );
    },
    [],
  );

  // 쿠팡 접속이 많아 쿠키가 커져 400 이 나면: 도메인 쿠키를 정리하고 재로그인하도록 안내한다.
  const remediateCoupangCookies = useCallback(async () => {
    const ok = window.confirm(
      "쿠팡 쿠키를 정리하면 supplier뿐 아니라 WING·로켓 등 모든 쿠팡(*.coupang.com) 로그인이 풀립니다. " +
        "진행 중인 다른 쿠팡 작업이 있으면 끊길 수 있어요. 정리 후 다시 로그인해야 합니다. 진행할까요?",
    );
    if (!ok) return;
    const toastId = toast.loading("쿠팡 쿠키 정리 중…");
    notify("started", "쿠팡 쿠키 정리를 시작합니다…");
    try {
      const cleared = await clearCoupangCookiesViaExtension();
      const message = `쿠팡 쿠키 ${formatNumber(cleared)}개를 정리했습니다. 쿠팡에 다시 로그인한 뒤 조회하세요.`;
      toast.success(message, { id: toastId });
      notify("succeeded", message);
      // 재로그인할 수 있도록 supplier 창을 연다(실패해도 무시).
      try {
        await openCoupangShipmentPageViaExtension();
      } catch {
        /* noop */
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "쿠팡 쿠키 정리 실패";
      toast.error(message, { id: toastId });
      notify("failed", message);
    }
  }, [notify]);

  // 확장 오류를 토스트로 알린다. 쿠키 과다(400)면 '쿠팡 쿠키 정리' 복구 버튼을 함께 띄운다.
  const showExtensionErrorToast = useCallback(
    (error: unknown, fallback: string, toastId?: string | number): string => {
      const message = error instanceof Error ? error.message : fallback;
      const base = toastId !== undefined ? { id: toastId } : {};
      if (isCoupangCookieBloatError(error)) {
        toast.error(message, {
          ...base,
          duration: 12000,
          action: {
            label: "쿠팡 쿠키 정리",
            onClick: () => void remediateCoupangCookies(),
          },
        });
      } else if (isCoupangShipmentSessionRequiredError(error)) {
        toast.error(message, {
          ...base,
          duration: 12000,
          action: {
            label: "Supplier Hub 열기",
            onClick: () => {
              void openCoupangShipmentPageViaExtension().catch(() => {
                window.open(
                  COUPANG_SHIPMENT_PAGE_URL,
                  "_blank",
                  "noopener,noreferrer",
                );
              });
            },
          },
        });
      } else {
        toast.error(message, base);
      }
      notify("failed", message);
      return message;
    },
    [notify, remediateCoupangCookies],
  );

  const refreshServerHistory = useCallback(async () => {
    setServerHistoryLoading(true);
    try {
      const response = await loadCoupangShipmentServerFiles();
      setServerHistory(response.days);
    } catch {
      setServerHistory([]);
    } finally {
      setServerHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    loadCoupangShipmentFiles()
      .then((files) => {
        if (active) setHistory(files);
      })
      .catch(() => {
        if (active) setHistory([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void refreshServerHistory();
  }, [refreshServerHistory]);

  // Only read owner history on mount; an existing URL selection wins.
  useEffect(() => {
    const latest = source.data?.items[0];
    if (latest)
      setCalendarView((current) =>
        current.date
          ? current
          : { month: latest.date.slice(0, 7), date: latest.date },
      );
  }, [source.data, setCalendarView]);

  const historyByDate = useMemo(
    () => groupHistoryByDate(history, serverHistory),
    [history, serverHistory],
  );

  const openCoupang = async () => {
    setExtensionBusy(true);
    try {
      await openCoupangShipmentPageViaExtension();
      toast.success("쿠팡 쉽먼트 화면을 열었습니다.");
    } catch (error) {
      window.open(COUPANG_SHIPMENT_PAGE_URL, "_blank", "noopener,noreferrer");
      toast.error(
        error instanceof Error
          ? error.message
          : "쿠팡 쉽먼트 화면을 열지 못했습니다.",
      );
    } finally {
      setExtensionBusy(false);
    }
  };

  const queryDateSummary = async () => {
    setSummaryLoading(true);
    notify("started", "발송일 조회를 시작합니다…");
    try {
      const result = await collectAndPersistCoupangShipmentSummary();
      if (result.status === "empty") {
        toast.info("새로 조회된 쉽먼트가 없습니다.");
        notify("info", "새로 조회된 쉽먼트가 없습니다.");
        return;
      }

      setCalendarView({
        month: result.latest.date.slice(0, 7),
        date: result.latest.date,
      });
      const message = `발송일 ${formatNumber(result.items.length)}일 · 최신 ${result.latest.date} (${formatNumber(result.latest.count)}건)`;
      toast.success(message);
      notify("succeeded", message);
    } catch (error) {
      if (
        error instanceof CoupangShipmentExtensionError &&
        error.code === "SOURCE_RUNNING"
      ) {
        toast.info(error.message);
        notify("info", error.message);
      } else showExtensionErrorToast(error, "발송일 조회·저장 실패");
    } finally {
      setSummaryLoading(false);
      void source.refetch();
    }
  };

  const collectAndMerge = async () => {
    if (!selectedDate) {
      toast.error("발송일을 선택해주세요.");
      return;
    }
    setExtensionBusy(true);
    const toastId = toast.loading(`${selectedDate} 쉽먼트 목록 조회 중…`);
    notify("started", `${selectedDate} 수집·병합을 시작합니다…`);
    try {
      const { shipments, failed, drafts } =
        await collectCoupangShipmentDraftsViaExtension(
          selectedDate,
          (progress) => {
            if (progress.phase === "list") {
              toast.loading(`${selectedDate} 쉽먼트 목록 조회 중…`, {
                id: toastId,
              });
            } else if (progress.phase === "download") {
              toast.loading(
                `PDF 다운로드 ${formatNumber(progress.loaded ?? 0)}/${formatNumber(progress.total ?? 0)}`,
                { id: toastId },
              );
            } else {
              toast.loading("병합 준비 중…", { id: toastId });
            }
          },
        );
      const results = await mergeCoupangShipmentFiles(drafts);
      const mergedFiles = results.flatMap((result) => result.files);

      // 재수집 시 같은 (발송일·종류) 기존 결과를 교체 — 중복 누적(병합 충돌) 방지.
      const keys = new Set(
        mergedFiles.map((file) => `${file.shipmentDate}:${file.kind}`),
      );
      const stale = history.filter((file) =>
        keys.has(`${file.shipmentDate}:${file.kind}`),
      );
      await Promise.all(
        stale.map((file) => deleteCoupangShipmentFile(file.id)),
      );
      await saveCoupangShipmentFiles(mergedFiles);
      setHistory((current) =>
        [
          ...mergedFiles,
          ...current.filter(
            (file) => !keys.has(`${file.shipmentDate}:${file.kind}`),
          ),
        ].sort((a, b) => b.createdAt - a.createdAt),
      );

      const failedNote =
        failed.length > 0 ? ` · 실패 ${formatNumber(failed.length)}건` : "";
      const message = `${selectedDate} 수집·병합 완료 — 쉽먼트 ${formatNumber(shipments.length)}건 → Label·내역서 ${formatNumber(mergedFiles.length)}개${failedNote}`;
      toast.success(message, { id: toastId });
      notify("succeeded", message);
    } catch (error) {
      showExtensionErrorToast(error, "수집·병합 실패", toastId);
    } finally {
      setExtensionBusy(false);
    }
  };

  const deleteHistory = async (id: string) => {
    await deleteCoupangShipmentFile(id);
    setHistory((current) => current.filter((item) => item.id !== id));
  };

  const downloadResultFile = async (file: ResultFile) => {
    try {
      if (file.source === "server") {
        const blob = await downloadCoupangShipmentServerFile(file.serverFile);
        downloadBlob(blob, file.fileName);
        return;
      }
      downloadBlob(file.blob, file.fileName);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "파일 다운로드 실패",
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50">
            <PackageCheck size={20} className="text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              쿠팡 쉽먼트
            </h1>
            <p className="text-sm text-slate-500">
              발송일을 골라 Label·내역서를 센터순으로 자동 병합
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openCoupang}
          disabled={extensionBusy}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <ExternalLink size={15} />
          쿠팡 열기
        </button>
      </div>

      {/* 좌: 발송일 달력(3/4) · 우: 일별 결과 알림 패널(1/4) — 쿠팡 로켓 페이지와 동일 구조 */}
      <div className="grid items-start gap-4 xl:grid-cols-4">
        <div className="min-w-0 xl:col-span-3">
          <div role="status" className="mb-2 text-sm text-slate-600">
            <p>
              {source.isError
                ? "쉽먼트 조회 상태를 불러오지 못했습니다."
                : source.data?.latestAttempt?.state === "RUNNING"
                  ? "쉽먼트 조회 진행 중 · 이전 달력 이력 표시"
                  : source.data?.latestAttempt?.state === "FAILED"
                    ? `최근 조회 실패: ${source.data.latestAttempt.errorMessage}`
                    : source.data?.ready
                      ? `최근 조회 결과 ${source.data.capturedItems.length}일 · 달력 이력 유지`
                      : "수집 미확인 · 저장된 이력은 최신 수집 증거가 아닙니다."}
            </p>
            {source.data?.latestComplete?.actualCutoffAt && (
              <p>
                마지막 완료:{" "}
                <time dateTime={source.data.latestComplete.actualCutoffAt}>
                  {source.data.latestComplete.actualCutoffAt}
                </time>
              </p>
            )}
            {dateSummary.some((item) => !item.verified) && (
              <p>
                기존 미인증 이력{" "}
                {dateSummary.filter((item) => !item.verified).length}일
              </p>
            )}
          </div>
          <ShipmentDateCalendar
            summary={dateSummary}
            viewMonth={calendarView.month}
            selectedDate={selectedDate}
            onViewMonthChange={(month) => {
              setCalendarView((current) => ({ ...current, month }));
            }}
            onSelect={(date) => {
              setCalendarView((current) => ({ ...current, date }));
            }}
            loading={summaryLoading || source.data?.latestAttempt?.state === "RUNNING"}
            loaded={source.isSuccess}
            onQuery={queryDateSummary}
            onCollect={collectAndMerge}
            collecting={extensionBusy}
          />
        </div>

        <ShipmentNotifications notifications={notifications} />
      </div>

      {/* 일별 결과 — 하단 전체 폭 */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="text-sm font-semibold text-slate-900">일별 결과</div>
          <button
            type="button"
            onClick={() => void refreshServerHistory()}
            disabled={serverHistoryLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {serverHistoryLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            새로고침
          </button>
        </div>

        {historyByDate.length === 0 && !serverHistoryLoading ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">
            아직 생성된 파일이 없습니다. 발송일을 조회해 수집·병합하세요.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {historyByDate.map((group) => (
              <div key={group.date} className="p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="font-semibold tabular-nums text-slate-900">
                    {group.date}
                  </div>
                  <div className="text-xs text-slate-400">
                    {formatNumber(group.files.length)}개
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {group.files.map((file) => (
                    <div
                      key={file.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <div className="truncate text-sm font-semibold text-slate-900">
                              {file.fileName}
                            </div>
                            {file.source === "server" ? (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                수집
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {displayResultKind(file.kind)} ·{" "}
                            {formatNumber(file.sourceCount)}개 ·{" "}
                            {formatNumber(file.pageCount)}p
                            {file.source === "server"
                              ? ` · ${formatFileSize(file.sizeBytes)}`
                              : ""}
                          </div>
                          <div className="mt-1 truncate text-xs text-slate-400">
                            {file.centers.join(" · ")}
                          </div>
                        </div>
                        <div className="flex flex-none items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void downloadResultFile(file)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                            aria-label={`${file.fileName} 다운로드`}
                          >
                            <Download size={14} />
                          </button>
                          {file.source === "browser" ? (
                            <button
                              type="button"
                              onClick={() => void deleteHistory(file.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
                              aria-label={`${file.fileName} 삭제`}
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function groupHistoryByDate(
  browserFiles: CoupangShipmentMergedFile[],
  serverDays: CoupangShipmentServerDay[],
): Array<{ date: string; files: ResultFile[] }> {
  const byDate = new Map<string, ResultFile[]>();
  for (const day of serverDays) {
    const list = byDate.get(day.date) ?? [];
    list.push(
      ...day.files.map((file): ResultFile => ({
        source: "server",
        id: `server-${file.id}`,
        kind: file.kind,
        shipmentDate: file.date,
        centers: file.centers,
        sourceCount: file.sourceCount,
        pageCount: file.pageCount,
        fileName: file.fileName,
        createdAt: new Date(file.createdAt).getTime(),
        sizeBytes: file.sizeBytes,
        serverFile: file,
      })),
    );
    byDate.set(day.date, list);
  }

  for (const file of browserFiles) {
    const list = byDate.get(file.shipmentDate) ?? [];
    list.push({
      source: "browser",
      id: file.id,
      kind: file.kind,
      shipmentDate: file.shipmentDate,
      centers: file.centers,
      sourceCount: file.sourceCount,
      pageCount: file.pageCount,
      fileName: file.fileName,
      createdAt: file.createdAt,
      blob: file.blob,
    });
    byDate.set(file.shipmentDate, list);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({
      date,
      files: [...items].sort(
        (a, b) =>
          resultKindRank(a.kind) - resultKindRank(b.kind) ||
          b.createdAt - a.createdAt,
      ),
    }));
}

function displayResultKind(kind: ResultKind): string {
  if (kind === "all") return "전체";
  return displayKind(kind);
}

function resultKindRank(kind: ResultKind): number {
  if (kind === "all") return 0;
  if (kind === "label") return 1;
  return 2;
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes}B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)}KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)}MB`;
}
