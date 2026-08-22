import { Inject, Injectable } from '@nestjs/common';
import {
  ADVERTISING_JUDGMENT_PORT,
  type AdvertisingJudgmentPort,
} from '../port/out/cross-domain/advertising-judgment.port';
import {
  OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../port/out/cross-domain/operation-alert.port';

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
  ) {}

  async run(input: {
    organizationId: string;
    triggeredByUserId: string | null;
    dryRun?: boolean;
  }): Promise<Awaited<ReturnType<AdvertisingJudgmentPort['submit']>>> {
    if (!input.triggeredByUserId) {
      throw new Error('AD_STRATEGY_JUDGMENT_ACTOR_REQUIRED');
    }
    const result = await this.judgment.submit({
      organizationId: input.organizationId,
      actorUserId: input.triggeredByUserId,
      objective: 'Create an advertising strategy analysis.',
      resourceRefs: [],
      idempotencyKey: `advertising.ad_strategy.manual:${input.organizationId}:${input.triggeredByUserId}:${input.dryRun ?? false}`,
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
