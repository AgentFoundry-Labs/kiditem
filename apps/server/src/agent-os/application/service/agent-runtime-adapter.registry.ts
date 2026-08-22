import { Injectable } from '@nestjs/common';
import type {
  AgentDurableRuntimeAdapter,
  AgentDurableRuntimeCapabilities,
  AgentSessionRuntimeCleanupInput,
  AgentSessionRuntimeCleanupResult,
} from '../port/out/runtime/agent-durable-runtime.port';
import { AgentOsRuntimeError } from '../../domain/agent-os.errors';

@Injectable()
export class AgentRuntimeAdapterRegistry {
  private readonly adapters = new Map<string, AgentDurableRuntimeAdapter>();
  private readonly cleanupAdapters = new Map<string, RuntimeCleanupCapability>();

  register(adapter: AgentDurableRuntimeAdapter): void {
    const runtimeType = adapter.runtimeType.trim();
    if (!runtimeType) {
      throw new Error('Agent durable runtime type is required.');
    }
    if (this.adapters.has(runtimeType)) {
      throw new Error(`Agent durable runtime already registered: ${runtimeType}`);
    }
    this.adapters.set(runtimeType, adapter);
    if (hasCleanup(adapter)) this.cleanupAdapters.set(runtimeType, adapter);
  }

  /** Register a cleanup-only runtime surface without pretending it can start a durable CLI run. */
  registerCleanup(adapter: RuntimeCleanupCapability): void {
    const runtimeType = adapter.runtimeType.trim();
    if (!runtimeType) throw new Error('Agent runtime cleanup type is required.');
    if (this.cleanupAdapters.has(runtimeType)) {
      throw new Error(`Agent runtime cleanup already registered: ${runtimeType}`);
    }
    this.cleanupAdapters.set(runtimeType, adapter);
  }

  requireCompatible(
    runtimeType: string,
    required: AgentDurableRuntimeCapabilities,
  ): AgentDurableRuntimeAdapter {
    const adapter = this.adapters.get(runtimeType);
    if (!adapter) {
      throw new AgentOsRuntimeError(
        'AGENT_RUNTIME_NOT_CONFIGURED',
        `AGENT_RUNTIME_NOT_CONFIGURED: ${runtimeType}`,
      );
    }
    const missing = (Object.keys(required) as Array<keyof AgentDurableRuntimeCapabilities>)
      .filter((key) => required[key] && !adapter.capabilities[key]);
    if (missing.length > 0) {
      throw new AgentOsRuntimeError(
        'AGENT_RUNTIME_CAPABILITY_MISSING',
        `Agent runtime ${runtimeType} is missing: ${missing.join(', ')}`,
      );
    }
    return adapter;
  }

  /** Exact persisted type lookup. Deletion may never substitute a fallback runtime. */
  requireExact(runtimeType: string): AgentDurableRuntimeAdapter {
    const adapter = this.adapters.get(runtimeType);
    if (!adapter) {
      throw new AgentOsRuntimeError(
        'AGENT_RUNTIME_NOT_CONFIGURED',
        `AGENT_RUNTIME_NOT_CONFIGURED: ${runtimeType}`,
      );
    }
    return adapter;
  }

  requireExactCleanup(runtimeType: string): RuntimeCleanupCapability {
    const adapter = this.cleanupAdapters.get(runtimeType);
    if (!adapter) {
      throw new AgentOsRuntimeError(
        'AGENT_RUNTIME_NOT_CONFIGURED',
        `AGENT_RUNTIME_NOT_CONFIGURED: ${runtimeType}`,
      );
    }
    return adapter;
  }

  registeredTypes(): string[] {
    return [...this.adapters.keys()].sort();
  }
}

export interface RuntimeCleanupCapability {
  readonly runtimeType: string;
  cleanup(input: AgentSessionRuntimeCleanupInput): Promise<AgentSessionRuntimeCleanupResult>;
}

function hasCleanup(
  adapter: AgentDurableRuntimeAdapter,
): adapter is AgentDurableRuntimeAdapter & RuntimeCleanupCapability {
  return typeof adapter.cleanup === 'function';
}
