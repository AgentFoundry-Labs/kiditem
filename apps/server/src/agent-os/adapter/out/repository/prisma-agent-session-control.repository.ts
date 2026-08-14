import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  CanonicalResourceRefSchema,
  UserMessageEventPayloadSchema,
} from '@kiditem/shared/agent-interaction';
import { z } from 'zod';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  AgentSessionControlRepositoryError,
  type AgentSessionControlRepositoryPort,
  type DelegatedTaskRecord,
  type DelegationContextRecord,
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

  async isExecutionCapabilityAllowed(input: {
    organizationId: string;
    sessionId: string;
    sessionTaskId: string;
    executionId: string;
    capabilityKey: string;
  }): Promise<boolean> {
    const execution = await this.prisma.agentExecution.findFirst({
      where: {
        id: input.executionId,
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        sessionTaskId: input.sessionTaskId,
        status: 'running',
        session: { lifecycle: 'active' },
        sessionTask: {
          status: { in: ['queued', 'running', 'waiting_approval', 'paused'] },
        },
      },
      select: {
        agentVersionId: true,
        agentVersion: { select: { runtimeManifest: true } },
        policySnapshot: {
          select: { agentVersionId: true, capabilityKeys: true },
        },
      },
    });
    if (
      !execution ||
      execution.policySnapshot.agentVersionId !== execution.agentVersionId
    ) return false;
    const manifest = execution.agentVersion.runtimeManifest;
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      return false;
    }
    const manifestKeys = stringArray(manifest.capabilityKeys);
    const policyKeys = stringArray(execution.policySnapshot.capabilityKeys);
    return (
      manifestKeys.includes(input.capabilityKey) &&
      policyKeys.includes(input.capabilityKey)
    );
  }

  async loadDelegationContext(input: {
    organizationId: string;
    sessionId: string;
    parentTaskId: string;
    parentExecutionId: string;
    targetAgentDefinitionKey: string;
  }): Promise<DelegationContextRecord | null> {
    const parent = await this.prisma.agentSessionTask.findFirst({
      where: {
        id: input.parentTaskId,
        sessionId: input.sessionId,
        organizationId: input.organizationId,
      },
      select: {
        status: true,
        assignedAgentVersionId: true,
        session: { select: { lifecycle: true } },
        assignedAgentVersion: { select: { runtimeManifest: true } },
        incomingDelegation: { select: { depth: true } },
        executions: {
          where: { id: input.parentExecutionId, status: 'running' },
          select: {
            id: true,
            policySnapshot: { select: { capabilityKeys: true } },
          },
          take: 1,
        },
        _count: { select: { children: true } },
      },
    });
    const execution = parent?.executions[0];
    if (!parent || !execution) return null;
    const target = await this.prisma.agentVersion.findFirst({
      where: {
        agentDefinitionKey: input.targetAgentDefinitionKey,
        activatedAt: { not: null },
        retiredAt: null,
      },
      select: {
        id: true,
        agentDefinitionKey: true,
        capabilityKeys: true,
      },
    });
    if (!target) return null;
    return {
      sessionLifecycle: parent.session.lifecycle,
      taskStatus: parent.status,
      parentAgentVersionId: parent.assignedAgentVersionId,
      parentExecutionId: execution.id,
      parentDepth: parent.incomingDelegation?.depth ?? 0,
      childCount: parent._count.children,
      parentManifest: parent.assignedAgentVersion.runtimeManifest,
      targetAgentVersionId: target.id,
      targetDefinitionKey: target.agentDefinitionKey,
      targetCapabilityKeys: target.capabilityKeys,
      activeTarget: true,
      parentPolicyCapabilityKeys: execution.policySnapshot.capabilityKeys,
    };
  }

  async createDelegatedTask(
    input: Parameters<AgentSessionControlRepositoryPort['createDelegatedTask']>[0],
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
          (input.operationRunId !== undefined &&
            existing.operationRunId !== input.operationRunId) ||
          (input.externalRunId !== undefined &&
            existing.externalRunId !== input.externalRunId) ||
          (input.encryptedHandleRef !== undefined &&
            existing.encryptedHandleRef !== input.encryptedHandleRef)
        ) {
          throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
        }
        if (existing.state === 'queued') {
          return mapAttempt(await tx.agentExecutionAttempt.update({
            where: { id: existing.id },
            data: { state: 'running', startedAt: new Date() },
          }));
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
          runtimeGeneration: 0,
          operationRunId: input.operationRunId ?? null,
          state: 'running',
        },
      }));
    }).catch(rethrowStable);
  }

  async reserveAttemptForOperation(
    input: Parameters<AgentSessionControlRepositoryPort['reserveAttemptForOperation']>[0],
  ): Promise<ExecutionAttemptRecord> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lock(tx, ['attempt', input.executionId]);
      await lock(tx, ['attempt-operation', input.organizationId, input.operationRunId]);
      const execution = await tx.agentExecution.findFirst({
        where: {
          id: input.executionId,
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          sessionTaskId: input.taskId,
          status: 'running',
        },
        select: { id: true, runtimeType: true },
      });
      if (!execution) throw scope();
      const existing = await tx.agentExecutionAttempt.findFirst({
        where: {
          executionId: input.executionId,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (existing) {
        if (
          existing.organizationId !== input.organizationId ||
          existing.sessionId !== input.sessionId ||
          existing.executionId !== input.executionId ||
          existing.runtimeType !== execution.runtimeType ||
          existing.operationRunId !== input.operationRunId
        ) throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
        return mapAttempt(existing);
      }
      const existingOperation = await tx.agentExecutionAttempt.findFirst({
        where: {
          organizationId: input.organizationId,
          operationRunId: input.operationRunId,
        },
      });
      if (existingOperation) {
        if (
          existingOperation.executionId !== input.executionId ||
          existingOperation.sessionId !== input.sessionId
        ) throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
        return mapAttempt(existingOperation);
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
          runtimeType: execution.runtimeType,
          operationRunId: input.operationRunId,
          state: 'queued',
        },
      }));
    }).catch(rethrowStable);
  }

  async findAttemptForOperation(
    input: Parameters<AgentSessionControlRepositoryPort['findAttemptForOperation']>[0],
  ): Promise<ExecutionAttemptRecord | null> {
    const attempt = await this.prisma.agentExecutionAttempt.findFirst({
      where: {
        organizationId: input.organizationId,
        operationRunId: input.operationRunId,
      },
    });
    return attempt ? mapAttempt(attempt) : null;
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

  async persistAttemptHandle(
    input: Parameters<AgentSessionControlRepositoryPort['persistAttemptHandle']>[0],
  ): Promise<ExecutionAttemptRecord> {
    return this.prisma.$transaction(async (tx) => {
      await lock(tx, ['attempt-handle', input.executionId, input.attemptId]);
      const attempt = await tx.agentExecutionAttempt.findFirst({
        where: {
          id: input.attemptId,
          executionId: input.executionId,
          sessionId: input.sessionId,
          organizationId: input.organizationId,
        },
      });
      if (!attempt) throw scope();
      if (
        attempt.externalRunId === input.externalRunId &&
        attempt.encryptedHandleRef === input.encryptedHandleRef &&
        attempt.runtimeGeneration === input.runtimeGeneration &&
        attempt.runtimeType === input.runtimeType
      ) return mapAttempt(attempt);
      if (
        attempt.state !== 'running' ||
        attempt.runtimeType !== input.runtimeType ||
        attempt.externalRunId !== null ||
        attempt.encryptedHandleRef !== null
      ) throw state();
      return mapAttempt(await tx.agentExecutionAttempt.update({
        where: { id: attempt.id },
        data: {
          externalRunId: input.externalRunId,
          encryptedHandleRef: input.encryptedHandleRef,
          runtimeGeneration: input.runtimeGeneration,
        },
      }));
    }).catch(rethrowStable);
  }

  async requestApproval(
    input: Parameters<AgentSessionControlRepositoryPort['requestApproval']>[0],
  ): Promise<SessionApprovalRecord> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lock(tx, ['approval-open', input.organizationId, input.executionId]);
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
        return mapApproval(existing, false);
      }
      const pending = await tx.agentSessionApproval.findFirst({
        where: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          executionId: input.executionId,
          state: 'pending',
        },
        select: { id: true },
      });
      if (pending) throw state();
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
      }), true);
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
        return mapApproval(idempotent, false);
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
      }), true);
    }).catch(rethrowStable);
  }

  async loadApproval(
    input: Parameters<AgentSessionControlRepositoryPort['loadApproval']>[0],
  ) {
    const approval = await this.prisma.agentSessionApproval.findFirst({
      where: {
        id: input.approvalId,
        organizationId: input.organizationId,
        sessionId: input.sessionId,
      },
      select: {
        id: true,
        organizationId: true,
        sessionId: true,
        taskId: true,
        executionId: true,
        attemptId: true,
        capabilityKey: true,
        argumentsHash: true,
        resourceSnapshot: true,
        state: true,
        decisionIdempotencyKey: true,
        expiresAt: true,
        execution: {
          select: {
            session: { select: { createdByUserId: true } },
          },
        },
        attempt: {
          select: {
            runtimeType: true,
            externalRunId: true,
            encryptedHandleRef: true,
            runtimeGeneration: true,
            operationRunId: true,
          },
        },
      },
    });
    if (!approval) return null;
    const resourceSnapshot = z.array(CanonicalResourceRefSchema).max(50).safeParse(
      approval.resourceSnapshot,
    );
    if (!resourceSnapshot.success) throw state();
    return {
      id: approval.id,
      organizationId: approval.organizationId,
      sessionId: approval.sessionId,
      taskId: approval.taskId,
      executionId: approval.executionId,
      attemptId: approval.attemptId,
      operationRunId: approval.attempt.operationRunId,
      capabilityKey: approval.capabilityKey,
      argumentsHash: approval.argumentsHash,
      resourceSnapshot: resourceSnapshot.data,
      state: approval.state,
      decisionIdempotencyKey: approval.decisionIdempotencyKey,
      expiresAt: approval.expiresAt,
      requestedByUserId: approval.execution.session.createdByUserId,
      runtimeType: approval.attempt.runtimeType,
      externalRunId: approval.attempt.externalRunId,
      encryptedHandleRef: approval.attempt.encryptedHandleRef,
      runtimeGeneration: approval.attempt.runtimeGeneration,
    };
  }

  async expireApproval(
    input: Parameters<AgentSessionControlRepositoryPort['expireApproval']>[0],
  ): Promise<SessionApprovalRecord> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lock(tx, ['approval-expire', input.organizationId, input.approvalId]);
      const approval = await tx.agentSessionApproval.findFirst({
        where: {
          id: input.approvalId,
          organizationId: input.organizationId,
          sessionId: input.sessionId,
        },
      });
      if (!approval) throw scope();
      if (approval.state === 'expired') return mapApproval(approval, false);
      if (approval.state !== input.expectedState) throw state();
      const updated = await tx.agentSessionApproval.update({
        where: { id: approval.id },
        data: { state: 'expired', decidedAt: new Date() },
      });
      return mapApproval(updated, true);
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

  async loadCancelableTask(
    input: Parameters<AgentSessionControlRepositoryPort['loadCancelableTask']>[0],
  ) {
    const task = await this.prisma.agentSessionTask.findFirst({
      where: {
        id: input.taskId,
        sessionId: input.sessionId,
        organizationId: input.organizationId,
        status: input.expectedStatus,
        session: { createdByUserId: input.actorId },
      },
      select: {
        id: true,
        sessionId: true,
        organizationId: true,
        status: true,
        executions: {
          where: { status: 'running' },
          orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: {
            id: true,
            runtimeType: true,
            attempts: {
              where: { state: { in: ['queued', 'running'] }, operationRunId: { not: null } },
              orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
              take: 1,
              select: { operationRunId: true },
            },
          },
        },
      },
    });
    const execution = task?.executions[0];
    const operationRunId = execution?.attempts[0]?.operationRunId ?? null;
    if (!task || !execution || !operationRunId) return null;
    return {
      organizationId: task.organizationId,
      sessionId: task.sessionId,
      taskId: task.id,
      operationRunId,
    };
  }

  async loadTaskExecution(
    input: Parameters<AgentSessionControlRepositoryPort['loadTaskExecution']>[0],
  ) {
    const task = await this.prisma.agentSessionTask.findFirst({
      where: {
        id: input.taskId,
        sessionId: input.sessionId,
        organizationId: input.organizationId,
        session: { createdByUserId: input.actorId },
      },
      select: {
        id: true,
        organizationId: true,
        sessionId: true,
        status: true,
        session: { select: { createdByUserId: true } },
        executions: {
          orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: {
            id: true,
            status: true,
            runtimeType: true,
            attempts: {
              orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
              take: 1,
              select: { operationRunId: true },
            },
          },
        },
      },
    });
    const execution = task?.executions[0];
    if (!task || !execution) return null;
    return {
      organizationId: task.organizationId,
      sessionId: task.sessionId,
      taskId: task.id,
      taskStatus: task.status,
      executionId: execution.id,
      executionStatus: execution.status,
      runtimeType: execution.runtimeType,
      requestedByUserId: task.session.createdByUserId,
      operationRunId: execution.attempts[0]?.operationRunId ?? null,
    };
  }

  async createRetryExecution(
    input: Parameters<AgentSessionControlRepositoryPort['createRetryExecution']>[0],
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lock(tx, ['retry-task', input.organizationId, input.sessionId, input.taskId]);
      const task = await tx.agentSessionTask.findFirst({
        where: {
          id: input.taskId,
          sessionId: input.sessionId,
          organizationId: input.organizationId,
          session: { createdByUserId: input.actorId, lifecycle: 'active' },
        },
        select: {
          id: true,
          organizationId: true,
          sessionId: true,
          status: true,
          session: { select: { createdByUserId: true, copilotThreadId: true } },
          executions: {
            orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: {
              id: true,
              agentVersionId: true,
              runtimeType: true,
              modelIdentity: true,
              policySnapshotId: true,
              inputHash: true,
              currentInput: true,
              resourceRefs: true,
              attempt: true,
            },
          },
        },
      });
      if (!task) {
        throw scope();
      }
      const aguiRunId = retryRunId(input.taskId, input.idempotencyKey);
      const existing = await tx.agentExecution.findFirst({
        where: {
          organizationId: input.organizationId,
          copilotThreadId: task.session.copilotThreadId,
          aguiRunId,
        },
        select: {
          id: true,
          status: true,
          runtimeType: true,
          attempts: { take: 1, select: { operationRunId: true } },
        },
      });
      if (existing) {
        return {
          organizationId: task.organizationId,
          sessionId: task.sessionId,
          taskId: task.id,
          taskStatus: task.status,
          executionId: existing.id,
          executionStatus: existing.status,
          runtimeType: existing.runtimeType,
          requestedByUserId: task.session.createdByUserId,
          operationRunId: existing.attempts[0]?.operationRunId ?? null,
        };
      }
      if (task.status !== input.expectedStatus) throw state();
      const previous = task.executions[0];
      if (!previous) throw state();
      const execution = await tx.agentExecution.create({
        data: {
          organizationId: task.organizationId,
          sessionId: task.sessionId,
          sessionTaskId: task.id,
          copilotThreadId: task.session.copilotThreadId,
          aguiRunId,
          agentVersionId: previous.agentVersionId,
          runtimeType: previous.runtimeType,
          modelIdentity: previous.modelIdentity,
          policySnapshotId: previous.policySnapshotId,
          inputHash: previous.inputHash,
          currentInput: toInputJson(previous.currentInput),
          resourceRefs: toInputJson(previous.resourceRefs),
          attempt: previous.attempt + 1,
          status: 'running',
        },
        select: { id: true, status: true, runtimeType: true },
      });
      await tx.agentSessionTask.update({
        where: { id: task.id },
        data: { status: 'queued', finishedAt: null },
      });
      return {
        organizationId: task.organizationId,
        sessionId: task.sessionId,
        taskId: task.id,
        taskStatus: 'queued',
        executionId: execution.id,
        executionStatus: execution.status,
        runtimeType: execution.runtimeType,
        requestedByUserId: task.session.createdByUserId,
        operationRunId: null,
      };
    }).catch(rethrowStable);
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
function mapAttempt(row: { id: string; executionId: string; attemptNumber: number; runtimeType: string; externalRunId: string | null; encryptedHandleRef: string | null; runtimeGeneration: number; operationRunId: string | null; state: string }): ExecutionAttemptRecord {
  return {
    id: row.id,
    executionId: row.executionId,
    attemptNumber: row.attemptNumber,
    runtimeType: row.runtimeType,
    externalRunId: row.externalRunId,
    encryptedHandleRef: row.encryptedHandleRef,
    runtimeGeneration: row.runtimeGeneration,
    operationRunId: row.operationRunId,
    state: row.state,
  };
}
function mapApproval(row: { id: string; state: string; decisionIdempotencyKey: string | null }, changed: boolean): SessionApprovalRecord {
  return { id: row.id, state: row.state, decisionIdempotencyKey: row.decisionIdempotencyKey, changed };
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
