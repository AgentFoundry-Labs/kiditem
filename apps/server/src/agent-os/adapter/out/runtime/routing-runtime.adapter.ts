import { Injectable, Logger } from '@nestjs/common';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import {
  type AgentRuntimeExecutionContext,
  type AgentRuntimePort,
  type AgentRuntimeResult,
  type CancelAgentRuntimeInput,
} from '../../../application/port/out/runtime/agent-runtime.port';
import { AgentRuntimeHandlerRegistry } from '../../../application/service/agent-runtime-handler-registry.service';
import { AgentLocalCliRuntimeAdapter } from './agent-local-cli-runtime.adapter';

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
 * Worker default — `AgentRunWorker` is still opt-in
 * (the retired generic AgentRun worker). Agent types with a
 * handler succeed; agent types without a handler still fail-fast quickly
 * rather than piling up. That trade-off is owner-domain managed: each
 * domain registers a handler when it is ready to serve traffic.
 */
@Injectable()
export class RoutingRuntimeAdapter implements AgentRuntimePort {
  private readonly logger = new Logger(RoutingRuntimeAdapter.name);
  constructor(
    private readonly registry: AgentRuntimeHandlerRegistry,
    private readonly localCliRuntime?: AgentLocalCliRuntimeAdapter,
  ) {}

  async execute(
    context: AgentRuntimeExecutionContext,
  ): Promise<AgentRuntimeResult> {
    const handler = this.registry.resolve(context.agentType);
    if (handler && (!handler.supports || handler.supports(context))) {
      return handler.execute(context);
    }
    if (
      context.adapterType === 'claude_cli' ||
      context.adapterType === 'codex_cli'
    ) {
      if (!this.localCliRuntime) {
        throw new AgentOsRuntimeError(
          'runtime_not_configured',
          'Agent OS local CLI runtime is not configured.',
        );
      }
      return this.localCliRuntime.execute(context);
    }

    this.logger.warn(
      `runtime_not_configured for ${context.agentType} run=${context.runId} — register a supporting handler or configure a local CLI adapter.`,
    );
    throw new AgentOsRuntimeError(
      'runtime_not_configured',
      `Agent OS runtime is not bound to a real handler for ${context.agentType}.`,
    );
  }

  cancel(input: CancelAgentRuntimeInput): Promise<boolean> {
    return this.localCliRuntime?.cancel(input) ?? Promise.resolve(false);
  }
}
