import {
  collect1688TrendsFromChrome,
  TrendExtensionError,
} from '../../market/lib/1688-trend-extension';
import { sourcingWorkspaceApi } from '../../lib/sourcing-workspace-api';

/**
 * 관심 키워드로 1688 공급 후보를 수집한다.
 *
 * 서버 Playwright 로는 수집할 수 없다 — 알리바바가 프로그램 접근을 봇으로 판정해
 * `/_____tmd_____/punish` 로 돌린다(운영자 본인의 로그인된 Chrome 에 붙여도 동일).
 * 그래서 다른 몰 수집과 같은 방식으로, **운영자가 평소 쓰는 브라우저 안에서 도는
 * 확장 프로그램**에 맡긴다. 확장은 슬라이더 검증이 뜨면 우회하지 않고 탭을 열어 둔 채
 * `attention_required` 로 운영자에게 넘긴다.
 *
 * 수집 자체는 기존 1688 트렌드 수집기를 그대로 재사용한다. 확장이 서버의 정규화된
 * offer 관측값을 기록한 뒤, 이 함수는 추천 run만 다시 계산한다. 브라우저에서 다른
 * 스냅샷으로 복사하거나 점수를 만들지 않는다.
 */
export interface CollectInterest1688Result {
  runId: string;
  /** 확장이 이번 실행에서 수집한 오퍼 수(트렌드 테이블 기준). */
  collected: number;
  /** 이번 refresh가 만든 추천 run 안의 관심 키워드 1688 후보 수. */
  merged: number;
  errors: Array<{ keyword: string; message: string }>;
}

/** 확장이 한 번에 처리할 키워드 상한. 트렌드 수집기와 같은 값을 쓴다. */
const MAX_KEYWORDS = 20;

export async function collectInterestKeywordsFrom1688(
  keywords: readonly string[],
  onRunStarted?: (runId: string) => void,
  signal?: AbortSignal,
): Promise<CollectInterest1688Result> {
  const targets = Array.from(
    new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean)),
  ).slice(0, MAX_KEYWORDS);

  if (targets.length === 0) {
    throw new TrendExtensionError('collection_failed', '수집할 관심 키워드가 없습니다.');
  }

  const run = await collect1688TrendsFromChrome(targets, onRunStarted, signal);

  const recommendations = await sourcingWorkspaceApi.refreshRecommendations();
  const wanted = new Set(targets.map(normalizeKeyword));
  const merged = recommendations.data?.items.filter((item) => (
    item.sourcePlatform === '1688'
      && item.sourceKeywords.some((keyword) => wanted.has(normalizeKeyword(keyword)))
  )).length ?? 0;

  return { runId: run.runId, collected: run.collected, merged, errors: run.errors };
}

function normalizeKeyword(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}
