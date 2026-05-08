import { Injectable, Logger } from '@nestjs/common';
import type { AgentTypeRuntimeHandler } from '../port/out/agent-runtime-handler.port';

/**
 * Registry of per-agent-type runtime handlers, keyed by `agentType`.
 *
 * Why a runtime registry instead of constructor-time multi-binding:
 *
 *   - NestJS DI does not let `RoutingRuntimeAdapter` (declared in
 *     AgentOsModule) inject providers that live in the AI domain (declared
 *     in AiModule). Importing AI from agent-os would create the exact
 *     module cycle the architecture forbids.
 *   - Owner-domain handlers register themselves into this `@Injectable()`
 *     during `onModuleInit`. NestJS guarantees provider initialization
 *     ordering (dependency-first), so by the time the worker / executor
 *     ticks, every handler that the AI module declared has already
 *     registered.
 *   - One-way dependency: AI imports the registry (which is exported by
 *     AgentOsModule). agent-os never sees AI.
 *
 * Multi-instance note: this is in-process state. The default Phase 1
 * deployment is single-instance, matching the rest of the platform.
 * Multi-instance setups need every replica to register its own copy at
 * boot — that is naturally true because each replica runs the same
 * Nest module graph.
 */
@Injectable()
export class AgentRuntimeHandlerRegistry {
  private readonly logger = new Logger(AgentRuntimeHandlerRegistry.name);
  private readonly handlers = new Map<string, AgentTypeRuntimeHandler>();

  register(agentType: string, handler: AgentTypeRuntimeHandler): void {
    if (!agentType || agentType.length === 0) {
      throw new Error('AgentRuntimeHandlerRegistry.register: agentType is required.');
    }
    if (this.handlers.has(agentType)) {
      this.logger.warn(
        `AgentRuntimeHandlerRegistry: replacing existing handler for "${agentType}".`,
      );
    }
    this.handlers.set(agentType, handler);
    this.logger.log(
      `AgentRuntimeHandlerRegistry: registered handler for "${agentType}".`,
    );
  }

  resolve(agentType: string): AgentTypeRuntimeHandler | null {
    return this.handlers.get(agentType) ?? null;
  }

  /**
   * Snapshot for observability / tests. Mutating the returned array does
   * not affect the registry.
   */
  registeredTypes(): string[] {
    return Array.from(this.handlers.keys()).sort();
  }
}
