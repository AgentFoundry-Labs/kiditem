import { Injectable } from '@nestjs/common';
import type { AdStrategyAction, AdStrategyRecommendation } from '@kiditem/shared/advertising';
import type { RecommendInput } from '../../domain/model/strategy-types';

/**
 * Recommendation shaping for `/api/ads/strategy/*`.
 *
 * Pure calculator — no Agent OS coupling. Live `/api/ad-agent/*` execution
 * is owned by `AdStrategyAgentService` through the automation
 * `AGENT_RUNNER_PORT`; this service only:
 *   - leaves `enhanceActionsWithAi(actions)` as a graceful no-op that
 *     returns the input actions unchanged (preserves the orchestrator
 *     contract from `AdStrategyService.getAiEnhancedPlan`),
 *   - and converts an agent task's `resultJson` into the
 *     `AdStrategyRecommendation[]` API shape via `toRecommendations`.
 */
@Injectable()
export class AdRecommendService {
  /**
   * Pass-through hook for the weekly action plan. Kept as a no-op so
   * `AdStrategyService.getAiEnhancedPlan` can swap in agent-merged actions
   * later without changing the orchestrator surface. Returns the input
   * actions unchanged today.
   */
  async enhanceActionsWithAi(
    actions: RecommendInput,
    _companyId: string,
  ): Promise<AdStrategyAction[]> {
    return actions;
  }

  /**
   * Convert a latest agent task's result JSON into recommendation cards.
   *
   * Orchestrator reads `agentTask.resultJson` (from `AdStrategyAgentService`
   * runs) and hands it to this method.
   *
   * resultJson 예상 shape:
   *   { recommendations: AdStrategyRecommendation[] }
   *
   * null / 객체 아님 / recommendations 키 부재 / array 아님 → 빈 배열 반환 (no throw).
   */
  toRecommendations(agentResultJson: unknown): AdStrategyRecommendation[] {
    if (!agentResultJson || typeof agentResultJson !== 'object') return [];
    const arr = (agentResultJson as { recommendations?: unknown }).recommendations;
    if (!Array.isArray(arr)) return [];
    return arr as AdStrategyRecommendation[];
  }
}
