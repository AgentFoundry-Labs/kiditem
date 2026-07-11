import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { listAgentDefinitions } from '../domain/agent-definition.registry';
import { seedAgentOs } from '../seed-agent-os';

describe('Agent OS seed concurrency (PG integration)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    vi.stubEnv('AGENT_SEED_ORG_IDS', TEST_ORGANIZATION_ID);
    vi.stubEnv('AGENT_DEFAULT_MODEL', 'gpt-5.4');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('converges when two seed processes start together', async () => {
    await Promise.all([seedAgentOs(prisma), seedAgentOs(prisma)]);

    const definitions = listAgentDefinitions();
    const instances = await prisma.agentInstance.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      select: { id: true, type: true },
    });
    const runtimeStates = await prisma.agentRuntimeState.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      select: { agentInstanceId: true },
    });

    expect(instances).toHaveLength(definitions.length);
    expect(new Set(instances.map((item) => item.type))).toEqual(
      new Set(definitions.map((definition) => definition.type)),
    );
    expect(runtimeStates).toHaveLength(definitions.length);
    expect(new Set(runtimeStates.map((item) => item.agentInstanceId))).toEqual(
      new Set(instances.map((item) => item.id)),
    );
  });
});
