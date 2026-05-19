import { Injectable, Logger } from '@nestjs/common';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import {
  type AgentRuntimeExecutionContext,
  type AgentRuntimePort,
  type AgentRuntimeResult,
} from '../../../application/port/out/runtime/agent-runtime.port';
import { AgentRuntimeHandlerRegistry } from '../../../application/service/agent-runtime-handler-registry.service';

/**
 * Default runtime adapter — routes execute() calls to the per-agent-type
 * handler registered in `AgentRuntimeHandlerRegistry`. Falls back to
 * `runtime_not_configured` (the historic LocalRuntimeAdapter behaviour)
 * when no handler matches.
 *
 * This adapter replaces `LocalRuntimeAdapter`. The fail-fast contract is
 * preserved verbatim: if a consumer enqueues an agent type that no owner
 * domain has registered a handler for, the run fails with
 * `runtime_not_configured` and the operator sees a clear deployment gap.
 *
 * `AGENT_RUNTIME_ALLOW_NOOP=1` keeps its meaning: synthetic stub success
 * for isolated dev/test work where you want the queue/coordinator path
 * exercised without binding a real handler. Never set this in shared
 * environments — the synthetic output is empty and downstream sinks
 * cannot apply it.
 *
 * Worker default — `AgentRunWorker` is still opt-in
 * (`AGENT_RUNTIME_WORKER_ENABLED=1`). Once enabled, agent types with a
 * handler succeed; agent types without a handler still fail-fast quickly
 * rather than piling up. That trade-off is owner-domain managed: each
 * domain registers a handler when it is ready to serve traffic.
 */
@Injectable()
export class RoutingRuntimeAdapter implements AgentRuntimePort {
  private readonly logger = new Logger(RoutingRuntimeAdapter.name);
  private readonly allowNoop = process.env.AGENT_RUNTIME_ALLOW_NOOP === '1';

  constructor(private readonly registry: AgentRuntimeHandlerRegistry) {}

  async execute(
    context: AgentRuntimeExecutionContext,
  ): Promise<AgentRuntimeResult> {
    const handler = this.registry.resolve(context.agentType);
    if (handler) {
      return handler.execute(context);
    }

    if (this.allowNoop) {
      this.logger.debug(
        `[noop] no handler registered for ${context.agentType}; AGENT_RUNTIME_ALLOW_NOOP=1 stub.`,
      );
      return {
        output: {
          ok: true,
          agentType: context.agentType,
          runId: context.runId,
          requestId: context.requestId,
          model: context.model,
          adapterType: context.adapterType,
          message:
            'RoutingRuntimeAdapter no-op: AGENT_RUNTIME_ALLOW_NOOP=1, no handler registered.',
        },
        provider: 'local-stub',
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        costMicros: 0n,
        logExcerpt:
          'local-stub: AGENT_RUNTIME_ALLOW_NOOP=1, no handler registered.',
      };
    }

    this.logger.warn(
      `runtime_not_configured for ${context.agentType} run=${context.runId} — register a handler in AgentRuntimeHandlerRegistry or set AGENT_RUNTIME_ALLOW_NOOP=1 for explicit dev no-op mode.`,
    );
    throw new AgentOsRuntimeError(
      'runtime_not_configured',
      `Agent OS runtime is not bound to a real handler for ${context.agentType}.`,
    );
  }
}
