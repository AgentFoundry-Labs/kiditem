import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { listAgentDefinitions } from '../../apps/server/src/agent-os/domain/agent-definition.registry';
import { seedAgentOs } from '../../apps/server/src/agent-os/seed-agent-os';

const repoRoot = join(__dirname, '..', '..');
const seedPath = join(repoRoot, 'scripts/seed-agent-os.ts');
const serverSeedPath = join(repoRoot, 'apps/server/src/agent-os/seed-agent-os.ts');

function prismaError(
  code: string,
  modelName: string,
  fields: string[],
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Database constraint error', {
    code,
    clientVersion: '7.7.0',
    meta: {
      modelName,
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: code === 'P2002' ? '23505' : '23503',
          originalMessage: 'test constraint error',
          kind: code === 'P2002' ? 'UniqueConstraintViolation' : 'ForeignKeyConstraintViolation',
          constraint: { fields },
        },
      },
    },
  });
}

function seedTransactionFixture() {
  const tx = {
    agentInstance: { upsert: vi.fn(async () => ({ id: 'agent-existing' })) },
    agentRuntimeState: { upsert: vi.fn(async () => ({})) },
  };
  const runTransaction = async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx);
  return { tx, runTransaction };
}

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

  it('uses compound upserts without updating existing runtime configuration', async () => {
    vi.stubEnv('AGENT_DEFAULT_MODEL', 'gpt-5.4');
    const instanceUpsert = vi.fn(async () => ({ id: 'agent-existing' }));
    const runtimeUpsert = vi.fn(async () => ({}));
    const tx = {
      agentInstance: { upsert: instanceUpsert },
      agentRuntimeState: { upsert: runtimeUpsert },
    };
    const prisma = {
      organization: {
        findMany: vi.fn(async () => [{ id: 'org-1' }]),
      },
      $transaction: vi.fn(async (operation) => operation(tx)),
    };

    await seedAgentOs(prisma as never);

    expect(instanceUpsert).toHaveBeenCalledTimes(listAgentDefinitions().length);
    expect(instanceUpsert).toHaveBeenCalledWith({
      where: {
        organizationId_type: {
          organizationId: 'org-1',
          type: 'manager',
        },
      },
      update: {},
      create: {
        organizationId: 'org-1',
        type: 'manager',
        name: 'Operator',
        role: 'employee',
        title: '운영 총괄',
        adapterType: 'claude_local',
      },
      select: { id: true },
    });
    expect(runtimeUpsert).toHaveBeenCalledTimes(listAgentDefinitions().length);
    expect(runtimeUpsert).toHaveBeenCalledWith({
      where: { agentInstanceId: 'agent-existing' },
      create: {
        organizationId: 'org-1',
        agentInstanceId: 'agent-existing',
      },
      update: {},
    });
  });

  it('retries an AgentInstance organization and type conflict once', async () => {
    vi.stubEnv('AGENT_DEFAULT_MODEL', 'gpt-5.4');
    const conflict = prismaError('P2002', 'AgentInstance', ['organization_id', 'type']);
    const { runTransaction } = seedTransactionFixture();
    const transaction = vi.fn()
      .mockRejectedValueOnce(conflict)
      .mockImplementation(runTransaction);
    const prisma = {
      organization: { findMany: vi.fn(async () => [{ id: 'org-1' }]) },
      $transaction: transaction,
    };

    await expect(seedAgentOs(prisma as never)).resolves.toMatchObject({
      instancesEnsured: listAgentDefinitions().length,
    });
    expect(transaction).toHaveBeenCalledTimes(listAgentDefinitions().length + 1);
  });

  it('retries an AgentRuntimeState agent instance conflict once', async () => {
    vi.stubEnv('AGENT_DEFAULT_MODEL', 'gpt-5.4');
    const conflict = prismaError('P2002', 'AgentRuntimeState', ['agent_instance_id']);
    const { runTransaction } = seedTransactionFixture();
    const transaction = vi.fn()
      .mockRejectedValueOnce(conflict)
      .mockImplementation(runTransaction);
    const prisma = {
      organization: { findMany: vi.fn(async () => [{ id: 'org-1' }]) },
      $transaction: transaction,
    };

    await expect(seedAgentOs(prisma as never)).resolves.toMatchObject({
      instancesEnsured: listAgentDefinitions().length,
    });
    expect(transaction).toHaveBeenCalledTimes(listAgentDefinitions().length + 1);
  });

  it('does not retry an unrelated P2002 target', async () => {
    vi.stubEnv('AGENT_DEFAULT_MODEL', 'gpt-5.4');
    const conflict = prismaError('P2002', 'AgentInstance', ['organization_id', 'name']);
    const transaction = vi.fn().mockRejectedValueOnce(conflict);
    const prisma = {
      organization: { findMany: vi.fn(async () => [{ id: 'org-1' }]) },
      $transaction: transaction,
    };

    await expect(seedAgentOs(prisma as never)).rejects.toBe(conflict);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('does not retry a non-P2002 Prisma error', async () => {
    vi.stubEnv('AGENT_DEFAULT_MODEL', 'gpt-5.4');
    const conflict = prismaError('P2003', 'AgentRuntimeState', ['organization_id']);
    const transaction = vi.fn().mockRejectedValueOnce(conflict);
    const prisma = {
      organization: { findMany: vi.fn(async () => [{ id: 'org-1' }]) },
      $transaction: transaction,
    };

    await expect(seedAgentOs(prisma as never)).rejects.toBe(conflict);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects an expected conflict after both allowed attempts', async () => {
    vi.stubEnv('AGENT_DEFAULT_MODEL', 'gpt-5.4');
    const conflict = prismaError('P2002', 'AgentInstance', ['organization_id', 'type']);
    const transaction = vi.fn().mockRejectedValue(conflict);
    const prisma = {
      organization: { findMany: vi.fn(async () => [{ id: 'org-1' }]) },
      $transaction: transaction,
    };

    await expect(seedAgentOs(prisma as never)).rejects.toBe(conflict);
    expect(transaction).toHaveBeenCalledTimes(2);
  });
});
