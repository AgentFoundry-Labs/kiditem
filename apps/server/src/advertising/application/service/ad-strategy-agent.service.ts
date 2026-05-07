import { Inject, Injectable } from '@nestjs/common';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
  type AgentRunnerResult,
} from '../../../agent-os/application/port/in/agent-runner.port';

/**
 * Triggers the `ad_strategy` agent through the Agent OS port.
 *
 * Run observability (status / latest / list) is owned by the Agent OS
 * surface (`/api/agent-os/runs*`). Advertising no longer reads
 * `AgentRun*` directly — the legacy `AgentTask` model and its event-bus
 * post-processing have been removed.
 */
@Injectable()
export class AdStrategyAgentService {
  constructor(
    @Inject(AGENT_RUNNER_PORT)
    private readonly agentRunner: AgentRunnerPort,
  ) {}

  async run(input: {
    organizationId: string;
    dryRun?: boolean;
  }): Promise<AgentRunnerResult> {
    return this.agentRunner.runByType('ad_strategy', {
      organizationId: input.organizationId,
      sourceType: 'advertising.ad_strategy.manual',
      reason: 'manual_trigger',
      dryRun: input.dryRun,
    });
  }
}
