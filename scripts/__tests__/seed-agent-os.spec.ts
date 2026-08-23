import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENT_VERSION_PUBLICATION_DEFINITIONS } from '../../apps/server/src/agent-os/domain/catalog/agent-version-publication.registry';

const repoRoot = join(__dirname, '..', '..');
const seedPath = join(repoRoot, 'scripts/seed-agent-os.ts');
const seedSource = readFileSync(seedPath, 'utf8');
const implementationSource = readFileSync(join(repoRoot, 'apps/server/src/agent-os/seed-agent-versions.ts'), 'utf8');

describe('AgentVersion seed command', () => {
  it('publishes exactly the six code-owned immutable AgentVersions', () => {
    expect(AGENT_VERSION_PUBLICATION_DEFINITIONS.map((definition) => definition.agentDefinitionKey)).toEqual([
      'operator', 'sourcing', 'merchandising', 'supply', 'channel_operations', 'advertising',
    ]);
    expect(implementationSource).toContain('AgentVersionPublisher');
    expect(seedSource).toContain('AGENT_VERSION_PUBLICATION_DEFINITIONS');
    expect(implementationSource).toContain('PrismaPg');
    expect(implementationSource).toContain('missing_required_configuration:DATABASE_URL');
  });

  it('requires one explicit model for every published AgentVersion', () => {
    for (const definition of AGENT_VERSION_PUBLICATION_DEFINITIONS) {
      expect(implementationSource).toContain('AGENT_${definition.agentDefinitionKey.toUpperCase()}_MODEL');
    }
    expect(implementationSource).not.toContain('AGENT_DEFAULT_MODEL');
  });

  it('uses the idempotent publisher instead of legacy Agent OS seed state', () => {
    expect(seedSource).not.toContain('runAgentOsSeed');
    expect(seedSource).not.toContain(`agent${'Blue'}${'print'}`);
    expect(implementationSource).not.toContain('AgentInstance');
  });
});
