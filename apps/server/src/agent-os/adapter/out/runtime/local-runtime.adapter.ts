import { Injectable, Logger } from '@nestjs/common';
import {
  type AgentRuntimeExecutionContext,
  type AgentRuntimePort,
  type AgentRuntimeResult,
} from '../../../application/port/out/agent-runtime.port';

/**
 * Default runtime adapter. Records the execution intent and returns a
 * structured no-op so coordinator/executor/policy/observability paths can be
 * exercised end-to-end without binding to a specific Claude CLI / Python
 * runner. Real adapter implementations should replace this provider via
 * `AGENT_RUNTIME_PORT` override in the AgentOsModule.
 */
@Injectable()
export class LocalRuntimeAdapter implements AgentRuntimePort {
  private readonly logger = new Logger(LocalRuntimeAdapter.name);

  async execute(
    context: AgentRuntimeExecutionContext,
  ): Promise<AgentRuntimeResult> {
    this.logger.debug(
      `Executing agent ${context.agentType} (instance ${context.agentInstanceId}, run ${context.runId}, model ${context.model})`,
    );

    return {
      output: {
        ok: true,
        agentType: context.agentType,
        runId: context.runId,
        requestId: context.requestId,
        model: context.model,
        adapterType: context.adapterType,
        message: 'Local stub adapter executed; no provider configured.',
      },
      provider: 'local-stub',
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      costMicros: 0n,
      logExcerpt: 'local-stub: no runtime call performed.',
    };
  }
}
