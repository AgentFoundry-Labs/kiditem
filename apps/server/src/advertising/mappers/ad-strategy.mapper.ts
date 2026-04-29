import type {
  AdRulesData,
  AdStrategyAction,
  AdStrategyRecommendation,
} from '@kiditem/shared/advertising';

/**
 * Ad strategy actions → recommendation summary used by /api/ads/strategy/rules.
 *
 * Counts urgent priority actions for the summary stats. Caller orchestrates
 * the underlying rule evaluation and passes the resulting actions in.
 */
export function toAdRulesData(actions: AdStrategyAction[]): AdRulesData {
  return {
    recommendations: actions,
    summary: {
      totalActions: actions.length,
      urgentCount: actions.filter((a) => a.priority === 'urgent').length,
    },
  } satisfies AdRulesData;
}

/**
 * Strategy actions → recommendation cards (urgent/high only, top 20).
 *
 * Used by /api/ads/strategy/recommend. Uses each action's `actionType` as
 * the title and `reason` as the body — keeps the cards calculator-driven
 * (no agent-task dependency, B2b restoration).
 */
export function toRecommendationCards(
  actions: AdStrategyAction[],
): AdStrategyRecommendation[] {
  return actions
    .filter((a) => a.priority === 'urgent' || a.priority === 'high')
    .slice(0, 20)
    .map(
      (a) =>
        ({
          listing: a.listing,
          grade: a.grade,
          title: a.actionType,
          body: a.reason,
          priority: a.priority,
        }) satisfies AdStrategyRecommendation,
    );
}
