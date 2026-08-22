import { Inject, Injectable } from "@nestjs/common";
import {
  AGENT_SESSION_DELETION_EXECUTION_PORT,
  type AgentSessionDeletionExecutionPort,
  type AgentSessionDeletionExecutionResult,
} from "../../port/in/session-execution/agent-session-deletion-execution.port";
import {
  AGENT_SESSION_DELETION_EXECUTION_TRANSACTION,
  AGENT_SESSION_DELETION_FAILURE_CODES,
  type AgentSessionDeletionExecutionTransactionPort,
  type AgentSessionDeletionFailureCode,
  type ScopedDeletionAttempt,
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

  async execute(
    input: ScopedDeletionAttempt & {
      enterEphemeralFinalization(): Promise<{ signal: AbortSignal }>;
    },
  ): Promise<AgentSessionDeletionExecutionResult> {
    input.signal.throwIfAborted();
    const loaded = await this.settle(input.signal, 0, () =>
      this.transaction.loadFencedSnapshot(input),
    );
    if (loaded.kind === "retryable") return loaded;
    if (loaded.value.kind === "retryable") return loaded.value;
    const snapshot = loaded.value.snapshot;

    const fenced = await this.settle(
      input.signal,
      snapshot.consumedAttempts,
      () =>
        this.operations.fenceAndCancel({
          signal: input.signal,
          organizationId: input.organizationId,
          runs: snapshot.operationRuns,
        }),
    );
    if (fenced.kind === "retryable") return fenced;
    if (fenced.value.state !== "fenced")
      return retry(
        "SESSION_OPERATION_OWNERSHIP_INVALID",
        snapshot.consumedAttempts,
      );

    const beganFence = await this.settle(
      input.signal,
      snapshot.consumedAttempts,
      () =>
        this.artifacts.beginFence({
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          operationRunIds: snapshot.operationRunIds,
        }),
    );
    if (beganFence.kind === "retryable") return beganFence;

    for (const attempt of snapshot.runtimeAttempts) {
      if (attempt.state === "never_started") continue;
      const cleaned = await this.settle(
        input.signal,
        snapshot.consumedAttempts,
        () =>
          this.runtimes.cleanup({
            signal: input.signal,
            organizationId: input.organizationId,
            sessionId: input.sessionId,
            deletionOperationRunId: input.operationRunId,
            deletionAttemptToken: input.attemptToken,
            runtimeType: attempt.runtimeType,
            executionId: attempt.executionId,
            attemptId: attempt.attemptId,
            startIntentId: attempt.startIntentId,
            handle: attempt.handle,
          }),
      );
      if (cleaned.kind === "retryable") return cleaned;
      if (cleaned.value.state === "unknown") {
        return retry("RUNTIME_CLEANUP_UNKNOWN", snapshot.consumedAttempts);
      }
    }

    const confirmed = await this.settle(
      input.signal,
      snapshot.consumedAttempts,
      () =>
        this.artifacts.confirmFenced({
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          operationRunIds: snapshot.operationRunIds,
        }),
    );
    if (confirmed.kind === "retryable") return confirmed;
    if (confirmed.value.state !== "fenced") {
      return retry("ARTIFACT_WRITER_NOT_FENCED", snapshot.consumedAttempts);
    }

    for (const artifact of snapshot.artifacts) {
      const terminalized = await this.settle(
        input.signal,
        snapshot.consumedAttempts,
        () =>
          this.transaction.terminalizeOwnedRun({
            ...input,
            ownedOperationRunId: artifact.materializationOperationRunId,
          }),
      );
      if (terminalized.kind === "retryable") return terminalized;
      const key = deriveAgentSessionArtifactKey({
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        artifactId: artifact.artifactId,
      });
      const erased = await this.settle(
        input.signal,
        snapshot.consumedAttempts,
        () =>
          artifact.lifecycle === "active"
            ? this.storage.deleteActiveAndConfirm({ key, signal: input.signal })
            : this.storage.abortEraseAndConfirm({
                key,
                uploadId: artifact.providerUploadId,
                signal: input.signal,
              }),
      );
      if (erased.kind === "retryable") return erased;
      if (erased.value.state !== "erased") {
        return retry(
          erased.value.state === "present"
            ? "STORAGE_DELETE_PRESENT"
            : "STORAGE_DELETE_UNKNOWN",
          snapshot.consumedAttempts,
        );
      }
    }
    const finalization = await input.enterEphemeralFinalization();
    const finalizationInput = { ...input, signal: finalization.signal };
    try {
      finalization.signal.throwIfAborted();
      await this.transaction.deleteGraphAndCheckpoint({
        ...finalizationInput,
        fencedClosureDigest: snapshot.closureDigest,
      });
      return { kind: "completed" };
    } catch (error) {
      if (finalization.signal.aborted) throw finalization.signal.reason;
      return this.reconcileGraphCommit(
        finalizationInput,
        snapshot.closureDigest,
        snapshot.consumedAttempts,
        error,
      );
    }
  }

  private async reconcileGraphCommit(
    input: ScopedDeletionAttempt,
    fencedClosureDigest: string,
    consumedAttempts: number,
    commitError: unknown,
  ): Promise<AgentSessionDeletionExecutionResult> {
    let delayMs = 25;
    while (true) {
      input.signal.throwIfAborted();
      try {
        const committed = await this.transaction.hasGraphDeletedCheckpoint({
          ...input,
          fencedClosureDigest,
        });
        if (input.signal.aborted) throw input.signal.reason;
        return committed
          ? { kind: "completed" }
          : retry(classifyDeletionFailure(commitError), consumedAttempts);
      } catch (error) {
        if (input.signal.aborted) throw input.signal.reason;
        await abortableDelay(delayMs, input.signal);
        delayMs = Math.min(delayMs * 2, 1_000);
      }
    }
  }

  private async settle<T>(
    signal: AbortSignal,
    consumedAttempts: number,
    action: () => Promise<T>,
  ): Promise<SettledDeletionAction<T>> {
    try {
      signal.throwIfAborted();
      const value = await action();
      if (signal.aborted) throw signal.reason;
      return { kind: "value", value };
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      return retry(classifyDeletionFailure(error), consumedAttempts);
    }
  }
}

type RetryableDeletionResult = Extract<
  AgentSessionDeletionExecutionResult,
  { kind: "retryable" }
>;

type SettledDeletionAction<T> =
  { kind: "value"; value: T } | RetryableDeletionResult;

export function classifyDeletionFailure(
  error: unknown,
): AgentSessionDeletionFailureCode {
  const candidate = errorCode(error);
  return AGENT_SESSION_DELETION_FAILURE_CODES.includes(
    candidate as AgentSessionDeletionFailureCode,
  )
    ? (candidate as AgentSessionDeletionFailureCode)
    : "SESSION_DELETION_INVARIANT";
}

function retry(
  code: AgentSessionDeletionFailureCode,
  consumedAttempts: number,
): Extract<AgentSessionDeletionExecutionResult, { kind: "retryable" }> {
  return { kind: "retryable", code, consumedAttempts };
}

function errorCode(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  if (typeof error !== "object" || error === null || !("code" in error))
    return null;
  const code = error.code;
  return typeof code === "string" ? code : null;
}

function abortableDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export { AGENT_SESSION_DELETION_EXECUTION_PORT };
