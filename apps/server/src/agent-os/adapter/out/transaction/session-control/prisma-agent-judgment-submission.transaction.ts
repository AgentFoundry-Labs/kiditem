import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { AgentOsBoundaryError } from '../../../../domain/agent-os.errors';
import type { AgentJudgmentSubmissionTransactionPort } from '../../../../application/port/out/transaction/session-control/agent-judgment-submission.transaction.port';

const options = { maxWait: 10_000, timeout: 30_000 } as const;

/** One atomic official-session submission; the outbox deliberately stores no content. */
@Injectable()
export class PrismaAgentJudgmentSubmissionTransaction
  implements AgentJudgmentSubmissionTransactionPort
{
  constructor(private readonly prisma: PrismaService) {}

  async submit(input: Parameters<AgentJudgmentSubmissionTransactionPort['submit']>[0]) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await submissionLock(tx, input);
        await humanPrincipal(tx, input.organizationId, input.userId);
        await authority(tx, input);

        const identity = digest([
          'agent-judgment', input.organizationId, input.userId,
          input.agentDefinitionKey, input.idempotencyKey,
        ]);
        const copilotThreadId = `judgment.${identity}`;
        const aguiRunId = `judgment.${identity}`;
        const currentInput = judgmentCurrentInput(input.objective, copilotThreadId);
        const inputHash = digest(currentInput);
        const session = await tx.agentSession.findFirst({
          where: { organizationId: input.organizationId, copilotThreadId },
          select: {
            id: true, organizationId: true, createdByUserId: true,
            primaryAgentVersionId: true, authorityProfileVersionId: true, lifecycle: true,
          },
        });
        if (session) {
          const storedVersion = await tx.agentVersion.findFirst({
            where: { id: session.primaryAgentVersionId },
            select: { agentDefinitionKey: true },
          });
          if (
            session.createdByUserId !== input.userId
            || storedVersion?.agentDefinitionKey !== input.agentDefinitionKey
            || session.authorityProfileVersionId !== input.authorityProfileVersionId
            || session.lifecycle !== 'active'
          ) throw conflict();
          const existing = await tx.agentExecution.findFirst({
            where: { organizationId: input.organizationId, copilotThreadId, aguiRunId },
            select: { id: true, sessionId: true, sessionTaskId: true, inputHash: true },
          });
          if (!existing || existing.sessionId !== session.id || existing.inputHash !== inputHash)
            throw conflict();
          const outbox = await tx.agentExecutionDispatchOutbox.findFirst({
            where: {
              organizationId: input.organizationId,
              sessionId: session.id,
              sessionTaskId: existing.sessionTaskId,
              executionId: existing.id,
            },
            select: { idempotencyKey: true, fingerprint: true, state: true, operationRunId: true },
          });
          if (!outbox || outbox.idempotencyKey !== input.idempotencyKey || outbox.fingerprint !== input.fingerprint)
            throw conflict();
          return result(input, session.id, existing.sessionTaskId, existing.id, outbox);
        }

        const version = await tx.agentVersion.findFirst({
          where: {
            agentDefinitionKey: input.agentDefinitionKey,
            activatedAt: { not: null },
            retiredAt: null,
          },
          select: {
            id: true,
            agentDefinitionKey: true,
            version: true,
            runtimeType: true,
            modelIdentity: true,
            capabilityKeys: true,
            policyDocument: true,
          },
        });
        if (!version) throw boundary('AGENT_JUDGMENT_AGENT_NOT_ACTIVE');
        if (!input.registeredRuntimeTypes.includes(version.runtimeType)) {
          throw boundary('AGENT_RUNTIME_NOT_CONFIGURED');
        }

        const created = await tx.agentSession.create({
          data: {
            organizationId: input.organizationId,
            createdByUserId: input.userId,
            copilotThreadId,
            primaryAgentVersionId: version.id,
            authorityProfileVersionId: input.authorityProfileVersionId,
            lifecycle: 'active',
          },
          select: { id: true },
        });
        const task = await tx.agentSessionTask.create({
          data: {
            organizationId: input.organizationId,
            sessionId: created.id,
            assignedAgentVersionId: version.id,
            objective: null,
            isRoot: true,
            status: 'queued',
            idempotencyKey: 'root',
          },
          select: { id: true },
        });
        await tx.agentContextEpoch.create({
          data: { organizationId: input.organizationId, sessionId: created.id, epoch: 1 },
        });
        const policy = await tx.agentPolicySnapshot.create({
          data: {
            id: stableUuid(['agent-judgment-policy', input.organizationId, created.id, version.id, input.authorityProfileVersionId, input.capabilityKeys]),
            organizationId: input.organizationId,
            sessionId: created.id,
            agentVersionId: version.id,
            authorityProfileVersionId: input.authorityProfileVersionId,
            capabilityKeys: [...input.capabilityKeys],
            policyHash: digest([
              input.authorityProfileVersionId, input.capabilityKeys,
              version.agentDefinitionKey, version.version, version.runtimeType,
              version.modelIdentity, version.capabilityKeys, version.policyDocument,
            ]),
          },
          select: { id: true },
        });
        const execution = await tx.agentExecution.create({
          data: {
            organizationId: input.organizationId,
            sessionId: created.id,
            sessionTaskId: task.id,
            copilotThreadId,
            aguiRunId,
            agentVersionId: version.id,
            runtimeType: version.runtimeType,
            modelIdentity: version.modelIdentity,
            policySnapshotId: policy.id,
            inputHash,
            currentInput,
            resourceRefs: input.resourceRefs as Prisma.InputJsonValue,
            status: 'running',
          },
          select: { id: true },
        });
        const updatedSession = await tx.agentSession.update({
          where: { id_organizationId: { id: created.id, organizationId: input.organizationId } },
          data: { lastEventSequence: { increment: 1 } },
          select: { lastEventSequence: true },
        });
        const event = await tx.agentConversationEvent.create({
          data: {
            organizationId: input.organizationId,
            sessionId: created.id,
            executionId: execution.id,
            externalEventId: currentInput.userEvent.externalEventId,
            sequence: updatedSession.lastEventSequence,
            eventType: 'user_message',
            schemaVersion: 1,
            payload: currentInput.userEvent.payload,
          },
          select: { id: true },
        });
        await tx.agentConversationOutbox.create({
          data: { organizationId: input.organizationId, eventId: event.id },
        });
        const outbox = await tx.agentExecutionDispatchOutbox.create({
          data: {
            organizationId: input.organizationId,
            sessionId: created.id,
            sessionTaskId: task.id,
            executionId: execution.id,
            idempotencyKey: input.idempotencyKey,
            fingerprint: input.fingerprint,
            state: 'pending',
          },
          select: { idempotencyKey: true, fingerprint: true, state: true, operationRunId: true },
        });
        return result(input, created.id, task.id, execution.id, outbox);
      }, options);
    } catch (error) {
      if (error instanceof AgentOsBoundaryError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw conflict();
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003')
        throw boundary('AGENT_JUDGMENT_SCOPE_INVALID');
      throw error;
    }
  }
}

async function submissionLock(
  tx: Prisma.TransactionClient,
  input: Parameters<AgentJudgmentSubmissionTransactionPort['submit']>[0],
): Promise<void> {
  const key = canonical([
    'agent-judgment-submission', input.organizationId, input.userId,
    input.agentDefinitionKey, input.idempotencyKey,
  ]);
  await tx.$queryRaw`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; carries the exact organization, actor, definition, and idempotency coordinates.
    SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text AS "lock"
  `;
}

async function humanPrincipal(tx: Prisma.TransactionClient, organizationId: string, userId: string): Promise<void> {
  const membership = await tx.organizationMembership.findFirst({
    where: { organizationId, userId, status: 'active', user: { type: 'human', isActive: true } },
    select: { id: true },
  });
  if (!membership) throw boundary('AGENT_JUDGMENT_PRINCIPAL_NOT_ALLOWED');
}

async function authority(
  tx: Prisma.TransactionClient,
  input: Parameters<AgentJudgmentSubmissionTransactionPort['submit']>[0],
): Promise<void> {
  const profile = await tx.agentAuthorityProfileVersion.findFirst({
    where: { id: input.authorityProfileVersionId, organizationId: input.organizationId },
    select: { capabilityKeys: true, policyDocument: true, policyHash: true },
  });
  if (!profile) throw boundary('AGENT_JUDGMENT_SCOPE_INVALID');
  if (
    canonical(profile.capabilityKeys) !== canonical(input.capabilityKeys)
    || canonical(profile.policyDocument) !== canonical(input.authorityProfilePolicyDocument)
    || profile.policyHash !== input.authorityProfilePolicyHash
  ) throw conflict();
}

function result(
  input: Parameters<AgentJudgmentSubmissionTransactionPort['submit']>[0],
  sessionId: string,
  taskId: string,
  executionId: string,
  outbox: { state: string; operationRunId: string | null },
) {
  if (outbox.state !== 'pending' && outbox.state !== 'dispatched') throw conflict();
  return {
    organizationId: input.organizationId,
    userId: input.userId,
    sessionId,
    taskId,
    executionId,
    state: outbox.state,
    operationRunId: outbox.operationRunId,
  } as const;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  throw conflict();
}
function judgmentCurrentInput(objective: string, externalEventId: string) {
  return {
    userEvent: {
      externalEventId,
      schemaVersion: 1 as const,
      payload: {
        phase: 'complete' as const,
        messageId: externalEventId,
        content: objective,
      },
    },
  };
}
function digest(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
function stableUuid(value: unknown): string {
  const bytes = createHash('sha256').update(canonical(value)).digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function boundary(code: string): AgentOsBoundaryError { return new AgentOsBoundaryError(code, code); }
function conflict(): AgentOsBoundaryError { return boundary('AGENT_JUDGMENT_IDEMPOTENCY_CONFLICT'); }
