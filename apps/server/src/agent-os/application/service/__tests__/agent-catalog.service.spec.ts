import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentInstanceRecord } from '../../../domain/agent-os.types';
import { AgentCatalogService } from '../agent-catalog.service';

const ORG = '11111111-1111-1111-1111-111111111111';

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
});
