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
    return archiveBinding(this.prisma, input);
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

  createExecution(input: CreateAgentExecutionInput): Promise<{ id: string }> {
    return this.prisma.$transaction(async (tx) => {
      const [binding, version, policySnapshot] = await Promise.all([
        tx.agentInteractionThreadBinding.findFirst({
          where: {
            id: input.threadBindingId,
            organizationId: input.organizationId,
            copilotThreadId: input.copilotThreadId,
            agentVersionId: input.agentVersionId,
            interactionClass: input.interactionClass,
            lifecycle: 'active',
          },
          select: { id: true },
        }),
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

      if (!binding || !version || !policySnapshot) {
        throw new AgentOsBoundaryError(
          'interaction_execution_scope_invalid',
          'Interaction execution references do not belong to the requested control scope.',
        );
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
          status: 'running',
        },
        select: { id: true },
      });
    }, TRANSACTION_OPTIONS);
  }

  async markExecutionTerminal(
    input: MarkAgentExecutionTerminalInput,
  ): Promise<void> {
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
        select: { id: true },
      });
      if (!execution) {
        throw new AgentOsBoundaryError(
          'interaction_usage_execution_not_found',
          'Interaction execution was not found in the requested organization.',
        );
      }

      await tx.agentExecutionUsage.create({
        data: {
          organizationId: input.organizationId,
          executionId: execution.id,
          modelIdentity: input.modelIdentity,
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
  client: BindingClient,
  input: ArchiveInteractionBindingInput,
): Promise<void> {
  const archived = await client.agentInteractionThreadBinding.updateMany({
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
    throw new AgentOsBoundaryError(
      'interaction_binding_not_active',
      'Interaction binding was not found in scope or is not active.',
    );
  }
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
