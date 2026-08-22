import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OperationStatusSchema, type OperationStatus } from '@kiditem/shared/operations';
import { PrismaService } from '../../../../../prisma/prisma.service';
import type {
  AgentSessionDeletionExecutionSnapshot,
  AgentSessionDeletionFailureCode,
  AgentSessionDeletionExecutionTransactionPort,
  AgentSessionDeletionSnapshotResult,
  OwnedOperationCleanupCoordinate,
  RuntimeCleanupCoordinate,
  ScopedDeletionAttempt,
} from '../../../../application/port/out/transaction/session-deletion/agent-session-deletion-execution.transaction.port';

const MAX_OPERATION_CLOSURE_SIZE = 1_024;
const TERMINAL_OPERATION_STATUSES = new Set<OperationStatus>([
  'succeeded',
  'failed',
  'cancelled',
]);

/**
 * Owns the short, fenced database portion of session deletion. It deliberately
 * returns before any provider cancellation or storage deletion is attempted.
 */
@Injectable()
export class PrismaAgentSessionDeletionExecutionTransaction
  implements AgentSessionDeletionExecutionTransactionPort
{
  constructor(private readonly prisma: PrismaService) {}

  async loadFencedSnapshot(
    input: ScopedDeletionAttempt,
  ): Promise<AgentSessionDeletionSnapshotResult> {
    input.signal.throwIfAborted();
    return this.prisma.$transaction((tx) => this.readFencedSnapshot(tx, input));
  }

  private async readFencedSnapshot(
    tx: Prisma.TransactionClient,
    input: ScopedDeletionAttempt,
  ): Promise<AgentSessionDeletionSnapshotResult> {
      await lockDeletionScope(tx, input);
      const persistedDeletionRun = await tx.operationRun.findUnique({
        where: { id_organizationId: { id: input.operationRunId, organizationId: input.organizationId } },
        select: { attempts: true },
      });
      let consumedAttempts = persistedDeletionRun?.attempts ?? 0;
      const fail = (code: 'SESSION_DELETION_INVARIANT' | 'SESSION_OPERATION_OWNERSHIP_INVALID') => ({
        kind: 'retryable' as const,
        code,
        consumedAttempts,
      });

      const session = await lockedDeletionSession(tx, input);
      if (
        !session ||
        session.lifecycle !== 'deleting' ||
        session.deletionOperationRunId !== input.operationRunId
      ) return fail('SESSION_OPERATION_OWNERSHIP_INVALID');

      const deletion = await tx.agentSessionDeletionOperationBinding.findUnique({
        where: {
          operationRunId_organizationId: {
            operationRunId: input.operationRunId,
            organizationId: input.organizationId,
          },
        },
        select: {
          sessionId: true,
          retryGeneration: true,
          operationRun: { select: { attemptToken: true, attempts: true } },
        },
      });
      if (
        !deletion ||
        deletion.sessionId !== input.sessionId ||
        deletion.operationRun.attemptToken !== input.attemptToken
      ) return fail('SESSION_OPERATION_OWNERSHIP_INVALID');
      const retryGenerationBindings = await tx.agentSessionDeletionOperationBinding.findMany({
        where: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          retryGeneration: deletion.retryGeneration,
        },
        select: { operationRun: { select: { attempts: true } } },
      });
      consumedAttempts = retryGenerationBindings.reduce(
        (total, binding) => total + binding.operationRun.attempts,
        0,
      );

      const sessionOwnership = await tx.agentSessionOperationRunOwnership.findMany({
        where: { organizationId: input.organizationId, sessionId: input.sessionId },
        select: { operationRunId: true },
        orderBy: { operationRunId: 'asc' },
      });
      const sessionBindings = await tx.agentExecutionAttemptOperationBinding.findMany({
        where: { organizationId: input.organizationId, sessionId: input.sessionId },
        select: {
          executionAttemptId: true,
          executionId: true,
          sessionId: true,
          operationRunId: true,
          predecessorOperationRunId: true,
          attempt: {
            select: { id: true, organizationId: true, sessionId: true, executionId: true },
          },
        },
        orderBy: { id: 'asc' },
      });
      if (sessionBindings.some((binding) => !matchesSessionAttempt(binding, input))) {
        return fail('SESSION_OPERATION_OWNERSHIP_INVALID');
      }

      const closureIds = new Set<string>();
      for (const ownership of sessionOwnership) closureIds.add(ownership.operationRunId);
      for (const binding of sessionBindings) {
        closureIds.add(binding.operationRunId);
        if (binding.predecessorOperationRunId) closureIds.add(binding.predecessorOperationRunId);
      }
      if (!(await expandOperationClosure(tx, input.organizationId, closureIds))) {
        return fail('SESSION_OPERATION_OWNERSHIP_INVALID');
      }

      const closureRunIds = [...closureIds].sort();
      const operationRuns = closureRunIds.length === 0
        ? []
        : await tx.operationRun.findMany({
            where: { organizationId: input.organizationId, id: { in: closureRunIds } },
            select: {
              id: true,
              operationKey: true,
              status: true,
              attemptToken: true,
              nativeRunType: true,
              nativeRunId: true,
              scheduleId: true,
              agentSessionOperationRunOwnership: {
                select: { sessionId: true, organizationId: true },
              },
            },
            orderBy: { id: 'asc' },
          });
      if (
        operationRuns.length !== closureRunIds.length ||
        operationRuns.some((run) =>
          run.scheduleId !== null ||
          run.agentSessionOperationRunOwnership?.sessionId !== input.sessionId ||
          run.agentSessionOperationRunOwnership?.organizationId !== input.organizationId,
        )
      ) return fail('SESSION_OPERATION_OWNERSHIP_INVALID');

      const closureBindings = closureRunIds.length === 0
        ? []
        : await tx.agentExecutionAttemptOperationBinding.findMany({
            where: {
              organizationId: input.organizationId,
              OR: [
                { operationRunId: { in: closureRunIds } },
                { predecessorOperationRunId: { in: closureRunIds } },
              ],
            },
            select: {
              executionAttemptId: true,
              executionId: true,
              sessionId: true,
              operationRunId: true,
              predecessorOperationRunId: true,
              attempt: {
                select: { id: true, organizationId: true, sessionId: true, executionId: true },
              },
            },
            orderBy: { id: 'asc' },
          });
      if (closureBindings.some((binding) => !matchesSessionAttempt(binding, input))) {
        return fail('SESSION_OPERATION_OWNERSHIP_INVALID');
      }

      const attempts = await tx.agentExecutionAttempt.findMany({
        where: { organizationId: input.organizationId, sessionId: input.sessionId },
        select: {
          id: true,
          executionId: true,
          runtimeType: true,
          runtimeStartIntentId: true,
          externalRunId: true,
          encryptedHandleRef: true,
          runtimeGeneration: true,
        },
        orderBy: { id: 'asc' },
      });
      const checkpointRunIds = closureRunIds.length === 0
        ? []
        : await tx.operationRunCheckpoint.findMany({
            where: {
              organizationId: input.organizationId,
              operationRunId: { in: closureRunIds },
              kind: 'runtime_starting',
            },
            select: { operationRunId: true },
            orderBy: { operationRunId: 'asc' },
          });
      const checkpointRuns = new Set(checkpointRunIds.map((checkpoint) => checkpoint.operationRunId));
      const checkpointedAttemptIds = new Set(
        closureBindings
          .filter((binding) => checkpointRuns.has(binding.operationRunId))
          .map((binding) => binding.executionAttemptId),
      );
      const runtimeAttempts: RuntimeCleanupCoordinate[] = [];
      for (const attempt of attempts) {
        const hasHandleEvidence = attempt.externalRunId !== null || attempt.encryptedHandleRef !== null;
        const hasStartEvidence = attempt.runtimeStartIntentId !== null || hasHandleEvidence || checkpointedAttemptIds.has(attempt.id);
        if (!hasStartEvidence) {
          runtimeAttempts.push({
            executionId: attempt.executionId,
            attemptId: attempt.id,
            runtimeType: attempt.runtimeType,
            state: 'never_started',
          });
          continue;
        }
        if (!attempt.runtimeStartIntentId) return fail('SESSION_DELETION_INVARIANT');
        runtimeAttempts.push({
          executionId: attempt.executionId,
          attemptId: attempt.id,
          runtimeType: attempt.runtimeType,
          state: 'started',
          startIntentId: attempt.runtimeStartIntentId,
          handle: attempt.externalRunId !== null && attempt.encryptedHandleRef !== null
            ? {
                runtimeType: attempt.runtimeType,
                executionId: attempt.executionId,
                attemptId: attempt.id,
                externalRunId: attempt.externalRunId,
                encryptedHandleRef: attempt.encryptedHandleRef,
                generation: attempt.runtimeGeneration,
              }
            : null,
        });
      }

      const artifacts = await tx.agentSessionArtifact.findMany({
        where: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
        },
        select: {
          id: true,
          lifecycle: true,
          materializationOperationRunId: true,
          materialization: {
            select: {
              sessionId: true,
              materializationOperationRunId: true,
              providerUploadId: true,
            },
          },
        },
        orderBy: { id: 'asc' },
      });
      if (artifacts.some((artifact) =>
        !closureIds.has(artifact.materializationOperationRunId) ||
        !validMaterializationCoordinate(artifact, input.sessionId),
      )) return fail('SESSION_OPERATION_OWNERSHIP_INVALID');

      const operationCoordinates: OwnedOperationCleanupCoordinate[] = operationRuns.map((run) => ({
        runId: run.id,
        operationKey: run.operationKey,
        status: operationStatus(run.status),
        expectedAttemptToken: run.attemptToken,
        nativeRunType: run.nativeRunType,
        nativeRunId: run.nativeRunId,
      }));
      const snapshot: AgentSessionDeletionExecutionSnapshot = {
        retryGeneration: deletion.retryGeneration,
        consumedAttempts,
        runtimeAttempts,
        operationRuns: operationCoordinates,
        operationRunIds: operationCoordinates.map((run) => run.runId),
        artifacts: artifacts.map((artifact) => ({
          artifactId: artifact.id,
          materializationOperationRunId: artifact.materializationOperationRunId,
          providerUploadId: artifact.materialization?.providerUploadId ?? null,
        })),
        closureDigest: closureDigest({
          deletionOperationRunId: input.operationRunId,
          operationRuns: operationCoordinates.map((run) => ({
            runId: run.runId,
            operationKey: run.operationKey,
            status: run.status,
          })),
          runtimeAttempts: runtimeAttempts.map((attempt) => ({
            executionId: attempt.executionId,
            attemptId: attempt.attemptId,
            runtimeType: attempt.runtimeType,
            state: attempt.state,
          })),
          artifacts: artifacts.map((artifact) => ({
            artifactId: artifact.id,
            materializationOperationRunId: artifact.materializationOperationRunId,
          })),
        }),
      };
      return { kind: 'ready' as const, snapshot };
  }

  async terminalizeOwnedRun(
    input: ScopedDeletionAttempt & { ownedOperationRunId: string },
  ): Promise<void> {
    input.signal.throwIfAborted();
    await this.prisma.$transaction(async (tx) => {
      await lockDeletionScope(tx, input);
      const session = await lockedDeletionSession(tx, input);
      const deletion = await tx.agentSessionDeletionOperationBinding.findUnique({
        where: {
          operationRunId_organizationId: {
            operationRunId: input.operationRunId,
            organizationId: input.organizationId,
          },
        },
        select: { sessionId: true, operationRun: { select: { attemptToken: true } } },
      });
      if (
        !session ||
        session.lifecycle !== 'deleting' ||
        session.deletionOperationRunId !== input.operationRunId ||
        !deletion ||
        deletion.sessionId !== input.sessionId ||
        deletion.operationRun.attemptToken !== input.attemptToken
      ) throw ownershipInvalid();

      const [ownership, artifact, operationRun] = await Promise.all([
        tx.agentSessionOperationRunOwnership.findUnique({
          where: {
            operationRunId_organizationId: {
              operationRunId: input.ownedOperationRunId,
              organizationId: input.organizationId,
            },
          },
          select: { sessionId: true },
        }),
        tx.agentSessionArtifact.findFirst({
          where: {
            organizationId: input.organizationId,
            sessionId: input.sessionId,
            materializationOperationRunId: input.ownedOperationRunId,
          },
          select: { id: true },
        }),
        tx.operationRun.findUnique({
          where: {
            id_organizationId: {
              id: input.ownedOperationRunId,
              organizationId: input.organizationId,
            },
          },
          select: { id: true, status: true },
        }),
      ]);
      if (!ownership || ownership.sessionId !== input.sessionId || !artifact || !operationRun) {
        throw ownershipInvalid();
      }
      if (TERMINAL_OPERATION_STATUSES.has(operationStatus(operationRun.status))) return;
      await tx.operationRun.update({
        where: { id: operationRun.id },
        data: {
          status: 'cancelled',
          finishedAt: new Date(),
          errorCode: 'agent_session_deleting',
        },
      });
    });
  }

  async deleteGraphAndCheckpoint(
    input: ScopedDeletionAttempt & { fencedClosureDigest: string },
  ): Promise<void> {
    input.signal.throwIfAborted();
    await this.prisma.$transaction(async (tx) => {
      const loaded = await this.readFencedSnapshot(tx, input);
      if (loaded.kind !== 'ready' || loaded.snapshot.closureDigest !== input.fencedClosureDigest) {
        throw new Error(
          loaded.kind === 'retryable' ? loaded.code : 'SESSION_GRAPH_CHANGED',
        );
      }
      if (loaded.snapshot.operationRuns.some((run) => !TERMINAL_OPERATION_STATUSES.has(run.status))) {
        throw new Error('SESSION_GRAPH_CHANGED');
      }

      const nextSequence = await tx.operationRunCheckpoint.aggregate({
        where: {
          organizationId: input.organizationId,
          operationRunId: input.operationRunId,
        },
        _max: { sequence: true },
      });
      await tx.operationRunCheckpoint.create({
        data: {
          organizationId: input.organizationId,
          operationRunId: input.operationRunId,
          sequence: (nextSequence._max.sequence ?? BigInt(0)) + BigInt(1),
          kind: 'graph_deleted',
          state: {
            sessionId: input.sessionId,
            retryGeneration: loaded.snapshot.retryGeneration,
            closureDigest: input.fencedClosureDigest,
          },
        },
      });
      await deleteSessionGraph(tx, input, loaded.snapshot.operationRunIds);
    });
  }

  async hasGraphDeletedCheckpoint(
    input: ScopedDeletionAttempt & { fencedClosureDigest: string },
  ): Promise<boolean> {
    input.signal.throwIfAborted();
    return this.prisma.$transaction(async (tx) => {
      await lockDeletionScope(tx, input);
      const binding = await tx.agentSessionDeletionOperationBinding.findUnique({
        where: {
          operationRunId_organizationId: {
            operationRunId: input.operationRunId,
            organizationId: input.organizationId,
          },
        },
        select: {
          sessionId: true,
          retryGeneration: true,
          operationRun: { select: { attemptToken: true } },
        },
      });
      if (
        !binding ||
        binding.sessionId !== input.sessionId ||
        binding.operationRun.attemptToken !== input.attemptToken
      ) throw ownershipInvalid();
      const checkpoint = await tx.operationRunCheckpoint.findFirst({
        where: {
          organizationId: input.organizationId,
          operationRunId: input.operationRunId,
          kind: 'graph_deleted',
        },
        select: { state: true },
        orderBy: { sequence: 'desc' },
      });
      return matchesGraphDeletedCheckpoint(checkpoint?.state, {
        sessionId: input.sessionId,
        retryGeneration: binding.retryGeneration,
        closureDigest: input.fencedClosureDigest,
      });
    });
  }

  async markDeleteFailed(
    input: ScopedDeletionAttempt & { failureCode: AgentSessionDeletionFailureCode },
  ): Promise<void> {
    input.signal.throwIfAborted();
    await this.prisma.$transaction(async (tx) => {
      await lockDeletionScope(tx, input);
      const session = await lockedDeletionSession(tx, input);
      const binding = await tx.agentSessionDeletionOperationBinding.findUnique({
        where: {
          operationRunId_organizationId: {
            operationRunId: input.operationRunId,
            organizationId: input.organizationId,
          },
        },
        select: { sessionId: true, operationRun: { select: { attemptToken: true } } },
      });
      if (
        !session ||
        session.lifecycle !== 'deleting' ||
        session.deletionOperationRunId !== input.operationRunId ||
        !binding ||
        binding.sessionId !== input.sessionId ||
        binding.operationRun.attemptToken !== input.attemptToken
      ) throw ownershipInvalid();
      const transitioned = await tx.operationRun.updateMany({
        where: {
          id: input.operationRunId,
          organizationId: input.organizationId,
          status: 'running',
          attemptToken: input.attemptToken,
        },
        data: {
          status: 'failed',
          errorCode: input.failureCode,
          errorMessage: null,
          finishedAt: new Date(),
          claimedBy: null,
          claimedAt: null,
          attemptToken: null,
          leaseExpiresAt: null,
        },
      });
      if (transitioned.count !== 1) throw ownershipInvalid();
      await tx.agentSession.update({
        where: { id: input.sessionId },
        data: {
          lifecycle: 'delete_failed',
          deletionFailureCode: input.failureCode,
        },
      });
    });
  }
}

async function lockDeletionScope(
  tx: Prisma.TransactionClient,
  input: Pick<ScopedDeletionAttempt, 'organizationId' | 'sessionId'>,
): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-session-lifecycle:${input.organizationId}:${input.sessionId}`}, 0))`,
  );
}

async function lockedDeletionSession(
  tx: Prisma.TransactionClient,
  input: Pick<ScopedDeletionAttempt, 'organizationId' | 'sessionId'>,
): Promise<{ id: string; lifecycle: string; deletionOperationRunId: string | null } | null> {
  const rows = await tx.$queryRaw<Array<{
    id: string;
    lifecycle: string;
    deletionOperationRunId: string | null;
  }>>(Prisma.sql`
    SELECT id, lifecycle, deletion_operation_run_id AS "deletionOperationRunId"
    FROM agent_sessions
    WHERE id = ${input.sessionId}::uuid AND organization_id = ${input.organizationId}::uuid
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

async function expandOperationClosure(
  tx: Prisma.TransactionClient,
  organizationId: string,
  closureIds: Set<string>,
): Promise<boolean> {
  let frontier = [...closureIds].sort();
  while (frontier.length > 0) {
    if (closureIds.size > MAX_OPERATION_CLOSURE_SIZE) return false;
    const related = await tx.operationRun.findMany({
      where: {
        organizationId,
        OR: [{ id: { in: frontier } }, { parentRunId: { in: frontier } }],
      },
      select: { id: true, parentRunId: true },
      orderBy: { id: 'asc' },
    });
    const next: string[] = [];
    for (const run of related) {
      for (const candidate of [run.id, run.parentRunId]) {
        if (candidate && !closureIds.has(candidate)) {
          closureIds.add(candidate);
          next.push(candidate);
        }
      }
    }
    frontier = next.sort();
  }
  return closureIds.size <= MAX_OPERATION_CLOSURE_SIZE;
}

function matchesSessionAttempt(
  binding: {
    executionAttemptId: string;
    executionId: string;
    sessionId: string;
    attempt: { id: string; organizationId: string; sessionId: string; executionId: string };
  },
  input: Pick<ScopedDeletionAttempt, 'organizationId' | 'sessionId'>,
): boolean {
  return binding.sessionId === input.sessionId &&
    binding.executionAttemptId === binding.attempt.id &&
    binding.executionId === binding.attempt.executionId &&
    binding.attempt.organizationId === input.organizationId &&
    binding.attempt.sessionId === input.sessionId;
}

function validMaterializationCoordinate(
  artifact: {
    lifecycle: string;
    materializationOperationRunId: string;
    materialization: {
      sessionId: string;
      materializationOperationRunId: string;
      providerUploadId: string | null;
    } | null;
  },
  sessionId: string,
): boolean {
  if (artifact.lifecycle === 'active') return artifact.materialization === null;
  return artifact.lifecycle === 'materializing' &&
    artifact.materialization?.sessionId === sessionId &&
    artifact.materialization.materializationOperationRunId === artifact.materializationOperationRunId;
}

function closureDigest(value: {
  deletionOperationRunId: string;
  operationRuns: Array<{ runId: string; operationKey: string; status: string }>;
  runtimeAttempts: Array<{
    executionId: string;
    attemptId: string;
    runtimeType: string;
    state: RuntimeCleanupCoordinate['state'];
  }>;
  artifacts: Array<{ artifactId: string; materializationOperationRunId: string }>;
}): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function operationStatus(status: string): OperationStatus {
  return OperationStatusSchema.parse(status);
}

function ownershipInvalid(): Error {
  return new Error('SESSION_OPERATION_OWNERSHIP_INVALID');
}

async function deleteSessionGraph(
  tx: Prisma.TransactionClient,
  input: Pick<ScopedDeletionAttempt, 'organizationId' | 'sessionId'>,
  closureRunIds: readonly string[],
): Promise<void> {
  const sessionScope = {
    organizationId: input.organizationId,
    sessionId: input.sessionId,
  };
  await tx.agentConversationOutbox.deleteMany({
    where: { organizationId: input.organizationId, event: { is: sessionScope } },
  });
  await tx.agentConversationEvent.deleteMany({ where: sessionScope });
  await tx.agentSessionApprovalContinuation.deleteMany({
    where: { organizationId: input.organizationId, approval: { is: sessionScope } },
  });
  await tx.agentSessionApproval.deleteMany({ where: sessionScope });
  await tx.agentSessionArtifactMaterialization.deleteMany({ where: sessionScope });
  await tx.agentSessionArtifact.deleteMany({ where: sessionScope });
  await tx.agentExecutionUsage.deleteMany({
    where: { organizationId: input.organizationId, execution: { is: sessionScope } },
  });
  await tx.agentExecutionAttemptOperationBinding.deleteMany({ where: sessionScope });
  await tx.agentSessionTaskDelegation.deleteMany({ where: sessionScope });
  await tx.agentSessionOperationRunOwnership.deleteMany({ where: sessionScope });

  if (closureRunIds.length > 0) {
    await tx.operationRunCheckpoint.deleteMany({
      where: { organizationId: input.organizationId, operationRunId: { in: [...closureRunIds] } },
    });
    const runs = await tx.operationRun.findMany({
      where: { organizationId: input.organizationId, id: { in: [...closureRunIds] } },
      select: { id: true, parentRunId: true },
    });
    if (runs.length !== closureRunIds.length) throw ownershipInvalid();
    for (const runId of childFirstRunOrder(runs)) {
      await tx.operationRun.delete({
        where: {
          id_organizationId: { id: runId, organizationId: input.organizationId },
        },
      });
    }
  }

  await tx.agentExecutionAttempt.deleteMany({ where: sessionScope });
  await tx.agentExecution.deleteMany({ where: sessionScope });
  await tx.agentPolicySnapshot.deleteMany({ where: sessionScope });
  await tx.agentContextEpoch.deleteMany({ where: sessionScope });

  const tasks = await tx.agentSessionTask.findMany({
    where: sessionScope,
    select: { id: true, parentTaskId: true },
  });
  for (const taskId of childFirstTaskOrder(tasks)) {
    await tx.agentSessionTask.delete({ where: { id: taskId } });
  }
  await tx.agentSession.delete({ where: { id: input.sessionId } });
}

function childFirstRunOrder(
  runs: readonly { id: string; parentRunId: string | null }[],
): readonly string[] {
  return childFirstOrder(runs, (row) => row.parentRunId);
}

function childFirstTaskOrder(
  tasks: readonly { id: string; parentTaskId: string | null }[],
): readonly string[] {
  return childFirstOrder(tasks, (row) => row.parentTaskId);
}

function childFirstOrder<T extends { id: string }>(
  rows: readonly T[],
  parentId: (row: T) => string | null,
): readonly string[] {
  const byParent = new Map<string | null, T[]>();
  for (const row of rows) {
    const key = parentId(row);
    const bucket = byParent.get(key) ?? [];
    bucket.push(row);
    byParent.set(key, bucket);
  }
  for (const bucket of byParent.values()) bucket.sort((left, right) => left.id.localeCompare(right.id));
  const ordered: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (row: T) => {
    if (visited.has(row.id)) return;
    if (visiting.has(row.id)) throw ownershipInvalid();
    visiting.add(row.id);
    for (const child of byParent.get(row.id) ?? []) visit(child);
    visiting.delete(row.id);
    visited.add(row.id);
    ordered.push(row.id);
  };
  for (const row of [...rows].sort((left, right) => left.id.localeCompare(right.id))) visit(row);
  return ordered;
}

function matchesGraphDeletedCheckpoint(
  state: unknown,
  expected: { sessionId: string; retryGeneration: number; closureDigest: string },
): boolean {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  const candidate = state as Record<string, unknown>;
  return candidate.sessionId === expected.sessionId &&
    candidate.retryGeneration === expected.retryGeneration &&
    candidate.closureDigest === expected.closureDigest;
}
