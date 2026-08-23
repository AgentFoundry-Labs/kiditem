import { describe, expect, it, vi } from 'vitest';
import { AGENT_VERSION_PUBLICATION_DEFINITIONS } from '../../../domain/catalog/agent-version-publication.registry';
import { AgentVersionPublicationBootstrap } from './agent-version-publication-bootstrap.service';

describe('AgentVersionPublicationBootstrap', () => {
  it('publishes the six code-owned versions idempotently at boot', async () => {
    const publisher = { publish: vi.fn(async (definition) => definition) };
    const bootstrap = new AgentVersionPublicationBootstrap(publisher as never);
    await bootstrap.onApplicationBootstrap(); await bootstrap.onApplicationBootstrap();
    expect(publisher.publish).toHaveBeenCalledTimes(AGENT_VERSION_PUBLICATION_DEFINITIONS.length * 2);
    expect(publisher.publish.mock.calls.map(([definition]) => definition.agentDefinitionKey)).toEqual([
      ...AGENT_VERSION_PUBLICATION_DEFINITIONS.map((definition) => definition.agentDefinitionKey),
      ...AGENT_VERSION_PUBLICATION_DEFINITIONS.map((definition) => definition.agentDefinitionKey),
    ]);
  });
});
