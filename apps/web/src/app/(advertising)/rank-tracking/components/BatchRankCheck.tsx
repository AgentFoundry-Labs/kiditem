"use client";

import { useEffect, useRef } from "react";
import { CollectionStartControl } from "@/components/collection/CollectionStartControl";
import { advertisingOperationState } from "@/lib/advertising-operation-collection";
import { attemptFailureText } from "@/lib/operator-error";
import { useKeywordSerpCollection, useRepresentativeKeywords } from "../lib/keyword-serp-collection";
import { useWingRankCollection } from "../lib/wing-rank-collection";

/**
 * 자사 상품 대표 키워드의 순위 수집 두 가지(KID-362): Wing 판매순위(`advertising.wing_rank`)와 쿠팡 검색 SERP 순위
 * (`advertising.keyword_serp`, 같은 대표 키워드). 각각 공용 수집 컨트롤과 마지막 실행의 실패를 보인다. 실행 하나가 키워드
 * 전부를 돌므로 진행은 컨트롤이 `처리/전체 키워드`로 보인다. 같은 키워드는 한 번에 한 수집만 돈다.
 */
export default function BatchRankCheck({ onCompleted }: { onCompleted: () => void }) {
  const wingRank = useWingRankCollection();
  const serp = useKeywordSerpCollection();
  const keywords = useRepresentativeKeywords();
  const { latest, lastSucceeded } = advertisingOperationState(wingRank.status);
  const serpLatest = advertisingOperationState(serp.status).latest;
  const observed = useRef<string | null>(null);

  const loaded = wingRank.status !== undefined;
  const succeededId = lastSucceeded?.id ?? "";
  // 처음 읽은 마지막 성공은 기준이다. 그 뒤 새 성공이 보이면 순위 읽기를 다시 읽는다.
  useEffect(() => {
    if (!loaded) return;
    if (observed.current !== null && succeededId !== observed.current && succeededId) onCompleted();
    observed.current = succeededId;
  }, [loaded, succeededId, onCompleted]);

  const failed = latest?.status === "failed" ? latest : null;
  const serpFailed = serpLatest?.status === "failed" ? serpLatest : null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {failed && (
        <p role="alert" className="text-xs text-rose-600">
          마지막 Wing 순위 수집 실패: {attemptFailureText(failed, "coupang_wing_rank") ?? "수집 실패"} · 이전 정상 데이터는 유지됩니다.
        </p>
      )}
      {serpFailed && (
        <p role="alert" className="text-xs text-rose-600">
          마지막 SERP 순위 수집 실패: {attemptFailureText(serpFailed, "coupang_keyword_serp") ?? "수집 실패"} · 이전 정상 데이터는 유지됩니다.
        </p>
      )}
      <CollectionStartControl
        control={wingRank}
        startLabel="전체 상품 순위 수집"
        startTitle="자사 상품 전체의 Wing 판매순위를 수집합니다."
        onStart={() => wingRank.start()}
        onStop={wingRank.stop}
      />
      <CollectionStartControl
        control={serp}
        startLabel="SERP 순위"
        startTitle="대표 키워드(앞에서부터 최대 100개)의 쿠팡 검색 노출 순위를 수집합니다(키워드마다 검색 결과 최대 3쪽)."
        onStart={() => serp.start(keywords)}
        onStop={serp.stop}
      />
    </div>
  );
}
