import { Injectable, Logger } from '@nestjs/common';
import type { AdStrategyAction, AdStrategyRecommendation } from '@kiditem/shared/advertising';
import { AgentRegistryService } from '../../../agent-registry/agent-registry.service';
import type { RecommendInput } from '../../domain/model/strategy-types';

/**
 * Hybrid sub-service — 4 sub-service 중 유일한 예외로 `AgentRegistryService` 주입.
 * PrismaService 미주입 (pure calculator 원칙 유지, agent dependency 만 허용).
 *
 * orchestrator (T7) 가 호출:
 *   - enhanceActionsWithAi(actions, companyId) — ad-strategy.service.ts:1150-1212 본문 이전.
 *     agent 실패 시 원본 actions 그대로 반환 (no throw, graceful fallback).
 *   - toRecommendations(agentResultJson) — latestTask.resultJson → recommendation shape 변환.
 *     orchestrator 가 prisma.agentTask.findFirst 로 read 후 본 메서드에 resultJson 전달.
 *
 * 기존 Gemini 직접 fetch 는 Agent OS path (AgentRegistryService) 로 이관 — 에이전트 정의가
 * DB 에 등록되어 있으면 agent 경유, 없으면 즉시 원본 반환 (backward compatible).
 */
@Injectable()
export class AdRecommendService {
  private readonly logger = new Logger(AdRecommendService.name);

  constructor(private readonly agentRegistry: AgentRegistryService) {}

  /**
   * AI agent 결과로 주간 action plan 보강. agent 호출 실패 / 정의 없음 / 빈 input 은
   * 모두 원본 actions 반환으로 graceful degradation (기존 Gemini fallback 시멘틱 보존).
   *
   * 기존 ad-strategy.service.ts:1150-1212 의 Gemini 호출 + result merge 를
   * AgentRegistryService 경유로 이관. 실제 agent 실행은 비동기 (`runByType` 트리거 후
   * `AgentResultReadyEvent` 로 결과 수령)이므로 본 메서드는 정의 존재만 확인 + 무결성
   * 체크 후 원본 actions 를 반환한다. 최신 결과 merge 는 `toRecommendations` 경유
   * (orchestrator 가 resultJson 을 조회).
   */
  async enhanceActionsWithAi(
    actions: RecommendInput,
    companyId: string,
  ): Promise<AdStrategyAction[]> {
    if (actions.length === 0) return [];

    try {
      const def = await this.agentRegistry.findByType('ad_strategy');
      if (!def) return actions;
      // Agent OS path — 정의가 있으면 현재는 원본 actions 를 반환 (비동기 agent 결과
      // merge 는 toRecommendations 경유). 실 agent 실행 시그널이 들어오면 추후 merge
      // 로직 추가 (기존 Gemini 동기 호출 대체).
      if (def.companyId && def.companyId !== companyId) {
        // 타 회사 정의 — 사용 불가, 원본 반환.
        return actions;
      }
      return actions;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`enhanceActionsWithAi 실패 (원본 actions 반환): ${message}`);
      return actions;
    }
  }

  /**
   * 최신 agent task 결과 JSON → AdStrategyRecommendation[] 변환.
   *
   * 기존 ad-strategy.service.ts:180-197 (getRecommendations) 의 계산기 기반 구현을
   * agent result 기반으로 전환. orchestrator 는 `prisma.agentTask.findFirst`로 최신
   * resultJson 을 읽어 본 메서드에 전달한다.
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
