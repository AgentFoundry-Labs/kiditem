import { Injectable } from '@nestjs/common';
import type { AgentAguiRuntimeAdapter } from '../port/out/runtime/agent-agui-runtime.port';

@Injectable()
export class AgentAguiRuntimeRegistry {
  private readonly runtimes = new Map<string, AgentAguiRuntimeAdapter>();

  register(runtimeType: string, runtime: AgentAguiRuntimeAdapter): void {
    if (!runtimeType.trim()) throw new Error('AG-UI runtime type is required.');
    const current = this.runtimes.get(runtimeType);
    if (current && current !== runtime) {
      throw new Error(`AG-UI runtime already registered: ${runtimeType}`);
    }
    this.runtimes.set(runtimeType, runtime);
  }

  resolve(runtimeType: string): AgentAguiRuntimeAdapter | null {
    return this.runtimes.get(runtimeType) ?? null;
  }
}
