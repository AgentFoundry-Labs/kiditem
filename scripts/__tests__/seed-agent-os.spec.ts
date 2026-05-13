import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listAgentDefinitions } from '../../apps/server/src/agent-os/domain/agent-definition.registry';

const repoRoot = join(__dirname, '..', '..');
const seedPath = join(repoRoot, 'scripts/seed-agent-os.ts');
const serverSeedPath = join(repoRoot, 'apps/server/src/agent-os/seed-agent-os.ts');

describe('Agent OS seed catalog', () => {
  it('seeds every shipped producer definition that backend routes can enqueue', () => {
    const types = listAgentDefinitions().map((definition) => definition.type);

    expect(types).toContain('ad_strategy');
    expect(types).toContain('image_edit');
    expect(types).toContain('sourcing');
  });

  it('points every code-owned definition at an existing prompt file', () => {
    for (const definition of listAgentDefinitions()) {
      expect(
        existsSync(join(repoRoot, 'apps/server', definition.promptPath)),
        `${definition.type} prompt does not exist: ${definition.promptPath}`,
      ).toBe(true);
    }
  });

  it('does not write legacy blueprint rows; definitions are code-owned', () => {
    const source = `${readFileSync(seedPath, 'utf8')}\n${readFileSync(serverSeedPath, 'utf8')}`;
    expect(source).not.toContain(`agent${'Blue'}${'print'}`);
  });

  it('does not copy definition defaults into instance override columns', () => {
    const source = `${readFileSync(seedPath, 'utf8')}\n${readFileSync(serverSeedPath, 'utf8')}`;
    expect(source).not.toContain('runtimeConfig: definition.defaultRuntimeConfig');
  });

  it('marks fixed AI/job producers as transitional tool wrappers', () => {
    const definitions = new Map(
      listAgentDefinitions().map((definition) => [definition.type, definition]),
    );

    expect(definitions.get('manager')?.runtimeKind).toBe('coordinator');
    expect(definitions.get('chat')?.runtimeKind).toBe('agent');
    expect(definitions.get('thumbnail_generate')?.runtimeKind).toBe('tool_wrapper');
    expect(definitions.get('detail_page_generate')?.runtimeKind).toBe('tool_wrapper');
    expect(definitions.get('image_edit')?.runtimeKind).toBe('tool_wrapper');
    expect(definitions.get('image_edit')?.defaultAdapterType).toBe('gemini_image');
  });
});
