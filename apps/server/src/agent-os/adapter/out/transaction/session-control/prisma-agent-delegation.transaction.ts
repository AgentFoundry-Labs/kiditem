import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CanonicalResourceRefSchema, UserMessageEventPayloadSchema } from '@kiditem/shared/agent-interaction';
import { z } from 'zod';
import { PrismaService } from '../../../../../prisma/prisma.service';
import {
  AgentSessionControlRepositoryError,
  type DelegatedTaskRecord,
  type DelegationContextRecord,
  type ExecutionAttemptRecord,
  type SessionApprovalRecord,
  type SessionArtifactRecord,
} from '../../../../application/port/out/repository/session-control/agent-session-control.persistence.types';
import type { AgentSessionControlQueryRepositoryPort } from '../../../../application/port/out/repository/session-control/agent-session-control-query.repository.port';
import type { AgentDelegationTransactionPort } from '../../../../application/port/out/transaction/session-control/agent-delegation.transaction.port';
import type { AgentAttemptOperationTransactionPort } from '../../../../application/port/out/transaction/session-control/agent-attempt-operation.transaction.port';
import type { AgentApprovalContinuationTransactionPort } from '../../../../application/port/out/transaction/session-control/agent-approval-continuation.transaction.port';
import type { AgentSessionTransitionTransactionPort } from '../../../../application/port/out/transaction/session-control/agent-session-transition.transaction.port';

type SessionControlPersistenceMethods = AgentSessionControlQueryRepositoryPort & AgentDelegationTransactionPort & AgentAttemptOperationTransactionPort & AgentApprovalContinuationTransactionPort & AgentSessionTransitionTransactionPort;

const TERMINAL_STATES = new Set(['archived', 'completed', 'succeeded', 'failed', 'cancelled']);

@Injectable()
export class PrismaAgentDelegationTransaction implements AgentDelegationTransactionPort {
  constructor(private readonly prisma: PrismaService) {}

  async createDelegatedTask(
    input: Parameters<SessionControlPersistenceMethods['createDelegatedTask']>[0],
  ): Promise<DelegatedTaskRecord> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lock(tx, [
        'agent-os:delegation-parent:v1',
        input.organizationId,
        input.sessionId,
        input.parentTaskId,
      ]);
      await lock(tx, [
        'agent-os:delegation-key:v1',
        input.organizationId,
        input.sessionId,
        input.parentTaskId,
        input.idempotencyKey,
      ]);
      const existing = await tx.agentSessionTaskDelegation.findFirst({
        where: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          parentTaskId: input.parentTaskId,
          idempotencyKey: input.idempotencyKey,
        },
        include: {
          childTask: {
            select: {
              objective: true,
              executions: { select: { id: true }, take: 1 },
            },
          },
        },
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
        const childExecution = existing.childTask.executions[0];
        if (!childExecution) throw state();
        return mapDelegation(existing, childExecution.id);
      }

      const parent = await tx.agentSessionTask.findFirst({
        where: {
          id: input.parentTaskId,
          sessionId: input.sessionId,
          organizationId: input.organizationId,
        },
        include: {
          session: {
            select: {
              lifecycle: true,
              copilotThreadId: true,
              authorityProfileVersionId: true,
            },
          },
          assignedAgentVersion: { select: { runtimeManifest: true } },
          incomingDelegation: { select: { depth: true } },
        },
      });
      if (!parent || parent.session.lifecycle !== 'active') throw scope();
      if (parent.assignedAgentVersionId !== input.fromAgentVersionId) throw scope();
      if (TERMINAL_STATES.has(parent.status)) throw state();

      const target = await tx.agentVersion.findFirst({
        where: {
          id: input.toAgentVersionId,
          ...(input.targetAgentDefinitionKey
            ? { agentDefinitionKey: input.targetAgentDefinitionKey }
            : {}),
          activatedAt: { not: null },
          retiredAt: null,
        },
        select: {
          id: true,
          agentDefinitionKey: true,
          runtimeType: true,
          modelIdentity: true,
          capabilityKeys: true,
        },
      });
      if (!target) throw scope();

      let policyCapabilityKeys = input.authoritySubset;
      let canonicalUserEvent: Record<string, unknown> | null = null;
      let currentResourceRefs: unknown[] = [];
      if (input.parentExecutionId) {
        const execution = await tx.agentExecution.findFirst({
          where: {
            id: input.parentExecutionId,
            organizationId: input.organizationId,
            sessionId: input.sessionId,
            sessionTaskId: input.parentTaskId,
            status: 'running',
          },
          select: {
            currentInput: true,
            resourceRefs: true,
            policySnapshot: { select: { capabilityKeys: true } },
          },
        });
        if (!execution) throw scope();
        canonicalUserEvent = parseCanonicalUserEvent(execution.currentInput);
        currentResourceRefs = z
          .array(CanonicalResourceRefSchema)
          .max(50)
          .parse(execution.resourceRefs);
        const parentPolicy = stringArray(execution.policySnapshot.capabilityKeys);
        const targetCapabilities = stringArray(target.capabilityKeys);
        if (
          input.authoritySubset.some(
            (key) => !parentPolicy.includes(key) || !targetCapabilities.includes(key),
          )
        ) throw state();
        const parentDepth = parent.incomingDelegation?.depth ?? 0;
        const childCount = await tx.agentSessionTask.count({
          where: {
            organizationId: input.organizationId,
            sessionId: input.sessionId,
            parentTaskId: input.parentTaskId,
          },
        });
        if (
          input.depth !== parentDepth + 1 ||
          input.maxDepth === undefined ||
          input.depth > input.maxDepth ||
          input.maxChildrenPerTask === undefined ||
          childCount >= input.maxChildrenPerTask
        ) throw state();
        policyCapabilityKeys = [...input.authoritySubset].sort();
      }

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
      await lock(tx, [
        'delegated-policy',
        input.sessionId,
        target.id,
        canonicalJson(policyCapabilityKeys),
      ]);
      const policyHash = createHash('sha256')
        .update(canonicalJson(policyCapabilityKeys))
        .digest('hex');
      let policy = await tx.agentPolicySnapshot.findFirst({
        where: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          agentVersionId: target.id,
          authorityProfileVersionId: parent.session.authorityProfileVersionId,
          policyHash,
        },
        select: { id: true },
      });
      policy ??= await tx.agentPolicySnapshot.create({
        data: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          agentVersionId: target.id,
          authorityProfileVersionId: parent.session.authorityProfileVersionId,
          capabilityKeys: policyCapabilityKeys,
          policyHash,
        },
        select: { id: true },
      });
      const childInput = canonicalUserEvent && input.parentExecutionId
        ? {
            userEvent: canonicalUserEvent,
            delegation: {
              delegationId: created.id,
              parentTaskId: input.parentTaskId,
              parentExecutionId: input.parentExecutionId,
              objective: input.objective,
              targetAgentDefinitionKey: target.agentDefinitionKey,
              authoritySubset: policyCapabilityKeys,
            },
          }
        : { objective: input.objective };
      const childExecution = await tx.agentExecution.create({
        data: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          sessionTaskId: child.id,
          copilotThreadId: parent.session.copilotThreadId,
          aguiRunId: `delegation:${child.id}`,
          agentVersionId: target.id,
          runtimeType: target.runtimeType,
          modelIdentity: target.modelIdentity,
          policySnapshotId: policy.id,
          inputHash: createHash('sha256')
            .update(canonicalJson(childInput))
            .digest('hex'),
          currentInput: childInput as Prisma.InputJsonValue,
          resourceRefs: currentResourceRefs as Prisma.InputJsonValue,
          status: 'running',
        },
        select: { id: true },
      });
      return mapDelegation(created, childExecution.id);
    }).catch(rethrowStable);
  }

}


function parseCanonicalUserEvent(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw state();
  const userEvent = value.userEvent;
  if (!userEvent || typeof userEvent !== 'object' || Array.isArray(userEvent)) {
    throw state();
  }
  if (
    typeof userEvent.externalEventId !== 'string' ||
    userEvent.schemaVersion !== 1
  ) throw state();
  return {
    externalEventId: userEvent.externalEventId,
    schemaVersion: 1,
    payload: UserMessageEventPayloadSchema.parse(userEvent.payload),
  };
}

function mapDelegation(
  row: { id: string; childTaskId: string; state: string },
  childExecutionId: string,
): DelegatedTaskRecord {
  return {
    delegationId: row.id,
    childTaskId: row.childTaskId,
    childExecutionId,
    state: row.state,
  };
}
function mapAttempt(row: { id: string; executionId: string; attemptNumber: number; runtimeType: string; externalRunId: string | null; encryptedHandleRef: string | null; runtimeGeneration: number; state: string }): ExecutionAttemptRecord {
  return {
    id: row.id,
    executionId: row.executionId,
    attemptNumber: row.attemptNumber,
    runtimeType: row.runtimeType,
    externalRunId: row.externalRunId,
    encryptedHandleRef: row.encryptedHandleRef,
    runtimeGeneration: row.runtimeGeneration,
    state: row.state,
  };
}
function mapApproval(row: { id: string; state: string; decisionIdempotencyKey: string | null }, changed: boolean): SessionApprovalRecord {
  return { id: row.id, state: row.state, decisionIdempotencyKey: row.decisionIdempotencyKey, changed };
}
async function ensureApprovalContinuation(
  tx: Prisma.TransactionClient,
  approval: { id: string; organizationId: string; state: string },
): Promise<void> {
  if (approval.state !== 'approved') return;
  const existing = await tx.agentSessionApprovalContinuation.findFirst({
    where: { approvalId: approval.id, organizationId: approval.organizationId },
    select: { id: true },
  });
  if (existing) return;
  await tx.agentSessionApprovalContinuation.create({
    data: {
      organizationId: approval.organizationId,
      approvalId: approval.id,
      state: 'pending',
    },
  });
}
function mapApprovalContinuation(
  approval: {
    id: string;
    attemptId: string;
    executionId: string;
    attempt: {
      runtimeType: string;
      externalRunId: string | null;
      encryptedHandleRef: string | null;
      runtimeGeneration: number;
    };
  },
  operationRunId: string,
  continuationState: 'successor_created' | 'interrupt_delivered',
) {
  if (!approval.attempt.externalRunId || !approval.attempt.encryptedHandleRef) throw state();
  return {
    approvalId: approval.id,
    operationRunId,
    attemptId: approval.attemptId,
    runtimeType: approval.attempt.runtimeType,
    executionId: approval.executionId,
    externalRunId: approval.attempt.externalRunId,
    encryptedHandleRef: approval.attempt.encryptedHandleRef,
    runtimeGeneration: approval.attempt.runtimeGeneration,
    state: continuationState,
  };
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
function retryRunId(taskId: string, idempotencyKey: string): string {
  return `retry-${createHash('sha256')
    .update(canonicalJson([taskId, idempotencyKey]))
    .digest('hex')}`;
}
function toInputJson(value: Prisma.JsonValue): Prisma.InputJsonValue | Prisma.JsonNullValueInput {
  return value === null ? Prisma.JsonNull : value as Prisma.InputJsonValue;
}
function stringArray(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || !item.trim()) ||
    new Set(value).size !== value.length
  ) throw state();
  return value as string[];
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
