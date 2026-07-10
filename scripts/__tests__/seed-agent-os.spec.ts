import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listAgentDefinitions } from '../../apps/server/src/agent-os/domain/agent-definition.registry';
import { seedAgentOs } from '../../apps/server/src/agent-os/seed-agent-os';

const repoRoot = join(__dirname, '..', '..');
const seedPath = join(repoRoot, 'scripts/seed-agent-os.ts');
const serverSeedPath = join(repoRoot, 'apps/server/src/agent-os/seed-agent-os.ts');

describe('Agent OS seed catalog', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('seeds every shipped producer definition that backend routes can enqueue', () => {
    const types = listAgentDefinitions().map((definition) => definition.type);

    expect(types).toContain('ad_strategy');
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

  it('keeps direct AI jobs out of the Agent OS seed catalog', () => {
    const definitions = new Map(
      listAgentDefinitions().map((definition) => [definition.type, definition]),
    );

    expect(definitions.get('manager')?.runtimeKind).toBe('coordinator');
    expect(definitions.get('chat')?.runtimeKind).toBe('agent');
    expect(definitions.has('image_edit')).toBe(false);
    expect(definitions.has('thumbnail_generate')).toBe(false);
    expect(definitions.has('detail_page_generate')).toBe(false);
  });

  it('preserves existing instance-owned role and title when refreshing seed rows', async () => {
    vi.stubEnv('AGENT_DEFAULT_MODEL', 'gpt-5.1-codex');
    const updates: Array<{ data: Record<string, unknown> }> = [];
    const prisma = {
      organization: {
        findMany: vi.fn(async () => [{ id: 'org-1' }]),
      },
      agentInstance: {
        findFirst: vi.fn(async (_input) => ({ id: 'agent-existing' })),
        update: vi.fn(async (input) => {
          updates.push(input);
          return { id: input.where.id };
        }),
      },
      agentRuntimeState: {
        upsert: vi.fn(async () => ({})),
      },
    };

    await seedAgentOs(prisma as never);

    expect(updates).toHaveLength(listAgentDefinitions().length);
    for (const update of updates) {
      expect(update.data).toMatchObject({
        name: expect.any(String),
        adapterType: expect.any(String),
      });
      expect(update.data).not.toHaveProperty('role');
      expect(update.data).not.toHaveProperty('title');
    }
  });
});
