import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  InteractionClass,
  ThreadBinding,
} from '@kiditem/shared/agent-interaction';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  AgentInteractionRepositoryPort,
  AgentInteractionTransactionPort,
  ArchiveInteractionBindingInput,
  CreateAgentExecutionInput,
  CreateQuickAskBindingInput,
  MarkAgentExecutionTerminalInput,
  QuickAskScope,
  RecordAgentExecutionUsageInput,
} from '../../../application/port/out/repository/agent-interaction-repository.port';
import { AgentOsBoundaryError } from '../../../domain/agent-os.errors';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

type BindingClient = Pick<
  Prisma.TransactionClient,
  'agentInteractionThreadBinding'
>;

type ExecutionClient = Pick<Prisma.TransactionClient, 'agentExecution'>;

interface ThreadBindingRow {
  id: string;
  copilotThreadId: string;
  organizationId: string;
  userId: string;
  agentVersionId: string;
  interactionClass: string;
  lifecycle: string;
  idleExpiresAt: Date | null;
  contextEpoch: number;
}

interface LockedThreadBindingRow {
  id: string;
  organizationId: string;
  copilotThreadId: string;
  agentVersionId: string;
  interactionClass: string;
  lifecycle: string;
}

const threadBindingSelect = {
  id: true,
  copilotThreadId: true,
  organizationId: true,
  userId: true,
  agentVersionId: true,
  interactionClass: true,
  lifecycle: true,
  idleExpiresAt: true,
  contextEpoch: true,
} as const;

const existingExecutionSelect = {
  id: true,
  organizationId: true,
  threadBindingId: true,
  copilotThreadId: true,
  aguiRunId: true,
  sessionId: true,
  sessionTaskId: true,
  interactionClass: true,
  agentVersionId: true,
  runtimeType: true,
  modelIdentity: true,
  policySnapshotId: true,
  attempt: true,
} as const;

type ExistingExecutionRow = Prisma.AgentExecutionGetPayload<{
  select: typeof existingExecutionSelect;
}>;

@Injectable()
export class PrismaAgentInteractionRepository
implements AgentInteractionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findActiveQuickAsk(scope: QuickAskScope): Promise<ThreadBinding | null> {
    return findActiveQuickAsk(this.prisma, scope);
  }

  createQuickAskBinding(
    input: CreateQuickAskBindingInput,
  ): Promise<ThreadBinding> {
    return createQuickAskBinding(this.prisma, input);
  }

  archiveBinding(input: ArchiveInteractionBindingInput): Promise<void> {
    return this.prisma.$transaction(
      (tx) => archiveBinding(tx, input),
      TRANSACTION_OPTIONS,
    );
  }

  withQuickAskLock<T>(
    scope: QuickAskScope,
    work: (transaction: AgentInteractionTransactionPort) => Promise<T>,
  ): Promise<T> {
    const lockKey = JSON.stringify([
      'agent-interaction',
      'quick-ask',
      scope.organizationId,
      scope.userId,
      scope.agentVersionId,
    ]);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        -- queryraw-tenancy-exempt: organization-scoped advisory lock; key also includes user and agent version, and reads no tenant data.
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
      `;
      return work(new PrismaAgentInteractionTransaction(tx));
    }, TRANSACTION_OPTIONS);
  }

  async createExecution(
    input: CreateAgentExecutionInput,
  ): Promise<{ id: string }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const binding = await lockThreadBinding(
          tx,
          input.organizationId,
          input.threadBindingId,
        );
        assertExecutionBindingScope(binding, input);

        const [version, policySnapshot] = await Promise.all([
          tx.agentVersion.findFirst({
            where: {
              id: input.agentVersionId,
              runtimeType: input.runtimeType,
              modelIdentity: input.modelIdentity,
            },
            select: { id: true },
          }),
          tx.agentPolicySnapshot.findFirst({
            where: {
              id: input.policySnapshotId,
              organizationId: input.organizationId,
              agentVersionId: input.agentVersionId,
            },
            select: { id: true },
          }),
        ]);

        if (!version || !policySnapshot) {
          throw invalidExecutionScope();
        }
        const existing = await findExistingExecution(tx, input);
        if (existing) {
          return resolveMatchingExecution(existing, input);
        }
        if (binding.lifecycle !== 'active') {
          throw invalidExecutionScope();
        }

        return tx.agentExecution.create({
          data: {
            organizationId: input.organizationId,
            threadBindingId: input.threadBindingId,
            copilotThreadId: input.copilotThreadId,
            aguiRunId: input.aguiRunId,
            sessionId: input.sessionId,
            sessionTaskId: input.sessionTaskId,
            interactionClass: input.interactionClass,
            agentVersionId: input.agentVersionId,
            runtimeType: input.runtimeType,
            modelIdentity: input.modelIdentity,
            policySnapshotId: input.policySnapshotId,
            attempt: 1,
            status: 'running',
          },
          select: { id: true },
        });
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      if (!isExecutionIdempotencyUniqueError(error)) throw error;
      const existing = await findExistingExecution(this.prisma, input);
      if (!existing) {
        throw executionIdempotencyConflict();
      }
      return resolveMatchingExecution(existing, input);
    }
  }

  async markExecutionTerminal(
    input: MarkAgentExecutionTerminalInput,
  ): Promise<void> {
    if (input.status === 'completed' && input.errorCode !== null) {
      throw new AgentOsBoundaryError(
        'interaction_execution_terminal_error_invalid',
        'A completed interaction execution cannot carry an error code.',
      );
    }
    const updated = await this.prisma.agentExecution.updateMany({
      where: {
        id: input.id,
        organizationId: input.organizationId,
        status: 'running',
      },
      data: {
        status: input.status,
        errorCode: input.errorCode,
        finishedAt: input.finishedAt,
      },
    });
    if (updated.count !== 1) {
      throw new AgentOsBoundaryError(
        'interaction_execution_not_running',
        'Interaction execution was not found in scope or is already terminal.',
      );
    }
  }

  recordExecutionUsage(input: RecordAgentExecutionUsageInput): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const execution = await tx.agentExecution.findFirst({
        where: {
          id: input.executionId,
          organizationId: input.organizationId,
        },
        select: { id: true, modelIdentity: true },
      });
      if (!execution) {
        throw new AgentOsBoundaryError(
          'interaction_usage_execution_not_found',
          'Interaction execution was not found in the requested organization.',
        );
      }
      if (input.modelIdentity !== execution.modelIdentity) {
        throw new AgentOsBoundaryError(
          'interaction_usage_model_mismatch',
          'Interaction usage model identity does not match the scoped execution.',
        );
      }

      await tx.agentExecutionUsage.create({
        data: {
          organizationId: input.organizationId,
          executionId: execution.id,
          modelIdentity: execution.modelIdentity,
          provider: input.provider,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          costMicros: input.costMicros,
          currency: input.currency,
        },
      });
    }, TRANSACTION_OPTIONS);
  }
}

class PrismaAgentInteractionTransaction
implements AgentInteractionTransactionPort {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  findActiveQuickAsk(scope: QuickAskScope): Promise<ThreadBinding | null> {
    return findActiveQuickAsk(this.tx, scope);
  }

  createQuickAskBinding(
    input: CreateQuickAskBindingInput,
  ): Promise<ThreadBinding> {
    return createQuickAskBinding(this.tx, input);
  }

  archiveBinding(input: ArchiveInteractionBindingInput): Promise<void> {
    return archiveBinding(this.tx, input);
  }
}

async function findActiveQuickAsk(
  client: BindingClient,
  scope: QuickAskScope,
): Promise<ThreadBinding | null> {
  const binding = await client.agentInteractionThreadBinding.findFirst({
    where: {
      organizationId: scope.organizationId,
      userId: scope.userId,
      agentVersionId: scope.agentVersionId,
      interactionClass: 'quick_ask',
      lifecycle: 'active',
    },
    select: threadBindingSelect,
  });
  return binding ? mapThreadBinding(binding) : null;
}

async function createQuickAskBinding(
  client: BindingClient,
  input: CreateQuickAskBindingInput,
): Promise<ThreadBinding> {
  const binding = await client.agentInteractionThreadBinding.create({
    data: {
      id: input.id,
      copilotThreadId: input.copilotThreadId,
      organizationId: input.organizationId,
      userId: input.userId,
      agentVersionId: input.agentVersionId,
      interactionClass: 'quick_ask',
      lifecycle: 'active',
      idleExpiresAt: input.idleExpiresAt,
    },
    select: threadBindingSelect,
  });
  return mapThreadBinding(binding);
}

async function archiveBinding(
  tx: Prisma.TransactionClient,
  input: ArchiveInteractionBindingInput,
): Promise<void> {
  const binding = await lockThreadBinding(tx, input.organizationId, input.id);
  if (!binding || binding.lifecycle !== 'active') {
    throw interactionBindingNotActive();
  }

  const runningExecution = await tx.agentExecution.findFirst({
    where: {
      organizationId: input.organizationId,
      threadBindingId: input.id,
      status: 'running',
    },
    select: { id: true },
  });
  if (runningExecution) {
    throw new AgentOsBoundaryError(
      'interaction_binding_has_running_execution',
      'An interaction binding with a running execution cannot be archived.',
    );
  }

  const archived = await tx.agentInteractionThreadBinding.updateMany({
    where: {
      id: input.id,
      organizationId: input.organizationId,
      lifecycle: 'active',
    },
    data: {
      lifecycle: 'archived',
      archivedAt: input.archivedAt,
    },
  });
  if (archived.count !== 1) {
    throw interactionBindingNotActive();
  }
}

async function lockThreadBinding(
  tx: Prisma.TransactionClient,
  organizationId: string,
  id: string,
): Promise<LockedThreadBindingRow | null> {
  const [binding] = await tx.$queryRaw<LockedThreadBindingRow[]>`
    SELECT
      id::text AS "id",
      organization_id::text AS "organizationId",
      copilot_thread_id AS "copilotThreadId",
      agent_version_id::text AS "agentVersionId",
      interaction_class AS "interactionClass",
      lifecycle
    FROM agent_interaction_thread_bindings
    WHERE id = ${id}::uuid
      AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `;
  return binding ?? null;
}

function assertExecutionBindingScope(
  binding: LockedThreadBindingRow | null,
  input: CreateAgentExecutionInput,
): asserts binding is LockedThreadBindingRow {
  if (
    !binding ||
    binding.organizationId !== input.organizationId ||
    binding.copilotThreadId !== input.copilotThreadId ||
    binding.agentVersionId !== input.agentVersionId ||
    binding.interactionClass !== input.interactionClass
  ) {
    throw invalidExecutionScope();
  }
}

function findExistingExecution(
  client: ExecutionClient,
  input: CreateAgentExecutionInput,
): Promise<ExistingExecutionRow | null> {
  return client.agentExecution.findFirst({
    where: {
      organizationId: input.organizationId,
      copilotThreadId: input.copilotThreadId,
      aguiRunId: input.aguiRunId,
    },
    select: existingExecutionSelect,
  });
}

function resolveMatchingExecution(
  existing: ExistingExecutionRow,
  input: CreateAgentExecutionInput,
): { id: string } {
  if (
    existing.organizationId !== input.organizationId ||
    existing.threadBindingId !== input.threadBindingId ||
    existing.copilotThreadId !== input.copilotThreadId ||
    existing.aguiRunId !== input.aguiRunId ||
    existing.sessionId !== input.sessionId ||
    existing.sessionTaskId !== input.sessionTaskId ||
    existing.interactionClass !== input.interactionClass ||
    existing.agentVersionId !== input.agentVersionId ||
    existing.runtimeType !== input.runtimeType ||
    existing.modelIdentity !== input.modelIdentity ||
    existing.policySnapshotId !== input.policySnapshotId ||
    existing.attempt !== 1
  ) {
    throw executionIdempotencyConflict();
  }
  return { id: existing.id };
}

function invalidExecutionScope(): AgentOsBoundaryError {
  return new AgentOsBoundaryError(
    'interaction_execution_scope_invalid',
    'Interaction execution references do not belong to the requested control scope.',
  );
}

function executionIdempotencyConflict(): AgentOsBoundaryError {
  return new AgentOsBoundaryError(
    'interaction_execution_idempotency_conflict',
    'Interaction execution idempotency key already exists with different immutable fields.',
  );
}

function interactionBindingNotActive(): AgentOsBoundaryError {
  return new AgentOsBoundaryError(
    'interaction_binding_not_active',
    'Interaction binding was not found in scope or is not active.',
  );
}

function isExecutionIdempotencyUniqueError(error: unknown): boolean {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    error.code !== 'P2002'
  ) {
    return false;
  }
  if (!('meta' in error) || typeof error.meta !== 'object' || !error.meta) {
    return false;
  }
  const serializedMeta = JSON.stringify(error.meta);
  return (
    serializedMeta.includes('agent_executions_org_thread_agui_run_key') ||
    (
      serializedMeta.includes('organization_id') &&
      serializedMeta.includes('copilot_thread_id') &&
      serializedMeta.includes('agui_run_id')
    )
  );
}

function mapThreadBinding(binding: ThreadBindingRow): ThreadBinding {
  return {
    id: binding.id,
    copilotThreadId: binding.copilotThreadId,
    organizationId: binding.organizationId,
    userId: binding.userId,
    agentVersionId: binding.agentVersionId,
    interactionClass: interactionClass(binding.interactionClass),
    lifecycle: bindingLifecycle(binding.lifecycle),
    idleExpiresAt: binding.idleExpiresAt?.toISOString() ?? null,
    contextEpoch: binding.contextEpoch,
  };
}

function interactionClass(value: string): InteractionClass {
  if (value === 'quick_ask' || value === 'official_task') return value;
  throw new AgentOsBoundaryError(
    'interaction_class_invalid',
    `Unsupported persisted interaction class: ${value}`,
  );
}

function bindingLifecycle(
  value: string,
): ThreadBinding['lifecycle'] {
  if (
    value === 'active' ||
    value === 'archived' ||
    value === 'deleted' ||
    value === 'legal_hold'
  ) {
    return value;
  }
  throw new AgentOsBoundaryError(
    'interaction_binding_lifecycle_invalid',
    `Unsupported persisted interaction lifecycle: ${value}`,
  );
}
