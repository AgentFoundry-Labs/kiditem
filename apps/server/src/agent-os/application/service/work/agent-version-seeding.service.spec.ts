import { describe, expect, it, vi } from 'vitest';

const { seedAgentVersions } = vi.hoisted(() => ({ seedAgentVersions: vi.fn() }));

vi.mock('../../../seed-agent-versions', () => ({ seedAgentVersions }));

import { AgentVersionSeedingService } from './agent-version-seeding.service';

describe('AgentVersionSeedingService', () => {
  it('uses the shared explicit-model seed implementation', async () => {
    seedAgentVersions.mockResolvedValue(6);

    await expect(new AgentVersionSeedingService().seed()).resolves.toBe(6);
    expect(seedAgentVersions).toHaveBeenCalledOnce();
  });
});
