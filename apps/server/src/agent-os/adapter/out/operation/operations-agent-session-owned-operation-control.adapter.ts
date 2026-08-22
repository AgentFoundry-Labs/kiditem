import { Injectable } from "@nestjs/common";
import type { AgentSessionOwnedOperationControlPort } from "../../../application/port/out/operation/agent-session-owned-operation-control.port";
import type { OperationExactRunControlPort } from "../../../../operations/application/port/in/operation-exact-run-control.port";

interface OwnershipValidator {
  validateOwnedClosure(input: { organizationId: string; sessionId: string; operationRunIds: readonly string[] }): Promise<ReadonlyArray<{
    runId: string;
    operationKey: string;
    expectedAttemptToken: string | null;
  }>>;
}

@Injectable()
export class OperationsAgentSessionOwnedOperationControlAdapter implements AgentSessionOwnedOperationControlPort {
  constructor(private readonly ownership: OwnershipValidator, private readonly exact: OperationExactRunControlPort) {}

  async fenceAndCancel(input: { signal: AbortSignal; organizationId: string; sessionId: string; operationRunIds: readonly string[] }) {
    let runs: Awaited<ReturnType<OwnershipValidator["validateOwnedClosure"]>>;
    try {
      runs = await this.ownership.validateOwnedClosure(input);
    } catch {
      return { state: "unknown" as const, code: "SESSION_OPERATION_OWNERSHIP_INVALID" as const };
    }
    if (runs.length !== input.operationRunIds.length || runs.some((run, index) => run.runId !== input.operationRunIds[index])) {
      return { state: "unknown" as const, code: "SESSION_OPERATION_OWNERSHIP_INVALID" as const };
    }
    let fenced: Awaited<ReturnType<OperationExactRunControlPort["fenceAndCancel"]>>;
    try {
      fenced = await this.exact.fenceAndCancel({
        signal: input.signal,
        organizationId: input.organizationId,
        runs,
        reason: "agent_session_deleting",
      });
    } catch {
      return { state: "unknown" as const, code: "SESSION_OPERATION_OWNERSHIP_INVALID" as const };
    }
    if (fenced.length !== runs.length || fenced.some((run, index) => run.runId !== runs[index]?.runId || run.state === "unknown")) {
      return { state: "unknown" as const, code: "SESSION_OPERATION_OWNERSHIP_INVALID" as const };
    }
    return { state: "fenced" as const };
  }
}
