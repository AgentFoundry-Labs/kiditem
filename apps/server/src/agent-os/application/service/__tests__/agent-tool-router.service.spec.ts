import { describe, expect, it } from 'vitest';
import { AgentToolRouter } from '../agent-tool-router.service';

describe('AgentToolRouter legacy boundary', () => {
  it('fails closed without resolving or invoking an official capability handler', async () => {
    const router = new AgentToolRouter();

    await expect(router.invoke({
      organizationId: 'org-1',
      agentInstanceId: 'legacy-agent-1',
      agentType: 'sourcing',
      capabilityKey: 'sourcing.scrapeUrlWorkflow',
      input: { sourceUrl: 'https://detail.1688.com/offer/123.html' },
    })).rejects.toMatchObject({
      code: 'legacy_capability_invocation_retired',
    });
  });
});
