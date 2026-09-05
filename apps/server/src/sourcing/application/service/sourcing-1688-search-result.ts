import { Sourcing1688KeywordAttentionError, Sourcing1688KeywordProviderError } from '../port/out/provider/1688-keyword-search.port';
import type { Sourcing1688BatchResult, Sourcing1688BatchUnitResult } from '@kiditem/shared/sourcing';
import type { SourcingBrowserSourceAttempt } from '../port/out/repository/sourcing-browser-source-attempt.repository.port';

export function sourceAlert(source: string, targetKey: string) {
  return { sourceType: source, dedupeKey: `source:${source}:${targetKey}`, title: '1688 수집 실패', href: '/sourcing-ai/wholesale' };
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

export function batchResult(units: Sourcing1688BatchUnitResult[], source: string, attempts: SourcingBrowserSourceAttempt[]): Sourcing1688BatchResult {
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
