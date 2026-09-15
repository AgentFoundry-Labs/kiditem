'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import {
  useRefreshSourcingRecommendations,
  useRefreshSourcingValidation,
} from '../hooks/use-sourcing-workspace';
import type { WingCatalogAttempt } from '../lib/sourcing-wing-source-owner';

const RECOMMENDATION_SOURCE_PURPOSES = new Set(['market_analysis', 'recommendation_validation']);

const BUTTON_CLASS =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-black text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50';

/**
 * The explicit sourcing calculations that follow a Wing catalog collection. A
 * finished collection never runs them; the operator refreshes each one here.
 */
export function WingCatalogCalculationActions({
  attempt,
  validation = false,
}: {
  attempt: WingCatalogAttempt | null;
  validation?: boolean;
}) {
  const recommendations = useRefreshSourcingRecommendations();
  const validationRefresh = useRefreshSourcingValidation();
  const recommendationSource = attempt?.state === 'COMPLETE'
    && RECOMMENDATION_SOURCE_PURPOSES.has(attempt.plan.purpose)
    ? attempt
    : null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-live="polite">
      <button
        type="button"
        disabled={!recommendationSource || recommendations.isPending}
        title={recommendationSource
          ? '완료된 Wing 수집으로 오늘의 추천을 다시 계산합니다.'
          : '시장분석이나 추천 검증 Wing 수집이 완료된 뒤 갱신할 수 있습니다.'}
        onClick={() => {
          if (recommendationSource) recommendations.mutate(recommendationSource.attemptId);
        }}
        className={BUTTON_CLASS}
      >
        {recommendations.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        {recommendations.isPending ? '추천 갱신 중…' : '추천 갱신'}
      </button>
      {validation && (
        <button
          type="button"
          disabled={validationRefresh.isPending}
          title="최신 추천 결과로 상품 검증을 다시 계산합니다."
          onClick={() => validationRefresh.mutate()}
          className={BUTTON_CLASS}
        >
          {validationRefresh.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {validationRefresh.isPending ? '검증 갱신 중…' : '검증 갱신'}
        </button>
      )}
      {recommendations.isError && (
        <p className="w-full text-xs font-bold text-rose-700">추천을 갱신하지 못했습니다.</p>
      )}
      {validation && validationRefresh.isError && (
        <p className="w-full text-xs font-bold text-rose-700">검증을 갱신하지 못했습니다.</p>
      )}
    </div>
  );
}
