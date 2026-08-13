import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardContext } from '@kiditem/shared/agent-interaction';
import type {
  ActiveAgentVersionRecord,
  AgentInteractionRepositoryPort,
  AgentSessionRecord,
  AuthorizedExecutionRecord,
  ConversationEventPage,
  CurrentAgentExecution,
} from '../../port/out/repository/agent-interaction-repository.port';
import * as interactionTokens from '../agent-interaction.tokens';
import { AgentInteractionIdentityService } from '../agent-interaction-identity.service';

const NOW = new Date('2026-08-13T00:00:00.000Z');
const ORGANIZATION_ID = 'organization-1';
const USER_ID = 'user-1';
const THREAD_ID = 'thread-1';
const RUN_ID = 'run-1';
const VERSION_ID = 'version-1';
const PRINCIPAL_KEY = Buffer.from('principal-key-that-is-at-least-32-bytes');
const RUN_INTENT_KEY = Buffer.from('run-intent-key-that-is-at-least-32-bytes');
const REPLAY_CURSOR_KEY = Buffer.from('replay-cursor-key-that-is-at-least-32-bytes');
const RUN_INTENT_DOMAIN = 'kiditem.agent-os.run-intent.v1';
const REPLAY_CURSOR_DOMAIN = 'kiditem.agent-os.replay-cursor.v1';

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
  payload: { messageId: 'message-1', content: '재고 현황 알려줘' },
};

const agentVersion: ActiveAgentVersionRecord = {
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
  id: 'session-1',
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

const authorization: AuthorizedExecutionRecord = {
  createdSession: true,
  session,
  rootTask: {
    id: 'task-1', organizationId: ORGANIZATION_ID, sessionId: session.id,
    parentTaskId: null, assignedAgentVersionId: VERSION_ID, objective: null,
    isRoot: true, status: 'interpreting', idempotencyKey: 'root',
    createdAt: NOW, updatedAt: NOW, finishedAt: null,
  },
  contextEpoch: 1,
  policy: {
    id: 'policy-1', organizationId: ORGANIZATION_ID, sessionId: session.id,
    agentVersionId: VERSION_ID,
    authorityProfileVersionId: 'foundation_read_only_probe:v1',
    capabilityKeys: [
      'agent_os.platform_probe',
      'analytics.readOverview',
      'sourcing.retrieveWorkspaceEvidence',
      'sourcing.inspectRecommendationRun',
    ], policyHash: 'policy-hash',
    createdAt: NOW,
  },
  execution: {
    id: 'execution-1', organizationId: ORGANIZATION_ID, sessionId: session.id,
    sessionTaskId: 'task-1', copilotThreadId: THREAD_ID, aguiRunId: RUN_ID,
    agentVersionId: VERSION_ID, runtimeType: 'copilotkit_agui',
    modelIdentity: 'gpt-5.4', policySnapshotId: 'policy-1',
    inputHash: 'input-hash', attempt: 1, status: 'running', startedAt: NOW,
    finishedAt: null, errorCode: null,
  },
  userEvent: {
    id: 'event-1', organizationId: ORGANIZATION_ID, sessionId: session.id,
    executionId: 'execution-1', externalEventId: userEvent.externalEventId,
    aguiRunId: RUN_ID,
    sequence: 1n, eventType: 'user_message', schemaVersion: 1,
    payload: userEvent.payload, createdAt: NOW,
  },
};

interface BuildOptions {
  versions?: ActiveAgentVersionRecord[];
  currentVersion?: ActiveAgentVersionRecord | null;
  accessibleSession?: AgentSessionRecord | null;
  page?: ConversationEventPage;
  authorize?: () => Promise<AuthorizedExecutionRecord>;
  currentExecution?: CurrentAgentExecution | null;
}

function buildService(options: BuildOptions = {}) {
  let clock = NOW;
  const versions = options.versions ?? [agentVersion];
  const repository = {
    listActiveAgentVersions: vi.fn(async () => versions),
    findActiveAgentVersion: vi.fn(async () =>
      options.currentVersion === undefined ? versions[0] ?? null : options.currentVersion),
    listSessions: vi.fn(async () => []),
    findAccessibleSession: vi.fn(async () =>
      options.accessibleSession === undefined ? session : options.accessibleSession),
    readConversationEvents: vi.fn(async () => options.page ?? ({
      events: [authorization.userEvent], lastSequence: 1n, hasMore: false,
    })),
    findAccessibleCurrentExecution: vi.fn(async () => options.currentExecution ?? null),
    authorizeExecution: vi.fn(options.authorize ?? (async () => authorization)),
    appendExecutionEvent: vi.fn(),
    markExecutionTerminal: vi.fn(),
    recordExecutionUsage: vi.fn(),
    probeHealth: vi.fn(async () => undefined),
  } satisfies Partial<AgentInteractionRepositoryPort>;

  return {
    repository,
    setNow(value: Date) { clock = value; },
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
    ...identity, agentDefinitionKey: 'operator', copilotThreadId: THREAD_ID,
    aguiRunId: RUN_ID, dashboardContext, userEvent,
  };
}

function authorizeInput(runIntent: string, overrides: Record<string, unknown> = {}) {
  return {
    runIntent, copilotThreadId: THREAD_ID, aguiRunId: RUN_ID,
    dashboardContext, userEvent, ...overrides,
  };
}

function decodeClaims(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
}

function signClaims(
  claims: Record<string, unknown>,
  key: Buffer,
  domain: string,
): string {
  const encoded = Buffer.from(JSON.stringify(sortCanonical(claims))).toString('base64url');
  const signature = createHmac('sha256', key)
    .update(domain).update('\0').update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortCanonical(nested)]));
  }
  return value;
}

async function prepared() {
  const built = buildService();
  const intent = await built.service.prepareRunIntent(prepareInput());
  return { ...built, intent };
}

function expectNoWrites(repository: ReturnType<typeof buildService>['repository']) {
  expect(repository.authorizeExecution).not.toHaveBeenCalled();
  expect(repository.appendExecutionEvent).not.toHaveBeenCalled();
  expect(repository.markExecutionTerminal).not.toHaveBeenCalled();
  expect(repository.recordExecutionUsage).not.toHaveBeenCalled();
}

describe('AgentInteractionIdentityService principal and bootstrap', () => {
  it('derives a stable opaque principal scoped by organization and user', () => {
    const { service } = buildService();
    const first = service.resolvePrincipal(identity);
    expect(service.resolvePrincipal(identity)).toEqual(first);
    expect(service.resolvePrincipal({ ...identity, userId: 'user-2' }).principalKey)
      .not.toBe(first.principalKey);
    expect(service.resolvePrincipal({ ...identity, organizationId: 'organization-2' }).principalKey)
      .not.toBe(first.principalKey);
    expect(first.principalKey).not.toContain(ORGANIZATION_ID);
    expect(first.principalKey).not.toContain(USER_ID);
  });

  it('bootstraps exactly the registered operator and recent sessions without writes', async () => {
    const unregistered = { ...agentVersion, id: 'other-1', agentDefinitionKey: 'not_registered' };
    const { repository, service } = buildService({ versions: [agentVersion, unregistered] });
    const result = await service.bootstrap(identity);
    expect(result).toEqual({
      defaultAgentDefinitionKey: 'operator',
      agents: [expect.objectContaining({ agentDefinitionKey: 'operator', isDefault: true })],
      sessions: [],
    });
    expect(repository.listSessions).toHaveBeenCalledWith({ ...identity, limit: 50 });
    expectNoWrites(repository);
  });

  it.each([
    ['ambiguous operator', [agentVersion, { ...agentVersion, id: 'version-2', version: 2 }], 'AGENT_VERSION_AMBIGUOUS'],
    ['missing operator model', [{ ...agentVersion, modelIdentity: '' }], 'AGENT_MODEL_NOT_CONFIGURED'],
    ['missing operator runtime', [{ ...agentVersion, runtimeType: '' }], 'AGENT_RUNTIME_NOT_CONFIGURED'],
    ['inactive operator', [{ ...agentVersion, retiredAt: NOW }], 'AGENT_OPERATOR_NOT_CONFIGURED'],
  ] as const)('rejects %s before session reads', async (_label, versions, code) => {
    const { repository, service } = buildService({ versions: [...versions] });
    await expect(service.bootstrap(identity)).rejects.toMatchObject({ code });
    expect(repository.listSessions).not.toHaveBeenCalled();
    expectNoWrites(repository);
  });
});

describe('AgentInteractionIdentityService run intent', () => {
  it('prepares an exact 30-second signed intent without writes', async () => {
    const { repository, service } = buildService();
    await expect(service.prepareRunIntent(prepareInput())).resolves.toEqual({
      runIntent: expect.any(String), expiresAt: '2026-08-13T00:00:30.000Z',
      copilotThreadId: THREAD_ID, aguiRunId: RUN_ID,
    });
    expectNoWrites(repository);
  });

  it.each([
    ['dashboard context', { dashboardContext: { ...dashboardContext, routeKey: '' } }, 'INTERACTION_DASHBOARD_CONTEXT_INVALID'],
    ['user event', { userEvent: { ...userEvent, payload: { ...userEvent.payload, content: '' } } }, 'INTERACTION_USER_EVENT_INVALID'],
  ])('rejects invalid %s without writes', async (_label, override, code) => {
    const { repository, service } = buildService();
    await expect(service.prepareRunIntent({ ...prepareInput(), ...override }))
      .rejects.toMatchObject({ code });
    expectNoWrites(repository);
  });

  it('rejects malformed, tampered, wrongly signed, and non-strict claims', async () => {
    const { repository, service, intent } = await prepared();
    const [body, signature] = intent.runIntent.split('.');
    const claims = decodeClaims(intent.runIntent);
    const candidates = [
      'malformed',
      `${body}.${signature.startsWith('a') ? 'b' : 'a'}${signature.slice(1)}`,
      signClaims(claims, Buffer.from('wrong-signature-key-at-least-32-bytes'), RUN_INTENT_DOMAIN),
      signClaims({ ...claims, unknownClaim: true }, RUN_INTENT_KEY, RUN_INTENT_DOMAIN),
    ];
    for (const runIntent of candidates) {
      await expect(service.authorizeRun(authorizeInput(runIntent)))
        .rejects.toMatchObject({ code: 'INTERACTION_RUN_INTENT_INVALID' });
    }
    expectNoWrites(repository);
  });

  it('rejects expiry at the exact boundary before authorization', async () => {
    const { repository, service, setNow, intent } = await prepared();
    setNow(new Date(intent.expiresAt));
    await expect(service.authorizeRun(authorizeInput(intent.runIntent)))
      .rejects.toMatchObject({ code: 'INTERACTION_RUN_INTENT_EXPIRED' });
    expectNoWrites(repository);
  });

  it.each([
    ['thread', { copilotThreadId: 'thread-2' }],
    ['run', { aguiRunId: 'run-2' }],
    ['context', { dashboardContext: { ...dashboardContext, locale: 'en-US' } }],
    ['external event id', { userEvent: { ...userEvent, externalEventId: 'message-2' } }],
    ['schema', { userEvent: { ...userEvent, schemaVersion: 2 } }],
    ['message id', { userEvent: { ...userEvent, payload: { ...userEvent.payload, messageId: 'message-2' } } }],
    ['content', { userEvent: { ...userEvent, payload: { ...userEvent.payload, content: 'changed' } } }],
  ])('rejects changed %s before repository authorization', async (_label, override) => {
    const { repository, service, intent } = await prepared();
    await expect(service.authorizeRun(authorizeInput(intent.runIntent, override)))
      .rejects.toBeDefined();
    expectNoWrites(repository);
  });

  it.each([
    ['identity', { id: 'version-2' }],
    ['definition', { agentDefinitionKey: 'other' }],
    ['version', { version: 2 }],
    ['runtime', { runtimeType: 'other_runtime' }],
    ['model', { modelIdentity: 'other-model' }],
    ['policy', { policyDocument: { mode: 'changed' } }],
    ['capability', { capabilityKeys: ['agent_os.other'] }],
    ['retirement', { retiredAt: NOW }],
  ])('rejects current exact-version %s drift before authorization', async (_label, change) => {
    const built = buildService();
    const intent = await built.service.prepareRunIntent(prepareInput());
    built.repository.findActiveAgentVersion.mockResolvedValue({ ...agentVersion, ...change });
    await expect(built.service.authorizeRun(authorizeInput(intent.runIntent)))
      .rejects.toMatchObject({ code: 'INTERACTION_RUN_INTENT_STATE_MISMATCH' });
    expectNoWrites(built.repository);
  });

  it('derives authority from verified claims and maps deterministic retries', async () => {
    const { repository, service, intent } = await prepared();
    const first = await service.authorizeRun(authorizeInput(intent.runIntent));
    const second = await service.authorizeRun(authorizeInput(intent.runIntent));
    expect(first).toEqual(second);
    expect(first).toEqual(expect.objectContaining({
      session: expect.objectContaining({ sessionId: 'session-1' }),
      sessionTaskId: 'task-1', executionId: 'execution-1',
      runtimeType: agentVersion.runtimeType, modelIdentity: agentVersion.modelIdentity,
      policySnapshotId: 'policy-1', contextEpoch: 1,
    }));
    expect(repository.authorizeExecution).toHaveBeenCalledTimes(2);
    expect(repository.authorizeExecution).toHaveBeenLastCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID, userId: USER_ID,
      copilotThreadId: THREAD_ID, aguiRunId: RUN_ID,
      agentVersionId: VERSION_ID, runtimeType: agentVersion.runtimeType,
      modelIdentity: agentVersion.modelIdentity,
      authorityProfileVersionId: 'foundation_read_only_probe:v1',
      capabilityKeys: [
        'agent_os.platform_probe',
        'analytics.readOverview',
        'sourcing.retrieveWorkspaceEvidence',
        'sourcing.inspectRecommendationRun',
      ],
      policyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      inputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      userEvent,
    }));
  });

  it('rejects an active Operator version that does not declare the exact immutable profile', async () => {
    const { repository, service } = buildService({
      versions: [{ ...agentVersion, capabilityKeys: ['agent_os.platform_probe'] }],
    });

    await expect(service.prepareRunIntent(prepareInput())).rejects.toMatchObject({
      code: 'AGENT_POLICY_NOT_CONFIGURED',
    });
    expectNoWrites(repository);
  });

  it('propagates a repository idempotency conflict', async () => {
    const conflict = new Error('execution idempotency conflict');
    const { repository, service } = buildService({ authorize: async () => { throw conflict; } });
    const intent = await service.prepareRunIntent(prepareInput());
    await expect(service.authorizeRun(authorizeInput(intent.runIntent))).rejects.toBe(conflict);
    expect(repository.authorizeExecution).toHaveBeenCalledTimes(1);
  });
});

describe('AgentInteractionIdentityService connection authorization', () => {
  it('grants only the canonical current running execution identity for reconnect and stop', async () => {
    const currentExecution = {
      organizationId: ORGANIZATION_ID, agentDefinitionKey: 'operator',
      sessionId: session.id, executionId: 'execution-1', copilotThreadId: THREAD_ID,
      aguiRunId: RUN_ID, runtimeType: 'copilotkit_agui', status: 'running', attempt: 2,
    };
    const { service } = buildService({ currentExecution });

    await expect(service.authorizeConnection({
      ...identity, copilotThreadId: THREAD_ID, cursor: null,
    })).resolves.toMatchObject({
      currentExecution: {
        agentDefinitionKey: 'operator', sessionId: session.id,
        executionId: 'execution-1', copilotThreadId: THREAD_ID,
        aguiRunId: RUN_ID, status: 'running', attempt: 2,
      },
    });
  });

  it('reads an active session from sequence zero and maps the strict wire envelope read-only', async () => {
    const { repository, service } = buildService();
    const result = await service.authorizeConnection({ ...identity, copilotThreadId: THREAD_ID, cursor: null });
    expect(repository.readConversationEvents).toHaveBeenCalledWith({
      ...identity, sessionId: session.id, afterSequence: 0n, limit: 500,
    });
    expect(result).toEqual({
      currentExecution: null,
      session: {
        sessionId: session.id, copilotThreadId: THREAD_ID,
        primaryAgentDefinitionKey: 'operator', primaryAgentVersionId: VERSION_ID,
        lifecycle: 'active', updatedAt: NOW.toISOString(),
      },
      contextEpoch: 1,
      replay: {
        sessionId: session.id,
        events: [{
          eventId: 'event-1', sessionId: session.id, executionId: 'execution-1',
          aguiRunId: RUN_ID,
          sequence: '1', eventType: 'user_message', schemaVersion: 1,
          payload: userEvent.payload, createdAt: NOW.toISOString(),
        }],
        nextCursor: null, lastSequence: '1',
      },
      liveJoinToken: expect.any(String),
      liveJoinExpiresAt: '2026-08-13T00:00:15.000Z',
    });
    const repeated = await service.authorizeConnection({ ...identity, copilotThreadId: THREAD_ID, cursor: null });
    expect(repeated.liveJoinToken).toBe(result.liveJoinToken);
    expect(decodeClaims(result.liveJoinToken!)).toMatchObject({
      afterSequence: '1',
    });
    expectNoWrites(repository);
  });

  it('paginates actual events at the last delivered sequence and withholds live join until history is exhausted', async () => {
    const secondEvent = {
      ...authorization.userEvent,
      id: 'event-2',
      sequence: 2n,
      eventType: 'assistant_message' as const,
      payload: { messageId: 'message-2', content: 'answer-2' },
    };
    const thirdEvent = {
      ...secondEvent,
      id: 'event-3',
      sequence: 3n,
      payload: { messageId: 'message-3', content: 'answer-3' },
    };
    const first = buildService({
      page: {
        events: [authorization.userEvent, secondEvent],
        lastSequence: 2n,
        hasMore: true,
      },
    });
    const result = await first.service.authorizeConnection({ ...identity, copilotThreadId: THREAD_ID });
    expect(result.replay.events.map((event) => event.sequence)).toEqual(['1', '2']);
    expect(result.replay.nextCursor).toEqual(expect.any(String));
    expect(decodeClaims(result.replay.nextCursor!)).toMatchObject({
      organizationId: ORGANIZATION_ID, userId: USER_ID, sessionId: session.id,
      copilotThreadId: THREAD_ID, afterSequence: '2',
      expiresAtMs: NOW.getTime() + 15 * 60_000,
    });
    expect(result.liveJoinToken).toBeNull();
    expect(result.liveJoinExpiresAt).toBeNull();

    const second = buildService({
      page: { events: [thirdEvent], lastSequence: 3n, hasMore: false },
    });
    const final = await second.service.authorizeConnection({
      ...identity,
      copilotThreadId: THREAD_ID,
      cursor: result.replay.nextCursor,
    });
    expect(final.replay).toMatchObject({
      events: [expect.objectContaining({ sequence: '3' })],
      nextCursor: null,
      lastSequence: '3',
    });
    expect(final.liveJoinToken).toEqual(expect.any(String));
    expect(final.liveJoinExpiresAt).toBe('2026-08-13T00:00:15.000Z');
    expect(decodeClaims(final.liveJoinToken!)).toMatchObject({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      sessionId: session.id,
      copilotThreadId: THREAD_ID,
      contextEpoch: 1,
      afterSequence: '3',
    });
  });

  it.each(['completed', 'cancelled', 'archived'] as const)(
    'rejects a %s session before event reads', async (lifecycle) => {
      const { repository, service } = buildService({ accessibleSession: { ...session, lifecycle } });
      await expect(service.authorizeConnection({ ...identity, copilotThreadId: THREAD_ID }))
        .rejects.toMatchObject({ code: 'INTERACTION_CONNECTION_NOT_AUTHORIZED' });
      expect(repository.readConversationEvents).not.toHaveBeenCalled();
      expectNoWrites(repository);
    },
  );

  it('rejects tampered, cross-scope, cross-session, and expired cursors', async () => {
    const base = {
      version: 1, organizationId: ORGANIZATION_ID, userId: USER_ID,
      sessionId: session.id, copilotThreadId: THREAD_ID, afterSequence: '4',
      expiresAtMs: NOW.getTime() + 15 * 60_000,
    };
    const valid = signClaims(base, REPLAY_CURSOR_KEY, REPLAY_CURSOR_DOMAIN);
    const candidates = [
      `${valid.slice(0, -1)}${valid.endsWith('a') ? 'b' : 'a'}`,
      signClaims({ ...base, organizationId: 'organization-2' }, REPLAY_CURSOR_KEY, REPLAY_CURSOR_DOMAIN),
      signClaims({ ...base, userId: 'user-2' }, REPLAY_CURSOR_KEY, REPLAY_CURSOR_DOMAIN),
      signClaims({ ...base, sessionId: 'session-2' }, REPLAY_CURSOR_KEY, REPLAY_CURSOR_DOMAIN),
      signClaims({ ...base, expiresAtMs: NOW.getTime() }, REPLAY_CURSOR_KEY, REPLAY_CURSOR_DOMAIN),
    ];
    for (const cursor of candidates) {
      const { repository, service } = buildService();
      await expect(service.authorizeConnection({ ...identity, copilotThreadId: THREAD_ID, cursor }))
        .rejects.toBeDefined();
      expect(repository.readConversationEvents).not.toHaveBeenCalled();
      expectNoWrites(repository);
    }
  });

  it('resumes a valid cursor at its signed sequence', async () => {
    const cursor = signClaims({
      version: 1, organizationId: ORGANIZATION_ID, userId: USER_ID,
      sessionId: session.id, copilotThreadId: THREAD_ID, afterSequence: '4',
      expiresAtMs: NOW.getTime() + 15 * 60_000,
    }, REPLAY_CURSOR_KEY, REPLAY_CURSOR_DOMAIN);
    const { repository, service } = buildService({ page: { events: [], lastSequence: 4n, hasMore: false } });
    await service.authorizeConnection({ ...identity, copilotThreadId: THREAD_ID, cursor });
    expect(repository.readConversationEvents).toHaveBeenCalledWith(expect.objectContaining({ afterSequence: 4n }));
    expectNoWrites(repository);
  });
});

describe('AgentInteractionIdentityService health and retirement guards', () => {
  it('checks the active registry before probing repository health', async () => {
    const healthy = buildService();
    await expect(healthy.service.health()).resolves.toEqual({ status: 'ok' });
    expect(healthy.repository.probeHealth).toHaveBeenCalledTimes(1);

    const unhealthy = buildService({ versions: [] });
    await expect(unhealthy.service.health()).rejects.toMatchObject({ code: 'AGENT_OPERATOR_NOT_CONFIGURED' });
    expect(unhealthy.repository.probeHealth).not.toHaveBeenCalled();
  });

  it('exports only final interaction token symbols', () => {
    expect(Object.keys(interactionTokens).filter((key) => key.startsWith('INTERACTION_')).sort())
      .toEqual([
        'INTERACTION_CLOCK', 'INTERACTION_GATEWAY_SHARED_SECRET',
        'INTERACTION_PRINCIPAL_HMAC_KEY', 'INTERACTION_REPLAY_CURSOR_HMAC_KEY',
        'INTERACTION_RUN_INTENT_HMAC_KEY',
      ]);
    const source = readFileSync(fileURLToPath(new URL('../agent-interaction.tokens.ts', import.meta.url)), 'utf8');
    expect(source).not.toMatch(/INTERACTION_(?:PREPARATION|THREAD_ID)_HMAC_KEY/);
  });

  it('contains no retired interaction architecture in production identity source', () => {
    const source = readFileSync(fileURLToPath(new URL('../agent-interaction-identity.service.ts', import.meta.url)), 'utf8');
    for (const retired of [
      'AgentThreadBindingService', 'QuickAsk', 'quick_ask', 'ThreadBinding',
      'AguiRunPreparation', 'preparationToken', 'idleExpiresAt', 'withQuickAskLock',
      'INTERACTION_PREPARATION_HMAC_KEY', 'INTERACTION_THREAD_ID_HMAC_KEY',
    ]) {
      expect(source).not.toContain(retired);
    }
  });
});
