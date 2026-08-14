import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type {
  AgentConversationReplay,
  AgentSessionSummary,
  DashboardContext,
} from '@kiditem/shared/agent-interaction';
import {
  AgentDefinitionKeySchema,
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  AgentVersionKeySchema,
  CopilotThreadIdSchema,
  formatAgentConversationEventName,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  formatAgentVersionName,
  formatOrganizationName,
  formatUserName,
  NonNegativeDecimalSequenceSchema,
  OrganizationIdSchema,
  PositiveDecimalSequenceSchema,
  UserIdSchema,
} from '@kiditem/shared/identifiers';
import type {
  ActiveAgentVersionRecord,
  AgentInteractionRepositoryPort,
  AgentSessionRecord,
  AuthorizedExecutionRecord,
  ConversationEventPage,
} from '../../port/out/repository/agent-interaction-repository.port';
import * as interactionTokens from '../agent-interaction.tokens';
import { AgentInteractionIdentityService } from '../agent-interaction-identity.service';

const NOW = new Date('2026-08-13T00:00:00.000Z');
const ORGANIZATION_ID = 'organization-1';
const USER_ID = 'user-1';
const THREAD_ID = 'thread-1';
const RUN_ID = 'run-1';
const VERSION_ID = 'version-row-1';
const SESSION_ID = 'session-row-1';
const TASK_ID = 'task-row-1';
const EXECUTION_ID = 'execution-row-1';
const PRINCIPAL_KEY = Buffer.from('principal-key-that-is-at-least-32-bytes');
const RUN_INTENT_KEY = Buffer.from('run-intent-key-that-is-at-least-32-bytes');
const REPLAY_CURSOR_KEY = Buffer.from('replay-cursor-key-that-is-at-least-32-bytes');
const RUN_INTENT_DOMAIN = 'kiditem.agent-os.run-intent.v1';
const REPLAY_CURSOR_DOMAIN = 'kiditem.agent-os.replay-cursor.v1';

const organization = OrganizationIdSchema.parse(ORGANIZATION_ID);
const user = UserIdSchema.parse(USER_ID);
const agentDefinitionKey = AgentDefinitionKeySchema.parse('operator');
const agentVersion = AgentVersionKeySchema.parse('1');
const sessionName = formatAgentSessionName(
  organization,
  AgentSessionIdSchema.parse(SESSION_ID),
);
const taskName = formatAgentSessionTaskName(
  organization,
  AgentSessionIdSchema.parse(SESSION_ID),
  AgentSessionTaskIdSchema.parse(TASK_ID),
);
const executionName = formatAgentExecutionName(
  organization,
  AgentSessionIdSchema.parse(SESSION_ID),
  AgentExecutionIdSchema.parse(EXECUTION_ID),
);
const agentVersionName = formatAgentVersionName(agentDefinitionKey, agentVersion);

const identity = { organizationId: ORGANIZATION_ID, userId: USER_ID };
const dashboardContext: DashboardContext = {
  routeKey: 'analytics.dashboard',
  resourceRefs: [],
  filters: {},
  visibleRowIds: [],
  aggregateSummary: { inventoryItems: 7 },
  locale: 'ko-KR',
  timezone: 'Asia/Seoul',
};
const userEvent = {
  externalEventId: 'message-1',
  schemaVersion: 1 as const,
  payload: {
    phase: 'complete' as const,
    messageId: 'message-1',
    content: '재고 현황 알려줘',
  },
};

const activeVersion: ActiveAgentVersionRecord = {
  id: VERSION_ID,
  agentDefinitionKey: 'operator',
  version: 1,
  displayName: 'Operator',
  description: 'KidItem operator',
  runtimeType: 'copilotkit_agui',
  modelIdentity: 'gpt-5.4',
  capabilityKeys: [
    'agent_os.platform_probe',
    'analytics.readOverview',
    'sourcing.retrieveWorkspaceEvidence',
    'sourcing.inspectRecommendationRun',
  ],
  policyDocument: { mode: 'read_only' },
  activatedAt: NOW,
  retiredAt: null,
};

const session: AgentSessionRecord = {
  id: SESSION_ID,
  organizationId: ORGANIZATION_ID,
  createdByUserId: USER_ID,
  copilotThreadId: THREAD_ID,
  primaryAgentVersionId: VERSION_ID,
  authorityProfileVersionId: 'foundation_read_only_probe:v1',
  contextEpoch: 1,
  title: null,
  lastEventSequence: 1n,
  lifecycle: 'active',
  completedAt: null,
  cancelledAt: null,
  archivedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const userEventRecord = {
  id: 'event-row-1',
  organizationId: ORGANIZATION_ID,
  sessionId: SESSION_ID,
  executionId: EXECUTION_ID,
  aguiRunId: RUN_ID,
  externalEventId: userEvent.externalEventId,
  sequence: 1n,
  eventType: 'user_message' as const,
  schemaVersion: 1,
  payload: userEvent.payload,
  createdAt: NOW,
};

const authorized: AuthorizedExecutionRecord = {
  createdSession: true,
  session,
  rootTask: {
    id: TASK_ID,
    organizationId: ORGANIZATION_ID,
    sessionId: SESSION_ID,
    parentTaskId: null,
    assignedAgentVersionId: VERSION_ID,
    objective: null,
    isRoot: true,
    status: 'interpreting',
    idempotencyKey: 'root',
    createdAt: NOW,
    updatedAt: NOW,
    finishedAt: null,
  },
  contextEpoch: 1,
  policy: {
    id: 'policy-row-1',
    organizationId: ORGANIZATION_ID,
    sessionId: SESSION_ID,
    agentVersionId: VERSION_ID,
    authorityProfileVersionId: 'foundation_read_only_probe:v1',
    capabilityKeys: activeVersion.capabilityKeys,
    policyHash: 'a'.repeat(64),
    createdAt: NOW,
  },
  execution: {
    id: EXECUTION_ID,
    organizationId: ORGANIZATION_ID,
    sessionId: SESSION_ID,
    sessionTaskId: TASK_ID,
    copilotThreadId: THREAD_ID,
    aguiRunId: RUN_ID,
    agentVersionId: VERSION_ID,
    runtimeType: activeVersion.runtimeType,
    modelIdentity: activeVersion.modelIdentity,
    policySnapshotId: 'policy-row-1',
    inputHash: 'b'.repeat(64),
    currentInput: {},
    resourceRefs: [],
    attempt: 1,
    status: 'running',
    startedAt: NOW,
    finishedAt: null,
    errorCode: null,
  },
  userEvent: userEventRecord,
};

const listedSession: AgentSessionSummary = {
  name: sessionName,
  copilotThreadId: CopilotThreadIdSchema.parse(THREAD_ID),
  primaryAgentDefinitionKey: agentDefinitionKey,
  primaryAgentVersion: agentVersionName,
  lifecycle: 'active',
  updatedAt: NOW.toISOString(),
};

interface BuildOptions {
  versions?: ActiveAgentVersionRecord[];
  currentVersion?: ActiveAgentVersionRecord | null;
  accessibleSession?: AgentSessionRecord | null;
  sessions?: AgentSessionSummary[];
  page?: ConversationEventPage;
  authorize?: () => Promise<AuthorizedExecutionRecord>;
}

function buildService(options: BuildOptions = {}) {
  let clock = NOW;
  const versions = options.versions ?? [activeVersion];
  const repository = {
    listActiveAgentVersions: vi.fn(async () => versions),
    findActiveAgentVersion: vi.fn(async () =>
      options.currentVersion === undefined
        ? versions[0] ?? null
        : options.currentVersion,
    ),
    listSessions: vi.fn(async () => options.sessions ?? []),
    findAccessibleSession: vi.fn(async () =>
      options.accessibleSession === undefined ? session : options.accessibleSession,
    ),
    readConversationEvents: vi.fn(async () => options.page ?? ({
      events: [userEventRecord],
      lastSequence: 1n,
      hasMore: false,
    })),
    authorizeExecution: vi.fn(options.authorize ?? (async () => authorized)),
    appendExecutionEvent: vi.fn(),
    markExecutionTerminal: vi.fn(),
    recordExecutionUsage: vi.fn(),
    probeHealth: vi.fn(async () => undefined),
  } satisfies Partial<AgentInteractionRepositoryPort>;

  return {
    repository,
    setNow(value: Date) {
      clock = value;
    },
    service: new AgentInteractionIdentityService(
      repository as unknown as AgentInteractionRepositoryPort,
      () => clock,
      PRINCIPAL_KEY,
      RUN_INTENT_KEY,
      REPLAY_CURSOR_KEY,
    ),
  };
}

function prepareInput() {
  return {
    ...identity,
    agentDefinitionKey: 'operator',
    copilotThreadId: THREAD_ID,
    aguiRunId: RUN_ID,
    dashboardContext,
    userEvent,
  };
}

function authorizeInput(runIntent: string, overrides: Record<string, unknown> = {}) {
  return {
    runIntent,
    copilotThreadId: THREAD_ID,
    aguiRunId: RUN_ID,
    dashboardContext,
    userEvent,
    ...overrides,
  };
}

function decodeClaims(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString('utf8'));
}

function signClaims(
  claims: Record<string, unknown>,
  key: Buffer,
  domain: string,
): string {
  const encoded = Buffer.from(JSON.stringify(sortCanonical(claims))).toString('base64url');
  const signature = createHmac('sha256', key)
    .update(domain)
    .update('\0')
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortCanonical(nested)]),
    );
  }
  return value;
}

function expectNoWrites(repository: ReturnType<typeof buildService>['repository']) {
  expect(repository.authorizeExecution).not.toHaveBeenCalled();
  expect(repository.appendExecutionEvent).not.toHaveBeenCalled();
  expect(repository.markExecutionTerminal).not.toHaveBeenCalled();
  expect(repository.recordExecutionUsage).not.toHaveBeenCalled();
}

describe('AgentInteractionIdentityService canonical session authorization', () => {
  it('derives a stable opaque principal without leaking private owner IDs', () => {
    const { service } = buildService();
    const first = service.resolvePrincipal(identity);

    expect(service.resolvePrincipal(identity)).toEqual(first);
    expect(service.resolvePrincipal({ ...identity, userId: 'user-2' }).principalKey)
      .not.toBe(first.principalKey);
    expect(first.principalKey).not.toContain(ORGANIZATION_ID);
    expect(first.principalKey).not.toContain(USER_ID);
  });

  it('bootstraps canonical agents and read-only session summaries', async () => {
    const { repository, service } = buildService({ sessions: [listedSession] });

    await expect(service.bootstrap(identity)).resolves.toEqual({
      defaultAgentDefinitionKey: agentDefinitionKey,
      agents: [{
        agentDefinitionKey,
        agentVersion: agentVersionName,
        displayName: 'Operator',
        description: 'KidItem operator',
        isDefault: true,
      }],
      sessions: [listedSession],
    });
    expect(repository.listSessions).toHaveBeenCalledWith({ ...identity, limit: 50 });
    expectNoWrites(repository);
  });

  it.each([
    ['ambiguous operator', [activeVersion, { ...activeVersion, id: 'version-row-2', version: 2 }], 'AGENT_VERSION_AMBIGUOUS'],
    ['missing model', [{ ...activeVersion, modelIdentity: '' }], 'AGENT_MODEL_NOT_CONFIGURED'],
    ['missing runtime', [{ ...activeVersion, runtimeType: '' }], 'AGENT_RUNTIME_NOT_CONFIGURED'],
    ['missing exact profile', [{ ...activeVersion, capabilityKeys: [] }], 'AGENT_POLICY_NOT_CONFIGURED'],
  ] as const)('fails %s before reading sessions', async (_label, versions, code) => {
    const { repository, service } = buildService({ versions: [...versions] });

    await expect(service.bootstrap(identity)).rejects.toMatchObject({ code });
    expect(repository.listSessions).not.toHaveBeenCalled();
    expectNoWrites(repository);
  });

  it('signs a 30-second intent with canonical resource claims without writes', async () => {
    const { repository, service } = buildService();
    const intent = await service.prepareRunIntent(prepareInput());

    expect(intent).toEqual({
      runIntent: expect.any(String),
      expiresAt: '2026-08-13T00:00:30.000Z',
      copilotThreadId: THREAD_ID,
      aguiRunId: RUN_ID,
    });
    expect(decodeClaims(intent.runIntent)).toMatchObject({
      version: 1,
      organization: formatOrganizationName(organization),
      user: formatUserName(user),
      agentVersion: agentVersionName,
      copilotThreadId: THREAD_ID,
      aguiRunId: RUN_ID,
      expiresAtMs: NOW.getTime() + 30_000,
    });
    expectNoWrites(repository);
  });

  it.each([
    ['invalid dashboard context', { dashboardContext: { ...dashboardContext, routeKey: '' } }, 'INTERACTION_DASHBOARD_CONTEXT_INVALID'],
    ['invalid user event', { userEvent: { ...userEvent, payload: { ...userEvent.payload, content: '' } } }, 'INTERACTION_USER_EVENT_INVALID'],
  ])('rejects %s before signing', async (_label, override, code) => {
    const { repository, service } = buildService();
    await expect(service.prepareRunIntent({ ...prepareInput(), ...override }))
      .rejects.toMatchObject({ code });
    expectNoWrites(repository);
  });

  it('rejects malformed, tampered, expired, and mismatched intents before persistence', async () => {
    const built = buildService();
    const intent = await built.service.prepareRunIntent(prepareInput());
    const [body, signature] = intent.runIntent.split('.');
    const claims = decodeClaims(intent.runIntent);
    const invalidIntents = [
      'malformed',
      `${body}.${signature!.startsWith('a') ? 'b' : 'a'}${signature!.slice(1)}`,
      signClaims({ ...claims, unknown: true }, RUN_INTENT_KEY, RUN_INTENT_DOMAIN),
    ];

    for (const runIntent of invalidIntents) {
      await expect(built.service.authorizeRun(authorizeInput(runIntent)))
        .rejects.toMatchObject({ code: 'INTERACTION_RUN_INTENT_INVALID' });
    }
    await expect(built.service.authorizeRun(authorizeInput(intent.runIntent, {
      copilotThreadId: 'thread-2',
    }))).rejects.toMatchObject({ code: 'INTERACTION_RUN_INTENT_MISMATCH' });
    built.setNow(new Date(intent.expiresAt));
    await expect(built.service.authorizeRun(authorizeInput(intent.runIntent)))
      .rejects.toMatchObject({ code: 'INTERACTION_RUN_INTENT_EXPIRED' });
    expectNoWrites(built.repository);
  });

  it('rechecks the current agent then returns only canonical session/task/execution names', async () => {
    const { repository, service } = buildService();
    const intent = await service.prepareRunIntent(prepareInput());
    const result = await service.authorizeRun(authorizeInput(intent.runIntent));

    expect(result).toEqual({
      session: sessionName,
      task: taskName,
      execution: executionName,
      modelIdentity: activeVersion.modelIdentity,
      runtimeType: activeVersion.runtimeType,
      policySnapshotId: 'policy-row-1',
      contextEpoch: 1,
      dashboardContext,
    });
    expect(repository.authorizeExecution).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      agentVersionId: VERSION_ID,
      copilotThreadId: THREAD_ID,
      aguiRunId: RUN_ID,
      userEvent,
    }));
  });

  it.each([
    ['version', { version: 2 }],
    ['runtime', { runtimeType: 'different-runtime' }],
    ['model', { modelIdentity: 'different-model' }],
    ['policy', { policyDocument: { mode: 'different' } }],
    ['profile', { capabilityKeys: ['agent_os.platform_probe'] }],
    ['retirement', { retiredAt: NOW }],
  ])('rejects current %s drift before persistence', async (_label, change) => {
    const { repository, service } = buildService();
    const intent = await service.prepareRunIntent(prepareInput());
    repository.findActiveAgentVersion.mockResolvedValue({ ...activeVersion, ...change });

    await expect(service.authorizeRun(authorizeInput(intent.runIntent)))
      .rejects.toMatchObject({ code: 'INTERACTION_RUN_INTENT_STATE_MISMATCH' });
    expectNoWrites(repository);
  });

  it('returns a bounded canonical replay without creating an execution', async () => {
    const page: ConversationEventPage = {
      events: [userEventRecord],
      lastSequence: 1n,
      hasMore: false,
    };
    const { repository, service } = buildService({ page });
    const result = await service.authorizeConnection({
      ...identity,
      copilotThreadId: THREAD_ID,
      cursor: null,
    });
    const replay: AgentConversationReplay = {
      session: sessionName,
      events: [{
        name: formatAgentConversationEventName(
          organization,
          AgentSessionIdSchema.parse(SESSION_ID),
          PositiveDecimalSequenceSchema.parse('1'),
        ),
        session: sessionName,
        execution: executionName,
        aguiRunId: RUN_ID,
        sequence: PositiveDecimalSequenceSchema.parse('1'),
        eventType: 'user_message',
        schemaVersion: 1,
        payload: userEvent.payload,
        createdAt: NOW.toISOString(),
      }],
      nextCursor: null,
      lastSequence: NonNegativeDecimalSequenceSchema.parse('1'),
    };

    expect(result.authorization).toEqual({
      session: sessionName,
      contextEpoch: 1,
      replay: { nextCursor: null, lastSequence: '1' },
    });
    expect(result.replay).toEqual(replay);
    expect(result.liveJoinToken).toEqual(expect.any(String));
    expect(repository.readConversationEvents).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      sessionId: SESSION_ID,
      afterSequence: 0n,
      limit: 500,
    });
    expectNoWrites(repository);
  });

  it('uses a canonical replay cursor and rejects wrong ownership, expiry, and inactive sessions', async () => {
    const cursorClaims = {
      version: 1,
      organization: formatOrganizationName(organization),
      user: formatUserName(user),
      session: sessionName,
      copilotThreadId: THREAD_ID,
      afterSequence: '4',
      expiresAtMs: NOW.getTime() + 15 * 60_000,
    };
    const cursor = signClaims(cursorClaims, REPLAY_CURSOR_KEY, REPLAY_CURSOR_DOMAIN);
    const built = buildService({ page: { events: [], lastSequence: 4n, hasMore: false } });
    await built.service.authorizeConnection({ ...identity, copilotThreadId: THREAD_ID, cursor });
    expect(built.repository.readConversationEvents).toHaveBeenCalledWith(
      expect.objectContaining({ afterSequence: 4n }),
    );

    for (const invalid of [
      signClaims({ ...cursorClaims, session: formatAgentSessionName(organization, AgentSessionIdSchema.parse('session-row-2')) }, REPLAY_CURSOR_KEY, REPLAY_CURSOR_DOMAIN),
      signClaims({ ...cursorClaims, expiresAtMs: NOW.getTime() }, REPLAY_CURSOR_KEY, REPLAY_CURSOR_DOMAIN),
    ]) {
      const candidate = buildService();
      await expect(candidate.service.authorizeConnection({ ...identity, copilotThreadId: THREAD_ID, cursor: invalid }))
        .rejects.toBeDefined();
      expectNoWrites(candidate.repository);
    }
    const inactive = buildService({ accessibleSession: { ...session, lifecycle: 'archived' } });
    await expect(inactive.service.authorizeConnection({ ...identity, copilotThreadId: THREAD_ID }))
      .rejects.toMatchObject({ code: 'INTERACTION_CONNECTION_NOT_AUTHORIZED' });
    expect(inactive.repository.readConversationEvents).not.toHaveBeenCalled();
  });

  it('checks the active registry before health and retains only final token symbols', async () => {
    const healthy = buildService();
    await expect(healthy.service.health()).resolves.toEqual({ status: 'ok' });
    expect(healthy.repository.probeHealth).toHaveBeenCalledOnce();

    const unhealthy = buildService({ versions: [] });
    await expect(unhealthy.service.health()).rejects.toMatchObject({
      code: 'AGENT_OPERATOR_NOT_CONFIGURED',
    });
    expect(unhealthy.repository.probeHealth).not.toHaveBeenCalled();
    expect(Object.keys(interactionTokens).filter((key) => key.startsWith('INTERACTION_')).sort())
      .toEqual([
        'INTERACTION_CLOCK',
        'INTERACTION_GATEWAY_SHARED_SECRET',
        'INTERACTION_PRINCIPAL_HMAC_KEY',
        'INTERACTION_REPLAY_CURSOR_HMAC_KEY',
        'INTERACTION_RUN_INTENT_HMAC_KEY',
      ]);
  });

  it('contains no binding or Quick Ask retirement compatibility', () => {
    const source = readFileSync(
      resolve(__dirname, '..', 'agent-interaction-identity.service.ts'),
      'utf8',
    );
    for (const retired of [
      'AgentThreadBindingService',
      'QuickAsk',
      'quick_ask',
      'ThreadBinding',
      'AguiRunPreparation',
      'preparationToken',
      'idleExpiresAt',
      'withQuickAskLock',
      'INTERACTION_PREPARATION_HMAC_KEY',
      'INTERACTION_THREAD_ID_HMAC_KEY',
    ]) {
      expect(source).not.toContain(retired);
    }
  });
});
