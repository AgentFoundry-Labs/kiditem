import { Sourcing1688KeywordAttentionError, Sourcing1688KeywordProviderError } from '../port/out/provider/1688-keyword-search.port';
import { Sourcing1688BatchUnitResultSchema, type Sourcing1688BatchResult, type Sourcing1688BatchUnitResult } from '@kiditem/shared/sourcing';
import {
  SOURCING_1688_IMAGE_COLLECTOR_KEY,
  SOURCING_1688_KEYWORD_COLLECTOR_KEY,
  SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION,
} from '../port/out/repository/sourcing-1688-search-result.repository.port';
import type { SourcingSourceAttempt } from './sourcing-server-operation.runner';

export function sourceAlert(source: string, targetKey: string) {
  return { sourceType: source, dedupeKey: `source:${source}:${targetKey}`, title: '1688 수집 실패', href: '/sourcing-ai/wholesale-search' };
}

export function searchUnit(keyword: string, targetId: string | null, discovered: number, rejected: number): Sourcing1688BatchUnitResult {
  const allRejected = discovered > 0 && rejected === discovered;
  return { keyword, targetId, outcome: allRejected ? 'failed' : discovered ? 'complete' : 'no_change',
    discovered, accepted: discovered - rejected, duplicate: 0, failed: rejected,
    ...(allRejected ? { errorCode: 'all_results_rejected' } : {}) };
}

export function failedUnit(keyword: string, targetId: string | null, error: unknown): Sourcing1688BatchUnitResult {
  const errorCode = error instanceof Sourcing1688KeywordAttentionError || error instanceof Sourcing1688KeywordProviderError
    ? error.code : 'provider_failed';
  return { keyword, targetId, outcome: 'failed', discovered: 0, accepted: 0, duplicate: 0, failed: 1, errorCode };
}

export function stopsKeywordBatch(unit: Sourcing1688BatchUnitResult): boolean {
  return ['marketplace_login_required', 'cdp_configuration_invalid', 'cdp_unavailable', 'browser_context_unavailable'].includes(unit.errorCode ?? '');
}

export function batchResult(units: Sourcing1688BatchUnitResult[], source: string, attempts: SourcingSourceAttempt[]): Sourcing1688BatchResult {
  const failed = units.reduce((sum, unit) => sum + unit.failed, 0);
  const accepted = units.reduce((sum, unit) => sum + unit.accepted, 0);
  const discovered = units.reduce((sum, unit) => sum + unit.discovered, 0);
  const duplicate = units.reduce((sum, unit) => sum + unit.duplicate, 0);
  const unchanged = units.filter((unit) => unit.outcome === 'no_change').length;
  const outcome = units.some((unit) => unit.outcome === 'failed' || unit.failed > 0) ? 'partial'
    : units.some((unit) => unit.outcome === 'complete') ? 'complete' : 'no_change';
  return { outcome, summary: { discovered, accepted, duplicate, unchanged, failed },
    sources: [{ source, outcome, accepted, failed }], units,
    snapshotGeneratedAt: attempts.at(-1)?.completedAt?.toISOString() };
}

/**
 * 끝난 1688 검색 실행의 대상 하나 결과(KID-389). 성공·실패 모두 실행 result의 `unitResult`에 있다 — 실패(rejected>0)는
 * 서비스가 failed로 닫으며 같은 모양을 싣는다. 이 원천·수집기·판의 실행이 아니거나 값이 plan과 어긋나면 null.
 */
export function unitResultOf(attempt: SourcingSourceAttempt, sourceKey: '1688.hot_product' | '1688.image_search'): Sourcing1688BatchUnitResult | null {
  const image = sourceKey === '1688.image_search';
  const maxResults = image ? 18 : 6;
  const parsed = Sourcing1688BatchUnitResultSchema.safeParse(attempt.unitResult);
  if (attempt.state === 'RUNNING' || !parsed.success || attempt.sourceKey !== sourceKey || attempt.scopeKey !== 'default'
    || attempt.plan.collectorKey !== (image ? SOURCING_1688_IMAGE_COLLECTOR_KEY : SOURCING_1688_KEYWORD_COLLECTOR_KEY)
    || attempt.plan.collectorVersion !== SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION
    || attempt.plan.maxResults !== maxResults) return null;
  const unit = parsed.data;
  if (unit.keyword !== attempt.plan.keyword || unit.targetId !== (image ? attempt.plan.targetId : null)
    || unit.discovered > maxResults || unit.accepted > unit.discovered || unit.failed > maxResults
    || unit.duplicate > maxResults * 2) return null;
  return unit;
}
