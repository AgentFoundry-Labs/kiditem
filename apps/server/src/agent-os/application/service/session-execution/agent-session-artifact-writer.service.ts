import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  AGENT_SESSION_ARTIFACT_WRITER_PORT,
  type AgentSessionArtifactMaterializationInput,
  type AgentSessionArtifactWriterPort,
} from '../../port/in/session-execution/agent-session-artifact-writer.port';
import {
  AGENT_SESSION_ARTIFACT_STORAGE_PORT,
  type AgentSessionArtifactStoragePort,
} from '../../port/out/storage/agent-session-artifact-storage.port';
import {
  AGENT_SESSION_ARTIFACT_MATERIALIZATION_TRANSACTION,
  type AgentSessionArtifactMaterializationTransactionPort,
} from '../../port/out/transaction/session-control/agent-session-artifact-materialization.transaction.port';
import { MAX_AGENT_SESSION_ARTIFACT_BYTES } from '../../port/out/runtime/agent-durable-runtime.port';
import { deriveAgentSessionArtifactKey } from '../../../domain/session/agent-session-artifact-key';

export const MAX_ACTIVE_AGENT_SESSION_ARTIFACT_PUTS = 128;

interface ActivePut {
  organizationId: string;
  sessionId: string;
  operationRunId: string;
  controller: AbortController;
  promise: Promise<void>;
}

@Injectable()
export class AgentSessionArtifactWriterService
  implements AgentSessionArtifactWriterPort
{
  private readonly activePuts = new Map<string, ActivePut>();

  constructor(
    @Inject(AGENT_SESSION_ARTIFACT_MATERIALIZATION_TRANSACTION)
    private readonly transactions: AgentSessionArtifactMaterializationTransactionPort,
    @Inject(AGENT_SESSION_ARTIFACT_STORAGE_PORT)
    private readonly storage: AgentSessionArtifactStoragePort,
  ) {}

  async materialize(input: AgentSessionArtifactMaterializationInput) {
    input.signal.throwIfAborted();
    if (input.bytes.byteLength > MAX_AGENT_SESSION_ARTIFACT_BYTES) {
      throw new Error('AGENT_SESSION_ARTIFACT_TOO_LARGE');
    }
    if (createHash('sha256').update(input.bytes).digest('hex') !== input.sha256) {
      throw new Error('AGENT_SESSION_ARTIFACT_SHA256_MISMATCH');
    }
    if (this.activePuts.size >= MAX_ACTIVE_AGENT_SESSION_ARTIFACT_PUTS) {
      throw new Error('AGENT_SESSION_ARTIFACT_PUT_CAPACITY_EXCEEDED');
    }
    const prepared = await this.transactions.prepare(input);
    const key = deriveAgentSessionArtifactKey({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      artifactId: prepared.artifactId,
    });
    if (prepared.lifecycle === 'active') return artifactEvent(input, prepared.artifactId);
    const controller = new AbortController();
    const abort = () => controller.abort(input.signal.reason);
    input.signal.addEventListener('abort', abort, { once: true });
    const activeKey = putKey(input, prepared.artifactId);
    const existing = this.activePuts.get(activeKey);
    if (existing) {
      input.signal.removeEventListener('abort', abort);
      await existing.promise;
      return artifactEvent(input, prepared.artifactId);
    }
    let resolvePending!: () => void;
    let rejectPending!: (reason: unknown) => void;
    const pending = new Promise<void>((resolve, reject) => {
      resolvePending = resolve;
      rejectPending = reject;
    });
    this.activePuts.set(activeKey, {
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      operationRunId: input.operationRunId,
      controller,
      promise: pending,
    });

    void this.put({ input, artifactId: prepared.artifactId, key, controller })
      .then(resolvePending, rejectPending)
      .finally(() => {
        input.signal.removeEventListener('abort', abort);
        this.activePuts.delete(activeKey);
      });
    await pending;
    return artifactEvent(input, prepared.artifactId);
  }

  async beginFence(input: {
    organizationId: string;
    sessionId: string;
    operationRunIds: readonly string[];
  }): Promise<void> {
    const operationRunIds = new Set(input.operationRunIds);
    for (const put of this.activePuts.values()) {
      if (
        put.organizationId === input.organizationId &&
        put.sessionId === input.sessionId &&
        operationRunIds.has(put.operationRunId)
      )
        put.controller.abort(new Error('agent_session_artifact_writer_fenced'));
    }
  }

  async confirmFenced(input: {
    organizationId: string;
    sessionId: string;
    operationRunIds: readonly string[];
  }) {
    const operationRunIds = new Set(input.operationRunIds);
    for (const put of this.activePuts.values()) {
      if (
        put.organizationId === input.organizationId &&
        put.sessionId === input.sessionId &&
        operationRunIds.has(put.operationRunId)
      )
        return { state: 'unknown' as const, code: 'ARTIFACT_WRITER_NOT_FENCED' as const };
    }
    return { state: 'fenced' as const };
  }

  private async put(input: {
    input: AgentSessionArtifactMaterializationInput;
    artifactId: string;
    key: string;
    controller: AbortController;
  }): Promise<void> {
    const signal = input.controller.signal;
    let uploadId: string | null = null;
    let uploadBound = false;
    try {
      const opened = await this.storage.openMultipart({
        key: input.key,
        mimeType: input.input.mimeType,
        signal,
      });
      uploadId = opened.uploadId;
      await this.transactions.bindUpload({
        organizationId: input.input.organizationId,
        sessionId: input.input.sessionId,
        artifactId: input.artifactId,
        operationRunId: input.input.operationRunId,
        attemptToken: input.input.attemptToken,
        uploadId,
      });
      uploadBound = true;
      await this.storage.uploadAndComplete({
        key: input.key,
        uploadId,
        bytes: input.input.bytes,
        signal,
      });
      await this.transactions.activate({
        organizationId: input.input.organizationId,
        sessionId: input.input.sessionId,
        taskId: input.input.taskId,
        executionId: input.input.executionId,
        artifactId: input.artifactId,
        operationRunId: input.input.operationRunId,
        attemptToken: input.input.attemptToken,
        sha256: input.input.sha256,
        metadata: input.input.metadata,
      });
    } catch (error) {
      if (uploadBound && uploadId !== null) {
        await this.storage.abortEraseAndConfirm({
          key: input.key,
          uploadId,
          signal: new AbortController().signal,
        });
      }
      throw error;
    }
  }
}

function putKey(
  input: AgentSessionArtifactMaterializationInput,
  artifactId: string,
): string {
  return `${input.organizationId}/${input.sessionId}/${input.operationRunId}/${artifactId}`;
}

function artifactEvent(
  input: AgentSessionArtifactMaterializationInput,
  artifactId: string,
) {
  return {
    kind: 'artifact' as const,
    artifactId,
    payload: {
      artifactType: input.artifactType,
      label: input.label,
      sha256: input.sha256,
      navigationActionId: input.navigationActionId,
    },
  };
}
