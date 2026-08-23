import { Inject, Injectable } from '@nestjs/common';
import {
  ADVERTISING_JUDGMENT_PORT,
  type AdvertisingJudgmentPort,
} from '../port/out/cross-domain/advertising-judgment.port';
import {
  OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../port/out/cross-domain/operation-alert.port';
import { AdStrategyService } from './ad-strategy.service';

/**
 * Triggers `ad_strategy` as official, human-originated AgentSession work.
 */
@Injectable()
export class AdStrategyAgentService {
  constructor(
    @Inject(ADVERTISING_JUDGMENT_PORT)
    private readonly judgment: AdvertisingJudgmentPort,
    @Inject(OPERATION_ALERT_PORT)
    private readonly operationAlerts: OperationAlertPort,
    private readonly strategies: AdStrategyService,
  ) {}

  async run(input: {
    organizationId: string;
    triggeredByUserId: string | null;
    idempotencyKey: string;
    dryRun?: boolean;
  }): Promise<Awaited<ReturnType<AdvertisingJudgmentPort['submit']>>> {
    if (!input.triggeredByUserId) {
      throw new Error('AD_STRATEGY_JUDGMENT_ACTOR_REQUIRED');
    }
    const plan = await this.strategies.getWeeklyPlan('14d', input.organizationId);
    const evidence = JSON.stringify({
      week: plan.week,
      actionCount: plan.actions.length,
      issueCount: Object.values(plan.issues).reduce(
        (count, issues) => count + issues.length,
        0,
      ),
      accountSummary: plan.accountSummary,
      tierAnalysis: plan.tierAnalysis,
      top20: plan.top20.slice(0, 20),
    }).slice(0, 7_200);
    const result = await this.judgment.submit({
      organizationId: input.organizationId,
      actorUserId: input.triggeredByUserId,
      objective: `Create an advertising strategy analysis from this current 14-day owner snapshot:\n${evidence}`,
      resourceRefs: [],
      idempotencyKey: `advertising.ad_strategy.manual:${input.triggeredByUserId}:${input.idempotencyKey}`,
    });
    await this.operationAlerts.start({
      organizationId: input.organizationId,
      operationKey: `ad-strategy:${result.operation}`,
      type: 'ad_strategy',
      title: '광고 전략 분석 진행 중',
      sourceType: 'operation_run',
      sourceId: result.operation,
      actorUserId: input.triggeredByUserId,
      href: '/ad-ops',
      metadata: { agentDefinition: 'ad_strategy', dryRun: input.dryRun ?? false },
    });
    return result;
  }
}
