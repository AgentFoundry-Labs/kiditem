import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentRosterResponseSchema } from '@kiditem/shared/agent-os';
import type { AgentInstanceRecord } from '../../../domain/agent-os.types';
import { AgentCatalogService } from '../agent-catalog.service';

const ORG = '11111111-1111-1111-1111-111111111111';
const CANONICAL_TYPES = [
  'manager',
  'rules_evaluation',
  'rules_suggest',
  'ad_strategy',
  'chat',
  'sourcing',
  'listing',
  'thumbnail_analyst',
  'order',
  'channel_registration',
] as const;

function instance(type: string, id = `instance-${type}`): AgentInstanceRecord {
  return {
    id,
    organizationId: ORG,
    type,
    name: type,
    role: 'specialist',
    title: null,
    icon: null,
    reportsToId: null,
    lifecycleStatus: 'active',
    pauseReason: null,
    trustLevel: 0,
    adapterType: 'gemini_image',
    modelOverride: null,
    adapterConfig: {},
    runtimeConfig: {},
    promptPathOverride: null,
  };
}

describe('AgentCatalogService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('lists code-owned Agent OS skills', () => {
    const service = new AgentCatalogService({} as never, {} as never);

    expect(service.listSkills()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'sourcing.magic_scraper',
          skillPath: 'tools/codex/skills/magic-scraper/SKILL.md',
          allowedAgentTypes: ['sourcing'],
          mode: 'development_workflow',
        }),
      ]),
    );
  });

  it('hides persisted instances whose agent definition is no longer registered', async () => {
    const repository = {
      listInstances: vi.fn().mockResolvedValue([
        instance('detail_page_generate'),
        instance('thumbnail_auto_edit'),
      ]),
    };
    const service = new AgentCatalogService(repository as never, {} as never);

    const instances = await service.listInstances({ organizationId: ORG });

    expect(repository.listInstances).toHaveBeenCalledWith({ organizationId: ORG });
    expect(instances.map((agentInstance) => agentInstance.type)).toEqual([]);
  });

  it('returns every active definition when the organization has no instances', async () => {
    const repository = { listInstances: vi.fn().mockResolvedValue([]) };
    const service = new AgentCatalogService(repository as never, {} as never);

    const roster = await service.listRoster({ organizationId: ORG });

    expect(repository.listInstances).toHaveBeenCalledWith({ organizationId: ORG });
    expect(roster.items.map((item) => item.definition.type)).toEqual(CANONICAL_TYPES);
    expect(roster.items.filter((item) =>
      item.definition.operationalRole === 'employee',
    )).toHaveLength(7);
    expect(roster.items.filter((item) =>
      item.definition.operationalRole === 'capability',
    )).toHaveLength(3);
    expect(roster.items.every((item) =>
      item.configurationStatus === 'instance_missing' && item.runtime === null,
    )).toBe(true);
    expect(AgentRosterResponseSchema.parse(roster)).toEqual(roster);
  });

  it('overlays focused runtime state without exposing stale roster fields', async () => {
    vi.stubEnv('AGENT_DEFAULT_MODEL', 'gpt-5.4');
    const repository = {
      listInstances: vi.fn().mockResolvedValue([
        {
          ...instance('manager', 'agent-manager'),
          name: 'Legacy CEO',
          role: 'specialist',
          title: '대표실',
          adapterType: 'hermes_local',
        },
        instance('removed_definition', 'agent-removed'),
      ]),
    };
    const service = new AgentCatalogService(repository as never, {} as never);

    const roster = await service.listRoster({ organizationId: ORG });
    const manager = roster.items.find(
      (item) => item.definition.type === 'manager',
    );

    expect(manager).toMatchObject({
      definition: {
        type: 'manager',
        displayName: '운영 총괄',
        operationalRole: 'employee',
        officeOrder: 100,
      },
      runtime: {
        instanceId: 'agent-manager',
        adapterType: 'hermes_local',
        effectiveModel: 'gpt-5.4',
      },
      configurationStatus: 'ready',
    });
    expect(manager?.runtime).not.toHaveProperty('name');
    expect(manager?.runtime).not.toHaveProperty('role');
    expect(manager?.runtime).not.toHaveProperty('title');
    expect(manager?.runtime).not.toHaveProperty('reportsToId');
    expect(roster.items.map((item) => item.definition.type))
      .not.toContain('removed_definition');
  });

  it('keeps an installed agent visible when its model plan is incomplete', async () => {
    const repository = {
      listInstances: vi.fn().mockResolvedValue([
        {
          ...instance('manager', 'agent-manager'),
          adapterType: 'claude_local',
          modelOverride: null,
        },
      ]),
    };
    const service = new AgentCatalogService(repository as never, {} as never);

    const roster = await service.listRoster({ organizationId: ORG });
    const manager = roster.items.find(
      (item) => item.definition.type === 'manager',
    );

    expect(manager?.runtime?.effectiveModel).toBeNull();
    expect(manager?.configurationStatus).toBe('model_plan_incomplete');
    expect(AgentRosterResponseSchema.safeParse(roster).success).toBe(true);
  });

  it('rejects direct detail-page AI job instance creation because it is no longer an Agent definition', async () => {
    vi.stubEnv('AGENT_DEFAULT_MODEL', 'gemini-text-agent');
    const repository = {
      createInstanceWithRuntimeState: vi.fn(),
    };
    const service = new AgentCatalogService(repository as never, {} as never);

    await expect(
      service.createInstance({
        organizationId: ORG,
        type: 'detail_page_generate',
        name: 'Detail Page Generate',
      }),
    ).rejects.toMatchObject({
      code: 'agent_definition_not_found',
      message: expect.stringContaining('detail_page_generate'),
    });
    expect(repository.createInstanceWithRuntimeState).not.toHaveBeenCalled();
  });

  it('uses definition employee defaults when creating an instance without explicit role or title', async () => {
    vi.stubEnv('AGENT_DEFAULT_MODEL', 'gemini-text-agent');
    const repository = {
      createInstanceWithRuntimeState: vi.fn(async (input) => ({
        id: 'agent-listing',
        organizationId: input.organizationId,
        type: input.type,
        name: input.name,
        role: input.role,
        title: input.title,
        icon: null,
        reportsToId: null,
        lifecycleStatus: 'active',
        pauseReason: null,
        trustLevel: input.trustLevel ?? 0,
        adapterType: input.adapterType,
        modelOverride: input.modelOverride ?? null,
        adapterConfig: input.adapterConfig ?? {},
        runtimeConfig: input.runtimeConfig ?? {},
        promptPathOverride: input.promptPathOverride ?? null,
      })),
    };
    const service = new AgentCatalogService(repository as never, {} as never);

    const created = await service.createInstance({
      organizationId: ORG,
      type: 'listing',
      name: 'Listing Agent',
    });

    expect(repository.createInstanceWithRuntimeState).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'employee',
        title: '상품 등록 담당',
      }),
    );
    expect(created).toMatchObject({
      role: 'employee',
      title: '상품 등록 담당',
    });
  });

  it('lists effective tool policies with instance overrides ahead of definition defaults', async () => {
    const repository = {
      findInstanceById: vi.fn().mockResolvedValue(instance('sourcing', 'agent-sourcing-1')),
      listInstanceToolPolicies: vi.fn().mockResolvedValue([
        {
          organizationId: ORG,
          agentInstanceId: 'agent-sourcing-1',
          toolId: 'tool-wing-thumbnail',
          toolKey: 'product_listing.submit_wing_thumbnail',
          effect: 'deny',
          approvalMode: 'none',
          dryRunMode: 'disabled',
          constraints: { reason: 'staging pause' },
        },
      ]),
    };
    const service = new AgentCatalogService(repository as never, {} as never);

    const policies = await service.listInstanceToolPolicies({
      organizationId: ORG,
      agentInstanceId: 'agent-sourcing-1',
    });

    expect(repository.findInstanceById).toHaveBeenCalledWith({
      organizationId: ORG,
      id: 'agent-sourcing-1',
    });
    expect(repository.listInstanceToolPolicies).toHaveBeenCalledWith({
      organizationId: ORG,
      agentInstanceId: 'agent-sourcing-1',
    });
    expect(
      policies.find(
        (policy) => policy.toolKey === 'product_listing.submit_wing_thumbnail',
      ),
    ).toMatchObject({
      effect: 'deny',
      source: 'instance',
      approvalMode: 'none',
      dryRunMode: 'disabled',
      constraints: { reason: 'staging pause' },
    });
    expect(
      policies.find(
        (policy) => policy.toolKey === 'market.collect_keyword_category_rankings',
      ),
    ).toMatchObject({
      effect: 'allow',
      source: 'definition',
      approvalMode: 'none',
    });
  });
});
