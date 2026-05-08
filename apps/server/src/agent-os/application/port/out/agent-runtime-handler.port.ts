import type {
  AgentRuntimeExecutionContext,
  AgentRuntimeResult,
} from './agent-runtime.port';

/**
 * Per-agent-type runtime handler.
 *
 * Owner domains (eg. `ai/`) implement one of these per agent type they own
 * and register it with `AgentRuntimeHandlerRegistry`. The agent-os
 * `RoutingRuntimeAdapter` resolves the handler by `agentType` at execute
 * time and delegates the actual provider call to it.
 *
 * Why this lives in agent-os: the contract is what agent-os promises to
 * call. The shape stays deliberately narrow (same `AgentRuntimeResult` as
 * the runtime port) so handlers cannot accidentally reach into agent-os
 * internals or smuggle additional state through the bus.
 *
 * Cycle hygiene — agent-os MUST NOT import owner-domain handlers. The
 * relationship is one-way: the AI domain imports this interface and the
 * registry (both live in agent-os), instantiates handlers in its own
 * module scope, and calls `registry.register(type, handler)` during
 * `onModuleInit`. agent-os never sees the AI domain.
 */
export interface AgentTypeRuntimeHandler {
  execute(context: AgentRuntimeExecutionContext): Promise<AgentRuntimeResult>;
}
