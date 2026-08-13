import { describe, expect, it } from 'vitest';
import {
  AguiConnectionAuthorizationSchema,
  AguiRunAuthorizationSchema,
  AguiRunPreparationSchema,
  DashboardContextSchema,
  InteractionBootstrapSchema,
  InteractionPrincipalSchema,
} from './index';

const agents = [
  {
    agentDefinitionKey: 'operator',
    agentVersionId: 'operator-v1',
    displayName: 'Operator',
    description: 'KidItem operator',
    isDefault: true,
    supportsQuickAsk: true,
  },
  {
    agentDefinitionKey: 'analyst',
    agentVersionId: 'analyst-v1',
    displayName: 'Analyst',
    description: 'KidItem analyst',
    isDefault: false,
    supportsQuickAsk: true,
  },
] as const;

const threadTargets = [
  {
    agentDefinitionKey: 'operator',
    agentVersionId: 'operator-v1',
    copilotThreadId: '550e8400-e29b-41d4-a716-446655440000',
    hasExplicitThreadId: false,
    interactionClass: 'quick_ask',
    refreshAt: null,
  },
  {
    agentDefinitionKey: 'analyst',
    agentVersionId: 'analyst-v1',
    copilotThreadId: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
    hasExplicitThreadId: true,
    interactionClass: 'official_task',
    refreshAt: '2026-08-13T08:00:00.000Z',
  },
] as const;

const validBootstrap = {
  defaultAgentDefinitionKey: 'operator',
  agents,
  threadTargets,
} as const;

const binding = {
  id: 'binding-1',
  copilotThreadId: 'thread-1',
  organizationId: 'org-1',
  userId: 'user-1',
  agentVersionId: 'operator-v1',
  interactionClass: 'quick_ask',
  lifecycle: 'active',
  idleExpiresAt: '2026-08-13T08:00:00.000Z',
  contextEpoch: 2,
} as const;

const dashboardContext = {
  routeKey: 'analytics.dashboard',
  resourceRefs: [{ kind: 'product', id: 'product-1', version: '7' }],
  filters: { status: ['ready'], page: 2, active: true },
  visibleRowIds: ['product-1'],
  aggregateSummary: { total: 1, sampled: true, note: null },
  locale: 'ko-KR',
  timezone: 'Asia/Seoul',
} as const;

const validRunAuthorization = {
  binding,
  interactionClass: 'quick_ask',
  modelIdentity: 'gpt-5',
  runtimeType: 'ag-ui',
  policySnapshotId: 'policy-1',
  dashboardContext,
} as const;

const validRunPreparation = {
  preparationToken: 'preparation-token-that-is-long-enough',
  expiresAt: '2026-08-13T08:00:00.000Z',
  copilotThreadId: '550e8400-e29b-41d4-a716-446655440000',
  archive: null,
} as const;

const validConnectionAuthorization = {
  binding,
  interactionClass: 'quick_ask',
  contextEpoch: 2,
} as const;

describe('agent interaction contracts', () => {
  it('strips untrusted browser authority while accepting canonical dashboard context', () => {
    const context = DashboardContextSchema.parse({
      ...dashboardContext,
      organizationId: 'attacker-org',
      permissions: ['admin'],
    });

    expect(context).toEqual(dashboardContext);
    expect(context).not.toHaveProperty('organizationId');
    expect(context).not.toHaveProperty('permissions');
  });

  it('requires every server-derived principal field', () => {
    expect(
      InteractionPrincipalSchema.parse({
        principalKey: 'principal-1',
        userId: 'user-1',
        organizationId: 'org-1',
      }),
    ).toEqual({
      principalKey: 'principal-1',
      userId: 'user-1',
      organizationId: 'org-1',
    });

    for (const incompletePrincipal of [
      { userId: 'user-1', organizationId: 'org-1' },
      { principalKey: 'principal-1', organizationId: 'org-1' },
      { principalKey: 'principal-1', userId: 'user-1' },
    ]) {
      expect(() => InteractionPrincipalSchema.parse(incompletePrincipal)).toThrow();
    }
  });

  it('requires explicit model and runtime identity on otherwise-valid run authorization', () => {
    const { modelIdentity: _modelIdentity, ...missingModelIdentity } =
      validRunAuthorization;
    const { runtimeType: _runtimeType, ...missingRuntimeType } = validRunAuthorization;

    expect(() => AguiRunAuthorizationSchema.parse(missingModelIdentity)).toThrow(
      /modelIdentity/,
    );
    expect(() => AguiRunAuthorizationSchema.parse(missingRuntimeType)).toThrow(
      /runtimeType/,
    );
  });

  it('rejects an invalid preparation thread UUID and serialized expiry datetime', () => {
    expect(() =>
      AguiRunPreparationSchema.parse({
        ...validRunPreparation,
        copilotThreadId: 'forged',
      }),
    ).toThrow(/uuid/i);
    expect(() =>
      AguiRunPreparationSchema.parse({
        ...validRunPreparation,
        expiresAt: 'tomorrow',
      }),
    ).toThrow(/datetime/i);
  });

  it('requires binding control context on otherwise-valid connection authorization', () => {
    const { binding: _binding, ...missingBinding } = validConnectionAuthorization;

    expect(() => AguiConnectionAuthorizationSchema.parse(missingBinding)).toThrow(
      /binding/,
    );
  });

  it('rejects unknown authority fields on strict server contracts', () => {
    expect(() =>
      InteractionPrincipalSchema.parse({
        principalKey: 'principal-1',
        userId: 'user-1',
        organizationId: 'org-1',
        permissions: ['admin'],
      }),
    ).toThrow();

    expect(() =>
      AguiRunAuthorizationSchema.parse({
        binding,
        interactionClass: 'quick_ask',
        modelIdentity: 'gpt-5',
        runtimeType: 'ag-ui',
        policySnapshotId: 'policy-1',
        dashboardContext,
        organizationId: 'attacker-org',
      }),
    ).toThrow();
  });

  it('accepts exactly one matching default and one thread target per allowed agent', () => {
    expect(InteractionBootstrapSchema.parse(validBootstrap)).toEqual(validBootstrap);
  });

  it('rejects missing, duplicate, and mismatched bootstrap defaults', () => {
    const invalidDefaults = [
      {
        ...validBootstrap,
        agents: agents.map((agent) => ({ ...agent, isDefault: false })),
      },
      {
        ...validBootstrap,
        agents: agents.map((agent) => ({ ...agent, isDefault: true })),
      },
      { ...validBootstrap, defaultAgentDefinitionKey: 'analyst' },
    ];

    for (const bootstrap of invalidDefaults) {
      expect(() => InteractionBootstrapSchema.parse(bootstrap)).toThrow(
        'bootstrap requires exactly one matching default agent',
      );
    }
  });

  it('rejects missing, duplicate, and mismatched bootstrap thread targets', () => {
    const invalidTargets = [
      { ...validBootstrap, threadTargets: threadTargets.slice(0, 1) },
      { ...validBootstrap, threadTargets: [threadTargets[0], threadTargets[0]] },
      {
        ...validBootstrap,
        threadTargets: [
          threadTargets[0],
          { ...threadTargets[1], agentDefinitionKey: 'unavailable-agent' },
        ],
      },
    ];

    for (const bootstrap of invalidTargets) {
      expect(() => InteractionBootstrapSchema.parse(bootstrap)).toThrow(
        'bootstrap requires exactly one target per allowed agent',
      );
    }
  });

  it('rejects thread targets with wrong or swapped agent versions', () => {
    expect(() =>
      InteractionBootstrapSchema.parse({
        ...validBootstrap,
        threadTargets: [
          { ...threadTargets[0], agentVersionId: 'analyst-v1' },
          { ...threadTargets[1], agentVersionId: 'operator-v1' },
        ],
      }),
    ).toThrow('bootstrap requires exactly one target per allowed agent');
  });

  it('rejects duplicate allowed-agent identities even with extra unrelated targets', () => {
    expect(() =>
      InteractionBootstrapSchema.parse({
        ...validBootstrap,
        agents: [agents[0], { ...agents[0], isDefault: false }],
      }),
    ).toThrow('bootstrap requires exactly one target per allowed agent');
  });

  it('requires connection authorization to match binding class and epoch', () => {
    expect(
      AguiConnectionAuthorizationSchema.parse({
        ...validConnectionAuthorization,
      }),
    ).toEqual(validConnectionAuthorization);

    for (const authorization of [
      { binding, interactionClass: 'official_task', contextEpoch: 2 },
      { binding, interactionClass: 'quick_ask', contextEpoch: 3 },
    ]) {
      expect(() => AguiConnectionAuthorizationSchema.parse(authorization)).toThrow(
        'connection authorization must match its binding',
      );
    }
  });
});
