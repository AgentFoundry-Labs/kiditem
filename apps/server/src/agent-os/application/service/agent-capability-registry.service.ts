import { Injectable } from '@nestjs/common';
import type { AgentCapabilityHandler } from '../port/out/capability/agent-capability-handler.port';

@Injectable()
export class AgentCapabilityRegistry {
  private readonly handlers = new Map<string, AgentCapabilityHandler>();

  register(handler: AgentCapabilityHandler): void {
    const existing = this.handlers.get(handler.key);
    if (existing && existing !== handler) {
      throw new Error(`Agent capability already registered: ${handler.key}`);
    }
    this.handlers.set(handler.key, handler);
  }

  resolve(key: string): AgentCapabilityHandler | null {
    return this.handlers.get(key) ?? null;
  }

  list(): AgentCapabilityHandler[] {
    return [...this.handlers.values()];
  }
}
