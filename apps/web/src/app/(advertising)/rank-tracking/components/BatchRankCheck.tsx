"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserCollectionAttemptIdSchema } from "@kiditem/shared/browser-collection-session";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Radar } from "lucide-react";
import { toast } from "sonner";
import { transferExtensionAuthTo } from "@/lib/extension-auth";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { beginWingRankBatch, fetchWingRankBatch } from "../lib/rank-api";
import {
  cancelWingRankBatch,
  listWingRankSessions,
  openWingRankAttention,
  runWingSalesRankCheck,
} from "../lib/rank-extension";

function readBatchKey(): string | null {
  if (typeof window === "undefined") return null;
  const parsed = BrowserCollectionAttemptIdSchema.safeParse(
    new URLSearchParams(window.location.search).get("rankBatch"),
  );
  return parsed.success ? parsed.data : null;
}

/** The URL retains only the receipt key. Results always come from the owner. */
export default function BatchRankCheck({
  extensionId,
  disabledReason,
  onCompleted,
}: {
  extensionId: string | null;
  disabledReason: string | null;
  onCompleted: () => void;
}) {
  const client = useQueryClient();
  const [batchKey, setBatchKey] = useState(readBatchKey);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const observed = useRef("");
  const queryKey = [...queryKeys.ads.keywordRank(), "batch", batchKey];
  const owner = useQuery({
    queryKey,
    queryFn: () => fetchWingRankBatch(batchKey!),
    enabled: !!batchKey && !starting,
    refetchInterval: (query) =>
      query.state.data?.attempts.some((attempt) => attempt.state === "RUNNING")
        ? 2000
        : false,
  });
  const attempts = owner.data?.attempts ?? [];
  const complete = attempts.filter(
    (attempt) => attempt.state === "COMPLETE",
  ).length;
  const failures = attempts.filter((attempt) => attempt.state === "FAILED");
  const running =
    starting || attempts.some((attempt) => attempt.state === "RUNNING");
  const signature = attempts
    .filter((attempt) => attempt.state !== "RUNNING")
    .map((attempt) => `${attempt.attemptId}:${attempt.state}`)
    .join(",");
  const sessions = useQuery({
    queryKey: [...queryKey, "extension-progress", extensionId],
    queryFn: () => listWingRankSessions(extensionId!),
    enabled: !!extensionId && attempts.length > 0,
    refetchInterval: running ? 2000 : false,
  });
  const attention =
    sessions.data?.filter(
      (session) =>
        session.attention?.canOpenTab &&
        attempts.some((attempt) => attempt.attemptId === session.attemptId),
    ) ?? [];

  useEffect(() => {
    if (signature && signature !== observed.current) {
      observed.current = signature;
      onCompleted();
    }
  }, [signature, onCompleted]);

  const start = async () => {
    if (!extensionId || starting) return;
    setStarting(true);
    setDispatchError(null);
    try {
      await transferExtensionAuthTo(extensionId);
      const key = crypto.randomUUID();
      const url = new URL(window.location.href);
      url.searchParams.set("rankBatch", key);
      window.history.replaceState(null, "", url);
      setBatchKey(key);
      const batch = await beginWingRankBatch(key);
      client.setQueryData(
        [...queryKeys.ads.keywordRank(), "batch", key],
        batch,
      );
      if (!batch.attempts.length) {
        url.searchParams.delete("rankBatch");
        window.history.replaceState(null, "", url);
        setBatchKey(null);
        toast.info("순위를 확인할 자사 상품이 없습니다.");
        return;
      }
      await runWingSalesRankCheck(extensionId, key);
    } catch (error) {
      setDispatchError(
        error instanceof Error
          ? error.message
          : "수집 요청을 전달하지 못했습니다.",
      );
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    if (!extensionId || !batchKey || cancelling) return;
    setCancelling(true);
    try {
      await cancelWingRankBatch(extensionId, batchKey);
      await owner.refetch();
    } catch (error) {
      setDispatchError(
        error instanceof Error
          ? error.message
          : "중단 결과를 확인하지 못했습니다.",
      );
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {attempts.length > 0 && (
        <div
          className="text-xs text-[var(--text-secondary)]"
          aria-live="polite"
        >
          <span>
            처리 {complete + failures.length} / 전체 {attempts.length}
          </span>
          {running && (
            <span className="ml-2">
              {attempts.find((attempt) => attempt.state === "RUNNING")?.keyword}
            </span>
          )}
          {failures.length > 0 && (
            <p>실패 {failures.length}건 · 이전 정상 데이터는 유지됩니다.</p>
          )}
          {failures.map((attempt) => (
            <p key={attempt.attemptId}>
              {attempt.keyword}: {attempt.errorMessage}
            </p>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => void start()}
        disabled={running || (!!batchKey && owner.isPending) || !extensionId}
        title={!extensionId ? (disabledReason ?? undefined) : undefined}
        className={cn(
          "flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-700",
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
      {running && extensionId && batchKey && (
        <button
          type="button"
          onClick={() => void cancel()}
          disabled={cancelling}
          className="text-sm underline"
        >
          수집 중단
        </button>
      )}
      {attention.map((session) => (
        <button
          key={session.attemptId}
          type="button"
          className="text-sm underline"
          onClick={() =>
            void openWingRankAttention(extensionId!, session.attemptId).catch(
              (error: unknown) => {
                setDispatchError(
                  error instanceof Error
                    ? error.message
                    : "확인 탭을 열지 못했습니다.",
                );
              },
            )
          }
        >
          {
            attempts.find((attempt) => attempt.attemptId === session.attemptId)
              ?.keyword
          }{" "}
          확인 탭 열기
        </button>
      ))}
      {(dispatchError || owner.isError) && (
        <p role="alert" className="text-sm text-amber-700">
          {dispatchError || "서버의 수집 결과를 확인하지 못했습니다."}
          <button
            type="button"
            onClick={() => void owner.refetch()}
            className="ml-2 underline"
          >
            결과 다시 확인
          </button>
        </p>
      )}
    </div>
  );
}
