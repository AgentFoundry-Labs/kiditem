import { Inject, Injectable } from "@nestjs/common";
import type { AgentSessionOwnedOperationControlPort } from "../../../application/port/out/operation/agent-session-owned-operation-control.port";
import {
  OPERATION_EXACT_RUN_CONTROL_PORT,
  type OperationExactRunControlPort,
} from "../../../../operations/application/port/in/operation-exact-run-control.port";

@Injectable()
export class OperationsAgentSessionOwnedOperationControlAdapter implements AgentSessionOwnedOperationControlPort {
  constructor(
    @Inject(OPERATION_EXACT_RUN_CONTROL_PORT)
    private readonly exact: OperationExactRunControlPort,
  ) {}

  async fenceAndCancel(input: Parameters<AgentSessionOwnedOperationControlPort["fenceAndCancel"]>[0]) {
    if (!validCoordinates(input.runs)) {
      return { state: "unknown" as const, code: "SESSION_OPERATION_OWNERSHIP_INVALID" as const };
    }
    try {
      const fenced = await this.exact.fenceAndCancel({
        signal: input.signal,
        organizationId: input.organizationId,
        runs: input.runs,
        reason: "agent_session_deleting",
      });
      if (input.signal.aborted) throw input.signal.reason;
      if (
        fenced.length !== input.runs.length ||
        fenced.some((result, index) => {
          const requested = input.runs[index];
          return !requested ||
            result.runId !== requested.runId ||
            result.nativeRunType !== requested.nativeRunType ||
            result.nativeRunId !== requested.nativeRunId ||
            result.state === "unknown";
        })
      ) {
        return { state: "unknown" as const, code: "SESSION_OPERATION_OWNERSHIP_INVALID" as const };
      }
    } catch {
      if (input.signal.aborted) throw input.signal.reason;
      return { state: "unknown" as const, code: "SESSION_OPERATION_OWNERSHIP_INVALID" as const };
    }
    return { state: "fenced" as const };
  }
}

function validCoordinates(
  runs: Parameters<AgentSessionOwnedOperationControlPort["fenceAndCancel"]>[0]["runs"],
): boolean {
  const runIds = new Set<string>();
  return runs.every((run) => {
    if (!run.runId || !run.operationKey || !run.status || runIds.has(run.runId)) return false;
    runIds.add(run.runId);
    return typeof run.expectedAttemptToken === "string" || run.expectedAttemptToken === null;
  });
}
