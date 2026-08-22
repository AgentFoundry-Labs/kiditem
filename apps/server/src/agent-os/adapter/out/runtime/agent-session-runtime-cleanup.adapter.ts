import { Injectable } from "@nestjs/common";
import type { AgentSessionRuntimeCleanupPort } from "../../../application/port/out/runtime/agent-session-runtime-cleanup.port";
import type { AgentSessionRuntimeCleanupInput, AgentSessionRuntimeCleanupResult } from "../../../application/port/out/runtime/agent-durable-runtime.port";
import { AgentRuntimeAdapterRegistry } from "../../../application/service/agent-runtime-adapter.registry";

@Injectable()
export class AgentSessionRuntimeCleanupAdapter implements AgentSessionRuntimeCleanupPort {
  constructor(private readonly runtimes: Pick<AgentRuntimeAdapterRegistry, "requireExact">) {}

  async cleanup(input: AgentSessionRuntimeCleanupInput): Promise<AgentSessionRuntimeCleanupResult> {
    try {
      const runtime = this.runtimes.requireExact(input.runtimeType);
      if (!runtime.cleanup) return { state: "unknown", code: "RUNTIME_CLEANUP_UNKNOWN" };
      return await runtime.cleanup(input);
    } catch {
      return { state: "unknown", code: "RUNTIME_CLEANUP_UNKNOWN" };
    }
  }
}
