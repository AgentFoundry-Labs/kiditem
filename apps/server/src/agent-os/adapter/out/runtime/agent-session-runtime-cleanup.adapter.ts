import { Inject, Injectable } from "@nestjs/common";
import type { AgentSessionRuntimeCleanupPort } from "../../../application/port/out/runtime/agent-session-runtime-cleanup.port";
import type { AgentSessionRuntimeCleanupInput, AgentSessionRuntimeCleanupResult } from "../../../application/port/out/runtime/agent-durable-runtime.port";
import { AgentRuntimeAdapterRegistry } from "../../../application/service/agent-runtime-adapter.registry";

@Injectable()
export class AgentSessionRuntimeCleanupAdapter implements AgentSessionRuntimeCleanupPort {
  constructor(@Inject(AgentRuntimeAdapterRegistry) private readonly runtimes: Pick<AgentRuntimeAdapterRegistry, "requireExactCleanup">) {}

  async cleanup(input: AgentSessionRuntimeCleanupInput): Promise<AgentSessionRuntimeCleanupResult> {
    try {
      const runtime = this.runtimes.requireExactCleanup(input.runtimeType);
      return await runtime.cleanup(input);
    } catch {
      if (input.signal.aborted) {
        throw input.signal.reason;
      }
      return { state: "unknown", code: "RUNTIME_CLEANUP_UNKNOWN" };
    }
  }
}
