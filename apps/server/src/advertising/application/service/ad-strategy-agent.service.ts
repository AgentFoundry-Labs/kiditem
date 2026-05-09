import { Inject, Injectable } from '@nestjs/common';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
  type AgentRunnerResult,
} from '../../../agent-os/application/port/in/agent-runner.port';
import { OperationAlertService } from '../../../automation/application/service/operation-alert.service';

/**
 * Triggers the `ad_strategy` agent through the Agent OS port.
 *
 * Run observability (status / latest / list) is owned by the Agent OS
 * surface (`/api/agent-os/runs*`). Advertising no longer reads
 * `AgentRun*` directly — the legacy `AgentTask` model and its event-bus
 * post-processing have been removed.
 *
 * Producer-owned operation Alert: when the runner returns a durable
 * `requestId`, this service opens an Alert keyed by `agent_run_request` /
 * `<requestId>`. The operation-alert bridge closes the same row on
 * FINALIZED. PR #216's fallback bridge stays as a safety net.
 */
@Injectable()
export class AdStrategyAgentService {
  constructor(
    @Inject(AGENT_RUNNER_PORT)
    private readonly agentRunner: AgentRunnerPort,
    private readonly operationAlerts: OperationAlertService,
  ) {}

  async run(input: {
    organizationId: string;
    triggeredByUserId: string | null;
    dryRun?: boolean;
  }): Promise<AgentRunnerResult> {
    const result = await this.agentRunner.runByType('ad_strategy', {
      organizationId: input.organizationId,
      sourceType: 'advertising.ad_strategy.manual',
      reason: 'manual_trigger',
      dryRun: input.dryRun,
      ...(input.triggeredByUserId
        ? { requestedByUserId: input.triggeredByUserId }
        : {}),
    });

    if (result.ok && result.requestId) {
      await this.operationAlerts.start({
        organizationId: input.organizationId,
        operationKey: `ad-strategy:${result.requestId}`,
        type: 'ad_strategy',
        title: '광고 전략 분석 진행 중',
        sourceType: 'agent_run_request',
        sourceId: result.requestId,
        actorUserId: input.triggeredByUserId,
        href: '/ad-ops',
        metadata: {
          agentType: 'ad_strategy',
          dryRun: input.dryRun ?? false,
        },
      });
    }

    return result;
  }
}
