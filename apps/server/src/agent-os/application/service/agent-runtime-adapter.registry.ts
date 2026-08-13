import { Injectable } from '@nestjs/common';
import type {
  AgentDurableRuntimeAdapter,
  AgentDurableRuntimeCapabilities,
} from '../port/out/runtime/agent-durable-runtime.port';
import { AgentOsRuntimeError } from '../../domain/agent-os.errors';

@Injectable()
export class AgentRuntimeAdapterRegistry {
  private readonly adapters = new Map<string, AgentDurableRuntimeAdapter>();

  register(adapter: AgentDurableRuntimeAdapter): void {
    const runtimeType = adapter.runtimeType.trim();
    if (!runtimeType) {
      throw new Error('Agent durable runtime type is required.');
    }
    if (this.adapters.has(runtimeType)) {
      throw new Error(`Agent durable runtime already registered: ${runtimeType}`);
    }
    this.adapters.set(runtimeType, adapter);
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

  registeredTypes(): string[] {
    return [...this.adapters.keys()].sort();
  }
}
