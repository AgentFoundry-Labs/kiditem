import { Injectable, Logger } from '@nestjs/common';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import {
  type AgentRuntimeExecutionContext,
  type AgentRuntimePort,
  type AgentRuntimeResult,
} from '../../../application/port/out/agent-runtime.port';

/**
 * Default runtime adapter — explicitly fails with a clear error code so the
 * Agent OS executor finalizes the run as `failed` with `runtime_not_configured`
 * instead of silently masking a missing provider with a fabricated success.
 *
 * Real provider adapters (Claude CLI / Python HTTP / hosted LLM gateway) must
 * replace this binding via `AGENT_RUNTIME_PORT` override in the AgentOsModule.
 * Until they do, every claimed request fails fast and the failure surfaces in:
 *   - `AgentRun.errorCode = 'runtime_not_configured'`
 *   - `AgentRunRequest.lastErrorCode = 'runtime_not_configured'`
 *   - `AgentRunEvent` of type `run.failed`
 *
 * Setting `AGENT_RUNTIME_ALLOW_NOOP=1` opts in to a no-op success path for
 * isolated dev/test work where you intentionally want the queue/coordinator
 * path exercised without a real provider. This must NOT be set in shared
 * environments because it produces empty `output` JSON that downstream
 * consumers (sourcing color-guide, image edit) cannot use.
 */
@Injectable()
export class LocalRuntimeAdapter implements AgentRuntimePort {
  private readonly logger = new Logger(LocalRuntimeAdapter.name);
  private readonly allowNoop = process.env.AGENT_RUNTIME_ALLOW_NOOP === '1';

  async execute(
    context: AgentRuntimeExecutionContext,
  ): Promise<AgentRuntimeResult> {
    if (!this.allowNoop) {
      this.logger.warn(
        `runtime_not_configured for ${context.agentType} run=${context.runId} — bind a real provider via AGENT_RUNTIME_PORT or set AGENT_RUNTIME_ALLOW_NOOP=1 for explicit dev no-op mode.`,
      );
      throw new AgentOsRuntimeError(
        'runtime_not_configured',
        `Agent OS runtime is not bound to a real provider for ${context.agentType}.`,
      );
    }

    this.logger.debug(
      `[noop] agent ${context.agentType} (instance ${context.agentInstanceId}, run ${context.runId}, model ${context.model})`,
    );
    return {
      output: {
        ok: true,
        agentType: context.agentType,
        runId: context.runId,
        requestId: context.requestId,
        model: context.model,
        adapterType: context.adapterType,
        message: 'Local stub adapter executed in AGENT_RUNTIME_ALLOW_NOOP mode; no provider configured.',
      },
      provider: 'local-stub',
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      costMicros: 0n,
      logExcerpt: 'local-stub: AGENT_RUNTIME_ALLOW_NOOP=1, no real runtime call performed.',
    };
  }
}
