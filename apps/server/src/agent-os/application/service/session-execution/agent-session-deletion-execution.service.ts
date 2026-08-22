import { Inject, Injectable } from "@nestjs/common";
import {
  AGENT_SESSION_DELETION_EXECUTION_PORT,
  type AgentSessionDeletionExecutionPort,
} from "../../port/in/session-execution/agent-session-deletion-execution.port";
import {
  AGENT_SESSION_DELETION_EXECUTION_TRANSACTION,
  type AgentSessionDeletionExecutionTransactionPort,
} from "../../port/out/transaction/session-deletion/agent-session-deletion-execution.transaction.port";
import {
  AGENT_SESSION_OWNED_OPERATION_CONTROL_PORT,
  type AgentSessionOwnedOperationControlPort,
} from "../../port/out/operation/agent-session-owned-operation-control.port";
import {
  AGENT_SESSION_RUNTIME_CLEANUP_PORT,
  type AgentSessionRuntimeCleanupPort,
} from "../../port/out/runtime/agent-session-runtime-cleanup.port";
import {
  AGENT_SESSION_ARTIFACT_WRITER_PORT,
  type AgentSessionArtifactWriterPort,
} from "../../port/in/session-execution/agent-session-artifact-writer.port";
import {
  AGENT_SESSION_ARTIFACT_STORAGE_PORT,
  type AgentSessionArtifactStoragePort,
} from "../../port/out/storage/agent-session-artifact-storage.port";
import { deriveAgentSessionArtifactKey } from "../../../domain/session/agent-session-artifact-key";

@Injectable()
export class AgentSessionDeletionExecutionService implements AgentSessionDeletionExecutionPort {
  constructor(
    @Inject(AGENT_SESSION_DELETION_EXECUTION_TRANSACTION)
    private readonly transaction: AgentSessionDeletionExecutionTransactionPort,
    @Inject(AGENT_SESSION_OWNED_OPERATION_CONTROL_PORT)
    private readonly operations: AgentSessionOwnedOperationControlPort,
    @Inject(AGENT_SESSION_RUNTIME_CLEANUP_PORT)
    private readonly runtimes: AgentSessionRuntimeCleanupPort,
    @Inject(AGENT_SESSION_ARTIFACT_WRITER_PORT)
    private readonly artifacts: AgentSessionArtifactWriterPort,
    @Inject(AGENT_SESSION_ARTIFACT_STORAGE_PORT)
    private readonly storage: AgentSessionArtifactStoragePort,
  ) {}

  async execute(input: {
    signal: AbortSignal; organizationId: string; sessionId: string;
    operationRunId: string; attemptToken: string;
  }) {
    input.signal.throwIfAborted();
    let snapshot: Awaited<ReturnType<AgentSessionDeletionExecutionTransactionPort["loadFencedSnapshot"]>>;
    try {
      snapshot = await this.transaction.loadFencedSnapshot(input);
    } catch (error) {
      if (input.signal.aborted) throw error;
      return { kind: "retryable" as const, code: "SESSION_DELETION_INVARIANT", consumedAttempts: 1 };
    }
    if ("kind" in snapshot) return snapshot;
    const fence = await this.operations.fenceAndCancel({
      signal: input.signal, organizationId: input.organizationId,
      sessionId: input.sessionId, operationRunIds: snapshot.operationRunIds,
    });
    if (fence.state !== "fenced") {
      return { kind: "retryable" as const, code: "SESSION_OPERATION_OWNERSHIP_INVALID", consumedAttempts: snapshot.consumedAttempts };
    }
    await this.artifacts.beginFence({
      organizationId: input.organizationId, sessionId: input.sessionId,
      operationRunIds: snapshot.operationRunIds,
    });
    for (const attempt of snapshot.runtimeAttempts) {
      if (attempt.state === "never_started") continue;
      if (!attempt.startIntentId) {
        return { kind: "retryable" as const, code: "SESSION_DELETION_INVARIANT", consumedAttempts: snapshot.consumedAttempts };
      }
      const result = await this.runtimes.cleanup({
        signal: input.signal, organizationId: input.organizationId,
        sessionId: input.sessionId, runtimeType: attempt.runtimeType,
        executionId: attempt.executionId, attemptId: attempt.attemptId,
        startIntentId: attempt.startIntentId, handle: attempt.handle ?? null,
      });
      if (result.state === "unknown") {
        return { kind: "retryable" as const, code: "RUNTIME_CLEANUP_UNKNOWN", consumedAttempts: snapshot.consumedAttempts };
      }
    }
    const writer = await this.artifacts.confirmFenced({
      organizationId: input.organizationId, sessionId: input.sessionId,
      operationRunIds: snapshot.operationRunIds,
    });
    if (writer.state !== "fenced") {
      return { kind: "retryable" as const, code: "ARTIFACT_WRITER_NOT_FENCED", consumedAttempts: snapshot.consumedAttempts };
    }
    for (const artifact of snapshot.artifacts) {
      await this.transaction.terminalizeOwnedRun({
        organizationId: input.organizationId, sessionId: input.sessionId,
        operationRunId: artifact.materializationOperationRunId,
        deletionOperationRunId: input.operationRunId,
        attemptToken: input.attemptToken,
      });
      const erased = await this.storage.abortEraseAndConfirm({
        key: deriveAgentSessionArtifactKey({
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          artifactId: artifact.artifactId,
        }),
        uploadId: artifact.providerUploadId,
        signal: input.signal,
      });
      if (erased.state !== "erased") {
        return {
          kind: "retryable" as const,
          code: erased.state === "present" ? "STORAGE_DELETE_PRESENT" : "STORAGE_DELETE_UNKNOWN",
          consumedAttempts: snapshot.consumedAttempts,
        };
      }
    }
    return { kind: "ready_for_graph_delete" as const, closureDigest: snapshot.closureDigest };
  }
}

export { AGENT_SESSION_DELETION_EXECUTION_PORT };
