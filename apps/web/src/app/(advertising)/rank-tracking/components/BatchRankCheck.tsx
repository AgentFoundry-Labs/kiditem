"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CollectionStartControl } from "@/components/collection/CollectionStartControl";
import { useCollectionSourceControl } from "@/hooks/use-collection-source-control";
import { stoppedAttempt } from "@/lib/collection-source-status-query";
import { queryKeys } from "@/lib/query-keys";
import { listWingRankSessions, openWingRankAttention } from "../lib/rank-extension";
import { wingRankBatchCollection } from "../lib/wing-rank-batch-collection";

/**
 * The organization's current Wing rank batch: the shared collection control,
 * with per-keyword progress and failures read from the owner.
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
  const control = useCollectionSourceControl(wingRankBatchCollection);
  const [attentionError, setAttentionError] = useState<string | null>(null);
  const observed = useRef("");
  const attempts = control.status?.attempts ?? [];
  const complete = attempts.filter((attempt) => attempt.state === "COMPLETE").length;
  // A keyword a stop cancelled did not fail; the batch shows it as stopped.
  const stopped = attempts.filter(stoppedAttempt);
  const failures = attempts.filter(
    (attempt) => attempt.state === "FAILED" && !stoppedAttempt(attempt),
  );
  const runningAttempt = attempts.find((attempt) => attempt.state === "RUNNING");
  const signature = attempts
    .filter((attempt) => attempt.state !== "RUNNING")
    .map((attempt) => `${attempt.attemptId}:${attempt.state}`)
    .join(",");
  const sessions = useQuery({
    queryKey: [...queryKeys.ads.wingRankCurrentBatch(), "extension-progress", extensionId],
    queryFn: () => listWingRankSessions(extensionId!),
    enabled: !!extensionId && attempts.length > 0,
    refetchInterval: runningAttempt ? 2000 : false,
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

  return (
    <div className="flex flex-wrap items-center gap-3">
      {attempts.length > 0 && (
        <div className="text-xs text-[var(--text-secondary)]" aria-live="polite">
          <span>
            처리 {complete + failures.length + stopped.length} / 전체 {attempts.length}
          </span>
          {runningAttempt && <span className="ml-2">{runningAttempt.keyword}</span>}
          {stopped.length > 0 && <span className="ml-2">중단 {stopped.length}건</span>}
          {failures.length > 0 && (
            <details open className="mt-1 min-w-0 max-w-full">
              <summary className="cursor-pointer">
                실패 {failures.length}건 · 이전 정상 데이터는 유지됩니다.
              </summary>
              <ul className="mt-1 max-h-48 max-w-full list-disc space-y-0.5 overflow-y-auto overflow-x-hidden pl-4 pr-2">
                {failures.map((attempt) => (
                  <li key={attempt.attemptId} className="break-words">
                    {attempt.keyword}: {" "}
                    {attempt.errorMessage ?? attempt.errorCode ?? "수집 실패"}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      <CollectionStartControl
        control={control}
        startLabel="전체 상품 순위 수집"
        startTitle="자사 상품 전체의 Wing 판매순위를 수집합니다."
        startBlockedReason={extensionId ? null : disabledReason}
        onStart={() => control.start()}
        onStop={control.stop}
      />
      {attention.map((session) => (
        <button
          key={session.attemptId}
          type="button"
          className="text-sm underline"
          onClick={() =>
            void openWingRankAttention(extensionId!, session.attemptId).catch(
              (error: unknown) => {
                setAttentionError(
                  error instanceof Error ? error.message : "확인 탭을 열지 못했습니다.",
                );
              },
            )
          }
        >
          {attempts.find((attempt) => attempt.attemptId === session.attemptId)?.keyword}{" "}
          확인 탭 열기
        </button>
      ))}
      {attentionError && (
        <p role="alert" className="text-sm text-amber-700">
          {attentionError}
        </p>
      )}
    </div>
  );
}
