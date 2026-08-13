import { describe, expect, it } from 'vitest';
import { AgentCapabilityRegistry } from '../../../../application/service/agent-capability-registry.service';
import { AgentOsPlatformProbeCapabilityAdapter } from '../agent-os-platform-probe-capability.adapter';

describe('AgentOsPlatformProbeCapabilityAdapter', () => {
  it('registers the bounded zero-risk platform read', async () => {
    const registry = new AgentCapabilityRegistry();
    new AgentOsPlatformProbeCapabilityAdapter(registry).onModuleInit();
    const handler = registry.resolve('agent_os.platform_probe');

    expect(handler).toMatchObject({ sideEffects: ['read'], approvalRisk: 'none' });
    await expect(handler!.execute({
      organizationId: 'org-1', agentInstanceId: 'session-1', agentType: 'operator', input: {},
    })).resolves.toEqual({
      resourceType: 'agent_os_platform',
      outputSummary: { status: 'available' },
    });
  });
});
