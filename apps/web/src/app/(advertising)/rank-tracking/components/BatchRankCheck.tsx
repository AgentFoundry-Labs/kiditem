"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Radar } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getWingSalesRankCheckStatus,
  runWingSalesRankCheck,
  type RankCheckStatus,
} from "../lib/rank-extension";

function isRunning(status: string | undefined): boolean {
  return status === "starting" || status === "running";
}

/**
 * '지금 순위 체크' — 확장에 일괄 확인을 시작시키고 2초 간격으로 진행률
 * (완료/전체 + 현재 키워드)을 폴링한다. 완료 시 onCompleted 로 데이터 refetch.
 */
export default function BatchRankCheck({
  extensionId,
  disabledReason,
  onCompleted,
}: {
  extensionId: string | null;
  disabledReason: string | null;
  onCompleted: () => void;
}) {
  const [runId, setRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const settledRunIdRef = useRef<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["rank-tracking", "check-status", extensionId, runId],
    queryFn: () => getWingSalesRankCheckStatus(extensionId!, runId),
    enabled: !!extensionId && !!runId,
    refetchInterval: (query) => {
      const data = query.state.data as RankCheckStatus | undefined;
      if (data && !isRunning(data.status)) return false;
      // 확장이 응답하지 않으면(리로드 등) 폴링을 무한정 계속하지 않는다.
      if (!data && query.state.fetchFailureCount >= 15) return false;
      return 2000;
    },
    gcTime: 0,
  });

  const status = statusQuery.data;
  const pollFailed = !status && !!runId && statusQuery.failureCount >= 15;
  const running =
    starting ||
    (!!runId && !pollFailed && (!status || isRunning(status.status)));

  useEffect(() => {
    if (!pollFailed) return;
    toast.error(
      "Wing 판매순위 진행 상태를 확인하지 못했습니다 — 확장프로그램 응답 없음",
    );
    setRunId(null);
  }, [pollFailed]);

  useEffect(() => {
    if (!runId || !status) return;
    if (isRunning(status.status)) return;
    if (settledRunIdRef.current === runId) return;
    settledRunIdRef.current = runId;

    if (status.status === "done") {
      const completed = status.completed ?? 0;
      const total = status.total ?? 0;
      const failed = status.failed ?? 0;
      if (failed > 0) {
        toast.warning(
          `Wing 판매순위 완료 — 성공 ${completed}/${total}, 실패 ${failed}건`,
        );
      } else {
        toast.success(
          `Wing 판매순위 완료 — ${completed}/${total}개 검색 키워드 수집`,
        );
      }
      onCompleted();
    } else if (status.status === "error") {
      toast.error(status.error ?? "키워드 순위 일괄 확인 실패");
    }
  }, [runId, status, onCompleted]);

  const start = async () => {
    if (!extensionId) {
      if (disabledReason) toast.error(disabledReason);
      return;
    }
    setStarting(true);
    try {
      const result = await runWingSalesRankCheck(extensionId);
      if (!result.started) {
        toast.info("순위를 확인할 자사 상품이 없습니다.");
        return;
      }
      settledRunIdRef.current = null;
      setRunId(result.runId ?? null);
      const pendingProducts =
        result.pendingProductTotal ?? result.productTotal ?? 0;
      toast.info(
        result.resumed
          ? `중단 지점부터 이어서 수집합니다 — 남은 상품 ${pendingProducts}개`
          : `자사 상품 ${result.productTotal ?? 0}개의 Wing 판매순위 수집을 시작했습니다.`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Wing 판매순위 일괄 확인 시작 실패",
      );
    } finally {
      setStarting(false);
    }
  };

  const total = status?.total ?? 0;
  const completed = (status?.completed ?? 0) + (status?.failed ?? 0);
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="flex items-center gap-3">
      {running && status && isRunning(status.status) && (
        <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 sm:flex">
          <span className="tabular-nums font-semibold text-purple-700">
            {completed}/{total}
          </span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-purple-600 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {status.current && (
            <span className="max-w-[140px] truncate text-slate-400">
              {status.current}
            </span>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={start}
        disabled={running || !extensionId}
        title={!extensionId ? (disabledReason ?? undefined) : undefined}
        className={cn(
          "flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-700",
          "disabled:cursor-not-allowed disabled:opacity-40",
        )}
      >
        {running ? (
          <>
            <Loader2 size={15} className="animate-spin" /> Wing 수집 중…
          </>
        ) : (
          <>
            <Radar size={15} /> 전체 상품 순위 수집
          </>
        )}
      </button>
    </div>
  );
}
