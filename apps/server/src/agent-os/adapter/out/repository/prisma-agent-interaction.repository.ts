import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AgentConversationEventContentSchema,
  type AgentConversationEventContent,
} from '@kiditem/shared/agent-interaction';
import {
  AgentDefinitionKeySchema,
  AgentSessionIdSchema,
  AgentVersionKeySchema,
  CopilotThreadIdSchema,
  formatAgentSessionName,
  formatAgentVersionName,
  OrganizationIdSchema,
} from '@kiditem/shared/identifiers';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AgentOsBoundaryError } from '../../../domain/agent-os.errors';
import type {
  ActiveAgentVersionRecord,
  AgentConversationEventPayload,
  AgentConversationEventRecord,
  AgentExecutionRecord,
  AgentInteractionRepositoryPort,
  AgentExecutionRuntimeContext,
  CurrentAgentExecution,
  ModelConversationPage,
  AgentPolicySnapshotRecord,
  AgentSessionRecord,
  AgentSessionSummaryRecord,
  AgentSessionTaskRecord,
  AppendExecutionEventInput,
  AuthorizeAgentExecutionInput,
  AuthorizedExecutionRecord,
  ConversationEventPage,
  FindAccessibleAgentSessionInput,
  FindActiveAgentVersionInput,
  ListAgentSessionsInput,
  MarkAgentExecutionTerminalInput,
  ReadConversationEventsInput,
  RecordAgentExecutionUsageInput,
} from '../../../application/port/out/repository/agent-interaction-repository.port';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;
const MAX_SESSION_LIST_LIMIT = 100;
const MAX_REPLAY_LIMIT = 500;
const ROOT_TASK_IDEMPOTENCY_KEY = 'root';

const activeAgentVersionSelect = {
  id: true,
  agentDefinitionKey: true,
  version: true,
  displayName: true,
  description: true,
  runtimeType: true,
  modelIdentity: true,
  capabilityKeys: true,
  policyDocument: true,
  activatedAt: true,
  retiredAt: true,
} as const;

const sessionSelect = {
  id: true,
  organizationId: true,
  createdByUserId: true,
  copilotThreadId: true,
  primaryAgentVersionId: true,
  authorityProfileVersionId: true,
  contextEpoch: true,
  title: true,
  lastEventSequence: true,
  lifecycle: true,
  completedAt: true,
  cancelledAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const taskSelect = {
  id: true,
  organizationId: true,
  sessionId: true,
  parentTaskId: true,
  assignedAgentVersionId: true,
  objective: true,
  isRoot: true,
  status: true,
  idempotencyKey: true,
  createdAt: true,
  updatedAt: true,
  finishedAt: true,
} as const;

const policySelect = {
  id: true,
  organizationId: true,
  sessionId: true,
  agentVersionId: true,
  authorityProfileVersionId: true,
  capabilityKeys: true,
  policyHash: true,
  createdAt: true,
} as const;

const executionSelect = {
  id: true,
  organizationId: true,
  sessionId: true,
  sessionTaskId: true,
  copilotThreadId: true,
  aguiRunId: true,
  agentVersionId: true,
  runtimeType: true,
  modelIdentity: true,
  policySnapshotId: true,
  inputHash: true,
  currentInput: true,
  resourceRefs: true,
  attempt: true,
  status: true,
  startedAt: true,
  finishedAt: true,
  errorCode: true,
} as const;

const currentExecutionSelect = {
  id: true,
  organizationId: true,
  sessionId: true,
  copilotThreadId: true,
  aguiRunId: true,
  runtimeType: true,
  status: true,
  attempt: true,
  agentVersion: { select: { agentDefinitionKey: true } },
} as const;

type CurrentExecutionRow = Prisma.AgentExecutionGetPayload<{
  select: typeof currentExecutionSelect;
}>;

function mapCurrentExecution(execution: CurrentExecutionRow): CurrentAgentExecution {
  return {
    organizationId: execution.organizationId,
    agentDefinitionKey: execution.agentVersion.agentDefinitionKey,
    sessionId: execution.sessionId,
    executionId: execution.id,
    copilotThreadId: execution.copilotThreadId,
    aguiRunId: execution.aguiRunId,
    runtimeType: execution.runtimeType,
    status: execution.status,
    attempt: execution.attempt,
  };
}

const eventSelect = {
  id: true,
  organizationId: true,
  sessionId: true,
  executionId: true,
  execution: { select: { aguiRunId: true } },
  externalEventId: true,
  sequence: true,
  eventType: true,
  schemaVersion: true,
  payload: true,
  createdAt: true,
} as const;

type SessionRow = Prisma.AgentSessionGetPayload<{
  select: typeof sessionSelect;
}>;
type TaskRow = Prisma.AgentSessionTaskGetPayload<{ select: typeof taskSelect }>;
type PolicyRow = Prisma.AgentPolicySnapshotGetPayload<{
  select: typeof policySelect;
}>;
type ExecutionRow = Prisma.AgentExecutionGetPayload<{
  select: typeof executionSelect;
}>;
type EventRow = Prisma.AgentConversationEventGetPayload<{
  select: typeof eventSelect;
}>;

@Injectable()
export class PrismaAgentInteractionRepository
implements AgentInteractionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  listActiveAgentVersions(): Promise<ActiveAgentVersionRecord[]> {
    return this.prisma.agentVersion.findMany({
      where: { activatedAt: { not: null }, retiredAt: null },
      select: activeAgentVersionSelect,
      orderBy: [
        { agentDefinitionKey: 'asc' },
        { version: 'asc' },
        { id: 'asc' },
      ],
    }) as Promise<ActiveAgentVersionRecord[]>;
  }

  findActiveAgentVersion(
    input: FindActiveAgentVersionInput,
  ): Promise<ActiveAgentVersionRecord | null> {
    return this.prisma.agentVersion.findFirst({
      where: {
        id: input.agentVersionId,
        agentDefinitionKey: input.agentDefinitionKey,
        activatedAt: { not: null },
        retiredAt: null,
      },
      select: activeAgentVersionSelect,
    }) as Promise<ActiveAgentVersionRecord | null>;
  }

  async listSessions(
    input: ListAgentSessionsInput,
  ): Promise<AgentSessionSummaryRecord[]> {
    const sessions = await this.prisma.agentSession.findMany({
      where: {
        organizationId: input.organizationId,
        createdByUserId: input.userId,
      },
      select: {
        id: true,
        organizationId: true,
        copilotThreadId: true,
        lifecycle: true,
        updatedAt: true,
        primaryAgentVersion: {
          select: { agentDefinitionKey: true, version: true },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: boundedLimit(input.limit, MAX_SESSION_LIST_LIMIT),
    });

    return sessions.map((session) => ({
      name: formatAgentSessionName(
        OrganizationIdSchema.parse(session.organizationId),
        AgentSessionIdSchema.parse(session.id),
      ),
      copilotThreadId: CopilotThreadIdSchema.parse(session.copilotThreadId),
      primaryAgentDefinitionKey: AgentDefinitionKeySchema.parse(
        session.primaryAgentVersion.agentDefinitionKey,
      ),
      primaryAgentVersion: formatAgentVersionName(
        AgentDefinitionKeySchema.parse(
          session.primaryAgentVersion.agentDefinitionKey,
        ),
        AgentVersionKeySchema.parse(String(session.primaryAgentVersion.version)),
      ),
      lifecycle: sessionLifecycle(session.lifecycle),
      updatedAt: session.updatedAt.toISOString(),
    }));
  }

  async findAccessibleSession(
    input: FindAccessibleAgentSessionInput,
  ): Promise<AgentSessionRecord | null> {
    const session = await this.prisma.agentSession.findFirst({
      where: {
        organizationId: input.organizationId,
        createdByUserId: input.userId,
        copilotThreadId: input.copilotThreadId,
      },
      select: sessionSelect,
    });
    return session ? mapSession(session) : null;
  }

  async readConversationEvents(
    input: ReadConversationEventsInput,
  ): Promise<ConversationEventPage> {
    const session = await this.prisma.agentSession.findFirst({
      where: {
        id: input.sessionId,
        organizationId: input.organizationId,
        createdByUserId: input.userId,
      },
      select: { id: true, lastEventSequence: true },
    });
    if (!session) {
      return { events: [], lastSequence: 0n, hasMore: false };
    }

    const limit = boundedLimit(input.limit, MAX_REPLAY_LIMIT);
    const rows = await this.prisma.agentConversationEvent.findMany({
      where: {
        organizationId: input.organizationId,
        sessionId: session.id,
        sequence: { gt: input.afterSequence },
      },
      select: eventSelect,
      orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    const pageRows = rows.slice(0, limit);
    return {
      events: pageRows.map(mapEvent),
      lastSequence: pageRows.at(-1)?.sequence ?? input.afterSequence,
      hasMore: rows.length > limit,
    };
  }

  async authorizeExecution(
    unsafeInput: AuthorizeAgentExecutionInput,
  ): Promise<AuthorizedExecutionRecord> {
    const userEvent = validateConversationEventContent({
      eventType: 'user_message',
      schemaVersion: unsafeInput.userEvent.schemaVersion,
      payload: unsafeInput.userEvent.payload,
    });
    if (userEvent.eventType !== 'user_message') {
      throw interactionEventEnvelopeInvalid();
    }
    const input: AuthorizeAgentExecutionInput = {
      ...unsafeInput,
      capabilityKeys: [...unsafeInput.capabilityKeys],
      userEvent: {
        externalEventId: unsafeInput.userEvent.externalEventId,
        schemaVersion: userEvent.schemaVersion,
        payload: userEvent.payload,
      },
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
        await acquireAuthorizationLock(tx, input);
        await validateAuthorizationPrincipal(tx, input);

        let session = await lockSessionByThread(
          tx,
          input.organizationId,
          input.copilotThreadId,
        );
        let createdSession = false;
        let rootTask: TaskRow;

        if (session) {
          assertSessionAuthorizationScope(session, input);
          rootTask = await findRootTask(tx, session.id, input.organizationId);
          const existingExecution = await findExecutionByRun(tx, input);
          if (existingExecution) {
            return resolveExistingAuthorization(
              tx,
              input,
              session,
              rootTask,
              existingExecution,
            );
          }
          await validateAuthorizationAgent(tx, input);
        } else {
          await validateAuthorizationAgent(tx, input);
          await validateAuthorityProfile(tx, input);
          session = await tx.agentSession.create({
            data: {
              organizationId: input.organizationId,
              createdByUserId: input.userId,
              copilotThreadId: input.copilotThreadId,
              primaryAgentVersionId: input.agentVersionId,
              authorityProfileVersionId: input.authorityProfileVersionId,
              contextEpoch: 1,
              lifecycle: 'active',
            },
            select: sessionSelect,
          });
          createdSession = true;
          rootTask = await tx.agentSessionTask.create({
            data: {
              organizationId: input.organizationId,
              sessionId: session.id,
              assignedAgentVersionId: input.agentVersionId,
              objective: null,
              isRoot: true,
              status: 'interpreting',
              idempotencyKey: ROOT_TASK_IDEMPOTENCY_KEY,
            },
            select: taskSelect,
          });
          await tx.agentContextEpoch.create({
            data: {
              organizationId: input.organizationId,
              sessionId: session.id,
              epoch: 1,
            },
          });
        }

        const policy = await findOrCreatePolicySnapshot(tx, session.id, input);
        const execution = await tx.agentExecution.create({
          data: {
            organizationId: input.organizationId,
            sessionId: session.id,
            sessionTaskId: rootTask.id,
            copilotThreadId: input.copilotThreadId,
            aguiRunId: input.aguiRunId,
            agentVersionId: input.agentVersionId,
            runtimeType: input.runtimeType,
            modelIdentity: input.modelIdentity,
            policySnapshotId: policy.id,
            inputHash: input.inputHash,
            currentInput: (input.currentInput ?? {}) as Prisma.InputJsonValue,
            resourceRefs: (input.currentResourceRefs ?? []) as Prisma.InputJsonValue,
            attempt: 1,
            status: 'running',
          },
          select: executionSelect,
        });
        session = await incrementSessionSequence(tx, session);
        const userEvent = await tx.agentConversationEvent.create({
          data: {
            organizationId: input.organizationId,
            sessionId: session.id,
            executionId: execution.id,
            externalEventId: input.userEvent.externalEventId,
            sequence: session.lastEventSequence,
            eventType: 'user_message',
            schemaVersion: input.userEvent.schemaVersion,
            payload: input.userEvent.payload as Prisma.InputJsonValue,
          },
          select: eventSelect,
        });
        await tx.agentConversationOutbox.create({
          data: {
            organizationId: input.organizationId,
            eventId: userEvent.id,
          },
        });

        return mapAuthorization({
          createdSession,
          session,
          rootTask,
          policy,
          execution,
          userEvent,
        });
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      if (isPrismaCode(error, 'P2002')) throw interactionRunConflict();
      if (isPrismaCode(error, 'P2003')) throw interactionScopeInvalid();
      throw error;
    }
  }

  async appendExecutionEvent(
    unsafeInput: AppendExecutionEventInput,
  ): Promise<AgentConversationEventRecord> {
    const eventContent = validateConversationEventContent(unsafeInput);
    const input: AppendExecutionEventInput = {
      ...unsafeInput,
      terminal: unsafeInput.terminal
        ? {
            ...unsafeInput.terminal,
            finishedAt: new Date(unsafeInput.terminal.finishedAt),
          }
        : undefined,
      ...eventContent,
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
        let session = await lockSessionById(
          tx,
          input.organizationId,
          input.sessionId,
        );
        if (!session) throw interactionSessionNotFound();
        validateTerminalEnvelope(input);

        const existing = await findEventByExternalId(tx, input);
        if (existing) {
          await assertExistingAppendMatches(tx, existing, input);
          return mapEvent(existing);
        }

        const execution = await validateAppendExecution(tx, input);
        if (input.terminal && execution) {
          await transitionExecutionTerminal(tx, {
            organizationId: input.organizationId,
            id: execution.id,
            ...input.terminal,
          });
        }

        session = await incrementSessionSequence(tx, session);
        const event = await tx.agentConversationEvent.create({
          data: {
            organizationId: input.organizationId,
            sessionId: input.sessionId,
            executionId: input.executionId,
            externalEventId: input.externalEventId,
            sequence: session.lastEventSequence,
            eventType: input.eventType,
            schemaVersion: input.schemaVersion,
            payload: input.payload as Prisma.InputJsonValue,
          },
          select: eventSelect,
        });
        await tx.agentConversationOutbox.create({
          data: {
            organizationId: input.organizationId,
            eventId: event.id,
          },
        });
        return mapEvent(event);
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      if (isPrismaCode(error, 'P2002')) {
        const existing = await findEventByExternalId(this.prisma, input);
        if (!existing) throw interactionEventConflict();
        await assertExistingAppendMatches(this.prisma, existing, input);
        return mapEvent(existing);
      }
      if (isPrismaCode(error, 'P2003')) throw interactionScopeInvalid();
      throw error;
    }
  }

  async loadExecutionRuntimeContext(input: {
    executionId: string;
  }): Promise<AgentExecutionRuntimeContext | null> {
    const execution = await this.prisma.agentExecution.findUnique({
      where: { id: input.executionId },
      select: {
        id: true,
        organizationId: true,
        sessionId: true,
        sessionTaskId: true,
        copilotThreadId: true,
        aguiRunId: true,
        agentVersionId: true,
        runtimeType: true,
        modelIdentity: true,
        policySnapshotId: true,
        session: {
          select: {
            createdByUserId: true,
            contextEpoch: true,
            lifecycle: true,
          },
        },
        policySnapshot: { select: { capabilityKeys: true, policyHash: true } },
        agentVersion: { select: { agentDefinitionKey: true } },
      },
    });
    if (!execution) return null;
    const initialUserEvent = await this.prisma.agentConversationEvent.findFirst({
      where: {
        organizationId: execution.organizationId,
        sessionId: execution.sessionId,
        executionId: execution.id,
        eventType: 'user_message',
      },
      select: eventSelect,
      orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
    });
    if (!initialUserEvent) return null;
    return {
      organizationId: execution.organizationId,
      userId: execution.session.createdByUserId,
      agentDefinitionKey: execution.agentVersion.agentDefinitionKey,
      sessionId: execution.sessionId,
      sessionTaskId: execution.sessionTaskId,
      executionId: execution.id,
      copilotThreadId: execution.copilotThreadId,
      aguiRunId: execution.aguiRunId,
      agentVersionId: execution.agentVersionId,
      runtimeType: execution.runtimeType,
      modelIdentity: execution.modelIdentity,
      policySnapshotId: execution.policySnapshotId,
      policyHash: execution.policySnapshot.policyHash,
      contextEpoch: execution.session.contextEpoch,
      lifecycle: sessionLifecycle(execution.session.lifecycle),
      capabilityKeys: parseCapabilityKeys(execution.policySnapshot.capabilityKeys),
      initialUserEvent: mapEvent(initialUserEvent),
    };
  }

  async readModelConversation(input: {
    organizationId: string;
    sessionId: string;
    throughSequence: bigint;
    limit: number;
  }): Promise<ModelConversationPage> {
    const limit = boundedLimit(input.limit, MAX_REPLAY_LIMIT);
    const rows = await this.prisma.agentConversationEvent.findMany({
      where: {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        sequence: { lte: input.throughSequence },
      },
      select: eventSelect,
      orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    return {
      events: rows.slice(0, limit).map(mapEvent),
      hasMore: rows.length > limit,
    };
  }

  async findCurrentExecution(input: {
    executionId: string;
  }): Promise<CurrentAgentExecution | null> {
    const execution = await this.prisma.agentExecution.findUnique({
      where: { id: input.executionId },
      select: currentExecutionSelect,
    });
    return execution ? mapCurrentExecution(execution) : null;
  }

  async findAccessibleCurrentExecution(input: {
    organizationId: string;
    userId: string;
    sessionId: string;
    copilotThreadId: string;
  }): Promise<CurrentAgentExecution | null> {
    const execution = await this.prisma.agentExecution.findFirst({
      where: {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        copilotThreadId: input.copilotThreadId,
        status: 'running',
        session: { createdByUserId: input.userId },
      },
      select: currentExecutionSelect,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    });
    return execution ? mapCurrentExecution(execution) : null;
  }

  async findCurrentSessionExecution(input: {
    sessionId: string;
    copilotThreadId: string;
  }): Promise<CurrentAgentExecution | null> {
    const execution = await this.prisma.agentExecution.findFirst({
      where: {
        sessionId: input.sessionId,
        copilotThreadId: input.copilotThreadId,
        status: 'running',
      },
      select: currentExecutionSelect,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    });
    return execution ? mapCurrentExecution(execution) : null;
  }

  async markExecutionTerminal(
    input: MarkAgentExecutionTerminalInput,
  ): Promise<void> {
    validateTerminalState(input.status, input.errorCode);
    await this.prisma.$transaction(
      (tx) => transitionExecutionTerminal(tx, input),
      TRANSACTION_OPTIONS,
    );
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
          'INTERACTION_USAGE_EXECUTION_NOT_FOUND',
          'Interaction execution was not found in the requested organization.',
        );
      }
      if (input.modelIdentity !== execution.modelIdentity) {
        throw new AgentOsBoundaryError(
          'INTERACTION_USAGE_MODEL_MISMATCH',
          'Usage model identity does not match the canonical execution model.',
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

  async probeHealth(): Promise<void> {
    await this.prisma.agentVersion.count({
      where: { activatedAt: { not: null }, retiredAt: null },
    });
  }
}

function parseCapabilityKeys(value: Prisma.JsonValue): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.length === 0) ||
    new Set(value).size !== value.length
  ) {
    throw new AgentOsBoundaryError(
      'INTERACTION_POLICY_SNAPSHOT_INVALID',
      'The interaction policy snapshot has invalid capability keys.',
    );
  }
  return [...value] as string[];
}

async function acquireAuthorizationLock(
  tx: Prisma.TransactionClient,
  input: AuthorizeAgentExecutionInput,
): Promise<void> {
  const lockKey = JSON.stringify([
    'agent-interaction',
    'authorize-execution',
    input.organizationId,
    input.userId,
    input.copilotThreadId,
  ]);
  await tx.$queryRaw`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; transaction-only key includes organization, actor, and thread and reads no tenant row.
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
  `;
}

async function validateAuthorizationPrincipal(
  tx: Prisma.TransactionClient,
  input: AuthorizeAgentExecutionInput,
): Promise<void> {
  const membership = await tx.organizationMembership.findFirst({
    where: {
      organizationId: input.organizationId,
      userId: input.userId,
      status: 'active',
    },
    select: { id: true },
  });
  if (!membership) {
    throw new AgentOsBoundaryError(
      'INTERACTION_PRINCIPAL_NOT_ALLOWED',
      'The interaction principal is not an active organization member.',
    );
  }
}

async function validateAuthorizationAgent(
  tx: Prisma.TransactionClient,
  input: AuthorizeAgentExecutionInput,
): Promise<void> {
  const version = await tx.agentVersion.findFirst({
    where: {
      id: input.agentVersionId,
      runtimeType: input.runtimeType,
      modelIdentity: input.modelIdentity,
      activatedAt: { not: null },
      retiredAt: null,
    },
    select: { id: true },
  });
  if (!version) {
    throw new AgentOsBoundaryError(
      'INTERACTION_AGENT_NOT_ACTIVE',
      'The selected active agent version does not match runtime and model.',
    );
  }
}

async function lockSessionByThread(
  tx: Prisma.TransactionClient,
  organizationId: string,
  copilotThreadId: string,
): Promise<SessionRow | null> {
  const [locked] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id::text AS "id"
    FROM agent_sessions
    WHERE organization_id = ${organizationId}::uuid
      AND copilot_thread_id = ${copilotThreadId}
    FOR UPDATE
  `;
  if (!locked) return null;
  return tx.agentSession.findFirst({
    where: { id: locked.id, organizationId },
    select: sessionSelect,
  });
}

async function lockSessionById(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sessionId: string,
): Promise<SessionRow | null> {
  const [locked] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id::text AS "id"
    FROM agent_sessions
    WHERE id = ${sessionId}::uuid
      AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `;
  if (!locked) return null;
  return tx.agentSession.findFirst({
    where: { id: locked.id, organizationId },
    select: sessionSelect,
  });
}

function assertSessionAuthorizationScope(
  session: SessionRow,
  input: AuthorizeAgentExecutionInput,
): void {
  if (
    session.createdByUserId !== input.userId ||
    session.primaryAgentVersionId !== input.agentVersionId ||
    session.authorityProfileVersionId !== input.authorityProfileVersionId
  ) {
    throw interactionRunConflict();
  }
  if (session.lifecycle !== 'active') {
    throw new AgentOsBoundaryError(
      'INTERACTION_SESSION_NOT_ACTIVE',
      'The canonical interaction session is not active.',
    );
  }
}

async function findRootTask(
  tx: Prisma.TransactionClient,
  sessionId: string,
  organizationId: string,
): Promise<TaskRow> {
  const rootTask = await tx.agentSessionTask.findFirst({
    where: { sessionId, organizationId, isRoot: true },
    select: taskSelect,
  });
  if (!rootTask) {
    throw new AgentOsBoundaryError(
      'INTERACTION_ROOT_TASK_NOT_FOUND',
      'The canonical session root task is missing.',
    );
  }
  return rootTask;
}

function findExecutionByRun(
  client: Pick<Prisma.TransactionClient, 'agentExecution'>,
  input: AuthorizeAgentExecutionInput,
): Promise<ExecutionRow | null> {
  return client.agentExecution.findFirst({
    where: {
      organizationId: input.organizationId,
      copilotThreadId: input.copilotThreadId,
      aguiRunId: input.aguiRunId,
    },
    select: executionSelect,
  });
}

async function resolveExistingAuthorization(
  tx: Prisma.TransactionClient,
  input: AuthorizeAgentExecutionInput,
  session: SessionRow,
  rootTask: TaskRow,
  execution: ExecutionRow,
): Promise<AuthorizedExecutionRecord> {
  const [policy, userEvent] = await Promise.all([
    tx.agentPolicySnapshot.findFirst({
      where: {
        id: execution.policySnapshotId,
        organizationId: input.organizationId,
      },
      select: policySelect,
    }),
    tx.agentConversationEvent.findFirst({
      where: {
        organizationId: input.organizationId,
        sessionId: session.id,
        executionId: execution.id,
        eventType: 'user_message',
      },
      select: eventSelect,
      orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
    }),
  ]);
  if (!policy || !userEvent) throw interactionRunConflict();
  if (
    execution.organizationId !== input.organizationId ||
    execution.sessionId !== session.id ||
    execution.sessionTaskId !== rootTask.id ||
    execution.copilotThreadId !== input.copilotThreadId ||
    execution.aguiRunId !== input.aguiRunId ||
    execution.agentVersionId !== input.agentVersionId ||
    execution.runtimeType !== input.runtimeType ||
    execution.modelIdentity !== input.modelIdentity ||
    execution.inputHash !== input.inputHash ||
    execution.attempt !== 1 ||
    policy.sessionId !== session.id ||
    policy.agentVersionId !== input.agentVersionId ||
    policy.authorityProfileVersionId !== input.authorityProfileVersionId ||
    policy.policyHash !== input.policyHash ||
    !canonicalEqual(policy.capabilityKeys, input.capabilityKeys) ||
    userEvent.executionId !== execution.id ||
    userEvent.externalEventId !== input.userEvent.externalEventId ||
    userEvent.eventType !== 'user_message' ||
    userEvent.schemaVersion !== input.userEvent.schemaVersion ||
    !canonicalEqual(userEvent.payload, input.userEvent.payload)
  ) {
    throw interactionRunConflict();
  }
  return mapAuthorization({
    createdSession: false,
    session,
    rootTask,
    policy,
    execution,
    userEvent,
  });
}

async function findOrCreatePolicySnapshot(
  tx: Prisma.TransactionClient,
  sessionId: string,
  input: AuthorizeAgentExecutionInput,
): Promise<PolicyRow> {
  const existing = await tx.agentPolicySnapshot.findFirst({
    where: {
      organizationId: input.organizationId,
      sessionId,
      agentVersionId: input.agentVersionId,
      authorityProfileVersionId: input.authorityProfileVersionId,
      policyHash: input.policyHash,
    },
    select: policySelect,
  });
  if (existing) {
    if (!canonicalEqual(existing.capabilityKeys, input.capabilityKeys)) {
      throw interactionRunConflict();
    }
    return existing;
  }

  const id = deterministicUuid([
    'agent-policy-snapshot',
    input.organizationId,
    sessionId,
    input.agentVersionId,
    input.authorityProfileVersionId,
    input.policyHash,
    input.capabilityKeys,
  ]);
  return tx.agentPolicySnapshot.create({
    data: {
      id,
      organizationId: input.organizationId,
      sessionId,
      agentVersionId: input.agentVersionId,
      authorityProfileVersionId: input.authorityProfileVersionId,
      capabilityKeys: input.capabilityKeys,
      policyHash: input.policyHash,
    },
    select: policySelect,
  });
}

async function validateAuthorityProfile(
  tx: Prisma.TransactionClient,
  input: AuthorizeAgentExecutionInput,
): Promise<void> {
  const existing = await tx.agentAuthorityProfileVersion.findFirst({
    where: {
      id: input.authorityProfileVersionId,
      organizationId: input.organizationId,
    },
  });
  if (!existing) throw interactionScopeInvalid();
  if (
    !canonicalEqual(existing.capabilityKeys, input.capabilityKeys) ||
    !canonicalEqual(
      existing.policyDocument,
      input.authorityProfilePolicyDocument,
    ) ||
    existing.policyHash !== input.authorityProfilePolicyHash
  ) {
    throw interactionRunConflict();
  }
}

function incrementSessionSequence(
  tx: Prisma.TransactionClient,
  session: SessionRow,
): Promise<SessionRow> {
  return tx.agentSession.update({
    where: {
      id_organizationId: {
        id: session.id,
        organizationId: session.organizationId,
      },
    },
    data: { lastEventSequence: { increment: 1 } },
    select: sessionSelect,
  });
}

function findEventByExternalId(
  client: Pick<PrismaService, 'agentConversationEvent'>,
  input: Pick<AppendExecutionEventInput, 'organizationId' | 'externalEventId'>,
): Promise<EventRow | null> {
  return client.agentConversationEvent.findFirst({
    where: {
      organizationId: input.organizationId,
      externalEventId: input.externalEventId,
    },
    select: eventSelect,
  });
}

async function validateAppendExecution(
  tx: Prisma.TransactionClient,
  input: AppendExecutionEventInput,
): Promise<ExecutionRow | null> {
  if (!input.executionId) return null;
  const execution = await tx.agentExecution.findFirst({
    where: {
      id: input.executionId,
      organizationId: input.organizationId,
      sessionId: input.sessionId,
    },
    select: executionSelect,
  });
  if (!execution) throw interactionScopeInvalid();
  return execution;
}

function validateTerminalEnvelope(input: AppendExecutionEventInput): void {
  if (!input.terminal) {
    if (input.eventType === 'run_terminal') throw interactionTerminalInvalid();
    return;
  }
  if (!input.executionId || input.eventType !== 'run_terminal') {
    throw interactionTerminalInvalid();
  }
  validateTerminalState(input.terminal.status, input.terminal.errorCode);
  const payload = input.payload as Record<string, unknown>;
  if (
    payload.status !== input.terminal.status ||
    payload.errorCode !== input.terminal.errorCode
  ) {
    throw interactionTerminalInvalid();
  }
}

function validateConversationEventContent(input: {
  eventType: unknown;
  schemaVersion: unknown;
  payload: unknown;
}): AgentConversationEventContent {
  const parsed = AgentConversationEventContentSchema.safeParse({
    eventType: input.eventType,
    schemaVersion: input.schemaVersion,
    payload: input.payload,
  });
  if (!parsed.success) {
    throw interactionEventEnvelopeInvalid();
  }
  return parsed.data;
}

async function assertExistingAppendMatches(
  client: Pick<PrismaService, 'agentExecution'>,
  existing: EventRow,
  input: AppendExecutionEventInput,
): Promise<void> {
  if (
    existing.organizationId !== input.organizationId ||
    existing.sessionId !== input.sessionId ||
    existing.executionId !== input.executionId ||
    existing.externalEventId !== input.externalEventId ||
    existing.eventType !== input.eventType ||
    existing.schemaVersion !== input.schemaVersion ||
    !canonicalEqual(existing.payload, input.payload)
  ) {
    throw interactionEventConflict();
  }
  if (!input.terminal) return;
  const execution = await client.agentExecution.findFirst({
    where: {
      id: input.executionId ?? undefined,
      organizationId: input.organizationId,
      sessionId: input.sessionId,
    },
    select: { status: true, errorCode: true, finishedAt: true },
  });
  if (
    !execution ||
    execution.status !== input.terminal.status ||
    execution.errorCode !== input.terminal.errorCode ||
    execution.finishedAt?.getTime() !== input.terminal.finishedAt.getTime()
  ) {
    throw interactionEventConflict();
  }
}

async function transitionExecutionTerminal(
  tx: Pick<Prisma.TransactionClient, 'agentExecution'>,
  input: {
    organizationId: string;
    id: string;
    status: 'completed' | 'failed' | 'cancelled';
    errorCode: string | null;
    finishedAt: Date;
  },
): Promise<void> {
  validateTerminalState(input.status, input.errorCode);
  const updated = await tx.agentExecution.updateMany({
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
      'INTERACTION_EXECUTION_NOT_RUNNING',
      'Interaction execution was not found in scope or is already terminal.',
    );
  }
}

function validateTerminalState(status: string, errorCode: string | null): void {
  if (
    !['completed', 'failed', 'cancelled'].includes(status) ||
    (status === 'completed' && errorCode !== null)
  ) {
    throw interactionTerminalInvalid();
  }
}

function mapAuthorization(input: {
  createdSession: boolean;
  session: SessionRow;
  rootTask: TaskRow;
  policy: PolicyRow;
  execution: ExecutionRow;
  userEvent: EventRow;
}): AuthorizedExecutionRecord {
  return {
    createdSession: input.createdSession,
    session: mapSession(input.session),
    rootTask: mapTask(input.rootTask),
    contextEpoch: input.session.contextEpoch,
    policy: mapPolicy(input.policy),
    execution: mapExecution(input.execution),
    userEvent: mapEvent(input.userEvent),
  };
}

function mapSession(row: SessionRow): AgentSessionRecord {
  return { ...row, lifecycle: sessionLifecycle(row.lifecycle) };
}

function mapTask(row: TaskRow): AgentSessionTaskRecord {
  return row;
}

function mapPolicy(row: PolicyRow): AgentPolicySnapshotRecord {
  return row;
}

function mapExecution(row: ExecutionRow): AgentExecutionRecord {
  return row;
}

function mapEvent(row: EventRow): AgentConversationEventRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    sessionId: row.sessionId,
    executionId: row.executionId,
    aguiRunId: row.execution?.aguiRunId ?? null,
    externalEventId: row.externalEventId,
    sequence: row.sequence,
    eventType: conversationEventType(row.eventType),
    schemaVersion: row.schemaVersion,
    payload: row.payload as AgentConversationEventPayload,
    createdAt: row.createdAt,
  };
}

function sessionLifecycle(
  value: string,
): AgentSessionSummaryRecord['lifecycle'] {
  if (
    value === 'active' ||
    value === 'completed' ||
    value === 'cancelled' ||
    value === 'archived'
  ) {
    return value;
  }
  throw new AgentOsBoundaryError(
    'INTERACTION_SESSION_LIFECYCLE_INVALID',
    `Unsupported persisted session lifecycle: ${value}`,
  );
}

function conversationEventType(
  value: string,
): AgentConversationEventRecord['eventType'] {
  if (
    value === 'user_message' ||
    value === 'assistant_message' ||
    value === 'system_notice' ||
    value === 'tool_activity' ||
    value === 'state_snapshot' ||
    value === 'hitl_request' ||
    value === 'hitl_decision' ||
    value === 'run_terminal'
  ) {
    return value;
  }
  throw new AgentOsBoundaryError(
    'INTERACTION_EVENT_TYPE_INVALID',
    `Unsupported persisted conversation event type: ${value}`,
  );
}

function boundedLimit(value: number, maximum: number): number {
  if (!Number.isFinite(value)) return maximum;
  return Math.min(maximum, Math.max(1, Math.trunc(value)));
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw interactionEventConflict();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, item]) =>
      `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  throw interactionEventConflict();
}

function deterministicUuid(value: unknown): string {
  const bytes = createHash('sha256').update(canonicalJson(value)).digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

function interactionRunConflict(): AgentOsBoundaryError {
  return new AgentOsBoundaryError(
    'INTERACTION_RUN_CONFLICT',
    'The interaction run identity already exists with different immutable input.',
  );
}

function interactionEventConflict(): AgentOsBoundaryError {
  return new AgentOsBoundaryError(
    'INTERACTION_EVENT_CONFLICT',
    'The external event identity already exists with different immutable input.',
  );
}

function interactionEventEnvelopeInvalid(): AgentOsBoundaryError {
  return new AgentOsBoundaryError(
    'INTERACTION_EVENT_ENVELOPE_INVALID',
    'Interaction event type, schema version, and payload must match.',
  );
}

function interactionScopeInvalid(): AgentOsBoundaryError {
  return new AgentOsBoundaryError(
    'INTERACTION_SCOPE_INVALID',
    'Interaction graph references do not belong to the requested organization and session.',
  );
}

function interactionSessionNotFound(): AgentOsBoundaryError {
  return new AgentOsBoundaryError(
    'INTERACTION_SESSION_NOT_FOUND',
    'The interaction session was not found in the requested organization.',
  );
}

function interactionTerminalInvalid(): AgentOsBoundaryError {
  return new AgentOsBoundaryError(
    'INTERACTION_EXECUTION_TERMINAL_INVALID',
    'Terminal status, error, event payload, and execution identity must agree.',
  );
}
