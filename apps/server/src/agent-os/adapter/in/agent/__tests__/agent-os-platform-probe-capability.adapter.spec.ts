import { describe, expect, it } from 'vitest';
import { AgentCapabilityRegistry } from '../../../../application/service/agent-capability-registry.service';
import { officialCapabilityExecution } from '../../../../test-helpers/official-capability-execution';
import { AgentOsPlatformProbeCapabilityAdapter } from '../agent-os-platform-probe-capability.adapter';

describe('AgentOsPlatformProbeCapabilityAdapter', () => {
  it('registers the bounded zero-risk platform read', async () => {
    const registry = new AgentCapabilityRegistry();
    new AgentOsPlatformProbeCapabilityAdapter(registry).onModuleInit();
    const handler = registry.resolve('agent_os.platform_probe');

    expect(handler).toMatchObject({ sideEffects: ['read'], approvalRisk: 'none' });
    await expect(handler!.execute(officialCapabilityExecution({}) as never)).resolves.toEqual({
      resourceType: 'agent_os_platform',
      outputSummary: { status: 'available' },
    });
  });
});
