import { Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  AgentSessionControlRepositoryError,
  type AgentSessionControlRepositoryPort,
  type DelegatedTaskRecord,
  type ExecutionAttemptRecord,
  type SessionApprovalRecord,
  type SessionArtifactRecord,
} from '../../../application/port/out/repository/agent-session-control.repository.port';

const TERMINAL_STATES = new Set([
  'archived',
  'completed',
  'succeeded',
  'failed',
  'cancelled',
]);

@Injectable()
export class PrismaAgentSessionControlRepository
  implements AgentSessionControlRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async createDelegatedTask(
    input: Parameters<AgentSessionControlRepositoryPort['createDelegatedTask']>[0],
  ): Promise<DelegatedTaskRecord> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lock(tx, ['delegation', input.sessionId, input.parentTaskId, input.idempotencyKey]);
      const existing = await tx.agentSessionTaskDelegation.findFirst({
        where: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          parentTaskId: input.parentTaskId,
          idempotencyKey: input.idempotencyKey,
        },
        include: { childTask: { select: { objective: true } } },
      });
      if (existing) {
        if (
          existing.fromAgentVersionId !== input.fromAgentVersionId ||
          existing.toAgentVersionId !== input.toAgentVersionId ||
          existing.depth !== input.depth ||
          existing.childTask.objective !== input.objective ||
          !canonicalEqual(existing.authoritySubset, input.authoritySubset)
        ) {
          throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
        }
        return mapDelegation(existing);
      }

      const parent = await tx.agentSessionTask.findFirst({
        where: {
          id: input.parentTaskId,
          sessionId: input.sessionId,
          organizationId: input.organizationId,
        },
        include: { session: { select: { lifecycle: true, authorityProfileVersionId: true } } },
      });
      if (!parent || parent.session.lifecycle !== 'active') throw scope();
      if (parent.assignedAgentVersionId !== input.fromAgentVersionId) throw scope();
      if (TERMINAL_STATES.has(parent.status)) throw state();

      const child = await tx.agentSessionTask.create({
        data: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          parentTaskId: input.parentTaskId,
          assignedAgentVersionId: input.toAgentVersionId,
          objective: input.objective,
          isRoot: false,
          status: 'queued',
          idempotencyKey: `delegated:${input.idempotencyKey}`,
        },
      });
      const created = await tx.agentSessionTaskDelegation.create({
        data: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          parentTaskId: input.parentTaskId,
          childTaskId: child.id,
          fromAgentVersionId: input.fromAgentVersionId,
          toAgentVersionId: input.toAgentVersionId,
          authorityProfileVersionId: parent.session.authorityProfileVersionId,
          authoritySubset: input.authoritySubset,
          depth: input.depth,
          idempotencyKey: input.idempotencyKey,
          state: 'created',
        },
      });
      return mapDelegation(created);
    }).catch(rethrowStable);
  }

  async startAttempt(
    input: Parameters<AgentSessionControlRepositoryPort['startAttempt']>[0],
  ): Promise<ExecutionAttemptRecord> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lock(tx, ['attempt', input.executionId]);
      const execution = await tx.agentExecution.findFirst({
        where: {
          id: input.executionId,
          sessionId: input.sessionId,
          organizationId: input.organizationId,
        },
        select: { id: true },
      });
      if (!execution) throw scope();
      const existing = await tx.agentExecutionAttempt.findFirst({
        where: { executionId: input.executionId, idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (
          existing.runtimeType !== input.runtimeType ||
          existing.externalRunId !== (input.externalRunId ?? null) ||
          existing.encryptedHandleRef !== (input.encryptedHandleRef ?? null)
        ) {
          throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
        }
        return mapAttempt(existing);
      }
      const latest = await tx.agentExecutionAttempt.aggregate({
        where: { executionId: input.executionId },
        _max: { attemptNumber: true },
      });
      return mapAttempt(await tx.agentExecutionAttempt.create({
        data: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          executionId: input.executionId,
          attemptNumber: (latest._max.attemptNumber ?? 0) + 1,
          idempotencyKey: input.idempotencyKey,
          runtimeType: input.runtimeType,
          externalRunId: input.externalRunId ?? null,
          encryptedHandleRef: input.encryptedHandleRef ?? null,
          state: 'running',
        },
      }));
    }).catch(rethrowStable);
  }

  async finishAttempt(
    input: Parameters<AgentSessionControlRepositoryPort['finishAttempt']>[0],
  ): Promise<ExecutionAttemptRecord> {
    const current = await this.prisma.agentExecutionAttempt.findFirst({
      where: {
        id: input.attemptId,
        executionId: input.executionId,
        sessionId: input.sessionId,
        organizationId: input.organizationId,
      },
    });
    if (!current) throw scope();
    if (current.state === input.state) return mapAttempt(current);
    if (current.state !== input.expectedState || TERMINAL_STATES.has(current.state)) throw state();
    const result = await this.prisma.agentExecutionAttempt.updateMany({
      where: { id: input.attemptId, state: input.expectedState },
      data: {
        state: input.state,
        finishedAt: new Date(),
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
      },
    });
    if (result.count !== 1) throw state();
    return mapAttempt((await this.prisma.agentExecutionAttempt.findFirst({
      where: { id: input.attemptId, organizationId: input.organizationId },
    }))!);
  }

  async requestApproval(
    input: Parameters<AgentSessionControlRepositoryPort['requestApproval']>[0],
  ): Promise<SessionApprovalRecord> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lock(tx, ['approval', input.executionId, input.idempotencyKey]);
      const attempt = await tx.agentExecutionAttempt.findFirst({
        where: {
          id: input.attemptId,
          executionId: input.executionId,
          sessionId: input.sessionId,
          organizationId: input.organizationId,
          execution: { sessionTaskId: input.taskId },
        },
      });
      if (!attempt) throw scope();
      const existing = await tx.agentSessionApproval.findFirst({
        where: { executionId: input.executionId, idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (
          existing.organizationId !== input.organizationId ||
          existing.sessionId !== input.sessionId ||
          existing.taskId !== input.taskId ||
          existing.attemptId !== input.attemptId ||
          existing.capabilityKey !== input.capabilityKey ||
          existing.argumentsHash !== input.argumentsHash ||
          !canonicalEqual(existing.resourceSnapshot, input.resourceSnapshot) ||
          existing.expiresAt.getTime() !== input.expiresAt.getTime()
        ) throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
        return mapApproval(existing);
      }
      if (attempt.state !== 'running') throw state();
      return mapApproval(await tx.agentSessionApproval.create({
        data: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          taskId: input.taskId,
          executionId: input.executionId,
          attemptId: input.attemptId,
          capabilityKey: input.capabilityKey,
          argumentsHash: input.argumentsHash,
          resourceSnapshot: input.resourceSnapshot as Prisma.InputJsonValue,
          state: 'pending',
          expiresAt: input.expiresAt,
          idempotencyKey: input.idempotencyKey,
        },
      }));
    }).catch(rethrowStable);
  }

  async decideApproval(
    input: Parameters<AgentSessionControlRepositoryPort['decideApproval']>[0],
  ): Promise<SessionApprovalRecord> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lock(tx, ['approval-decision', input.organizationId, input.idempotencyKey]);
      const idempotent = await tx.agentSessionApproval.findFirst({
        where: {
          organizationId: input.organizationId,
          decisionIdempotencyKey: input.idempotencyKey,
        },
      });
      if (idempotent) {
        if (
          idempotent.id !== input.approvalId ||
          idempotent.sessionId !== input.sessionId ||
          idempotent.state !== input.decision ||
          idempotent.decidedByActorType !== input.actorType ||
          idempotent.decidedByActorId !== input.actorId
        ) throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
        return mapApproval(idempotent);
      }
      const approval = await tx.agentSessionApproval.findFirst({
        where: {
          id: input.approvalId,
          sessionId: input.sessionId,
          organizationId: input.organizationId,
        },
      });
      if (!approval) throw scope();
      if (approval.state !== input.expectedState || approval.expiresAt <= new Date()) throw state();
      return mapApproval(await tx.agentSessionApproval.update({
        where: { id: approval.id },
        data: {
          state: input.decision,
          decisionIdempotencyKey: input.idempotencyKey,
          decidedByActorType: input.actorType,
          decidedByActorId: input.actorId,
          decidedAt: new Date(),
        },
      }));
    }).catch(rethrowStable);
  }

  async appendArtifact(
    input: Parameters<AgentSessionControlRepositoryPort['appendArtifact']>[0],
  ): Promise<SessionArtifactRecord> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lock(tx, ['artifact', input.executionId, input.idempotencyKey]);
      const execution = await tx.agentExecution.findFirst({
        where: {
          id: input.executionId,
          sessionId: input.sessionId,
          sessionTaskId: input.taskId,
          organizationId: input.organizationId,
        },
      });
      if (!execution) throw scope();
      const existing = await tx.agentSessionArtifact.findFirst({
        where: { executionId: input.executionId, idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (
          existing.organizationId !== input.organizationId ||
          existing.sessionId !== input.sessionId ||
          existing.taskId !== input.taskId ||
          existing.artifactType !== input.artifactType ||
          existing.storageReference !== input.storageReference ||
          existing.sha256 !== input.sha256 ||
          !canonicalEqual(existing.metadata, input.metadata)
        ) throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
        return mapArtifact(existing);
      }
      return mapArtifact(await tx.agentSessionArtifact.create({
        data: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          taskId: input.taskId,
          executionId: input.executionId,
          artifactType: input.artifactType,
          storageReference: input.storageReference,
          sha256: input.sha256,
          metadata: input.metadata as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        },
      }));
    }).catch(rethrowStable);
  }

  async transitionTask(
    input: Parameters<AgentSessionControlRepositoryPort['transitionTask']>[0],
  ): Promise<{ id: string; status: string }> {
    if (TERMINAL_STATES.has(input.expectedState) && input.expectedState !== input.state) throw state();
    const result = await this.prisma.agentSessionTask.updateMany({
      where: {
        id: input.taskId,
        sessionId: input.sessionId,
        organizationId: input.organizationId,
        status: input.expectedState,
      },
      data: {
        status: input.state,
        finishedAt: TERMINAL_STATES.has(input.state) ? new Date() : null,
      },
    });
    if (result.count !== 1) await this.throwScopeOrStateForTask(input);
    return (await this.findTask(input))!;
  }

  async transitionSession(
    input: Parameters<AgentSessionControlRepositoryPort['transitionSession']>[0],
  ): Promise<{ id: string; lifecycle: string }> {
    if (TERMINAL_STATES.has(input.expectedState) && input.expectedState !== input.state) throw state();
    const terminalAt = TERMINAL_STATES.has(input.state) ? new Date() : null;
    const result = await this.prisma.agentSession.updateMany({
      where: {
        id: input.sessionId,
        organizationId: input.organizationId,
        lifecycle: input.expectedState,
      },
      data: {
        lifecycle: input.state,
        completedAt: input.state === 'completed' ? terminalAt : undefined,
        cancelledAt: input.state === 'cancelled' ? terminalAt : undefined,
        archivedAt: input.state === 'archived' ? terminalAt : undefined,
      },
    });
    if (result.count !== 1) {
      if (!(await this.findSession(input))) throw scope();
      throw state();
    }
    return (await this.findSession(input))!;
  }

  findTask(input: { organizationId: string; sessionId: string; taskId: string }) {
    return this.prisma.agentSessionTask.findFirst({
      where: { id: input.taskId, sessionId: input.sessionId, organizationId: input.organizationId },
      select: { id: true, status: true },
    });
  }

  findSession(input: { organizationId: string; sessionId: string }) {
    return this.prisma.agentSession.findFirst({
      where: { id: input.sessionId, organizationId: input.organizationId },
      select: { id: true, lifecycle: true },
    });
  }

  private async throwScopeOrStateForTask(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
  }): Promise<never> {
    if (!(await this.findTask(input))) throw scope();
    throw state();
  }
}

function mapDelegation(row: { id: string; childTaskId: string; state: string }): DelegatedTaskRecord {
  return { delegationId: row.id, childTaskId: row.childTaskId, state: row.state };
}
function mapAttempt(row: { id: string; executionId: string; attemptNumber: number; runtimeType: string; state: string }): ExecutionAttemptRecord {
  return { id: row.id, executionId: row.executionId, attemptNumber: row.attemptNumber, runtimeType: row.runtimeType, state: row.state };
}
function mapApproval(row: { id: string; state: string; decisionIdempotencyKey: string | null }): SessionApprovalRecord {
  return { id: row.id, state: row.state, decisionIdempotencyKey: row.decisionIdempotencyKey };
}
function mapArtifact(row: { id: string; sha256: string; lifecycle: string }): SessionArtifactRecord {
  return { id: row.id, sha256: row.sha256, lifecycle: row.lifecycle };
}

async function lock(tx: Prisma.TransactionClient, parts: string[]): Promise<void> {
  const key = parts.join(':');
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(',')}}`;
  }
  throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
}
function scope(): AgentSessionControlRepositoryError {
  return conflict('AGENT_SESSION_CONTROL_SCOPE_INVALID');
}
function state(): AgentSessionControlRepositoryError {
  return conflict('AGENT_SESSION_CONTROL_STATE_CONFLICT');
}
function conflict(code: AgentSessionControlRepositoryError['code']): AgentSessionControlRepositoryError {
  return new AgentSessionControlRepositoryError(code, code);
}
function rethrowStable(error: unknown): never {
  if (error instanceof AgentSessionControlRepositoryError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
    if (error.code === 'P2003') throw scope();
  }
  throw error;
}
