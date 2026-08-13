import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { listAgentDefinitions } from '../domain/agent-definition.registry';
import { seedAgentOs } from '../seed-agent-os';

let prisma: PrismaClient | null = null;

beforeAll(async () => {
  prisma = makeTestPrisma();
  await prisma.$connect();
});

afterAll(async () => prisma?.$disconnect());

beforeEach(async () => {
  if (!prisma) throw new Error('Prisma test client was not initialized');
  await resetDb(prisma);
  await seedBaseFixture(prisma);
  vi.stubEnv('AGENT_DEFAULT_MODEL', 'gpt-test');
  vi.stubEnv('AGENT_SEED_ORG_IDS', TEST_ORGANIZATION_ID);
});

afterEach(() => vi.unstubAllEnvs());

describe('seedAgentOs', () => {
  it('publishes immutable manifests and authority before idempotently ensuring instances', async () => {
    const first = await seedAgentOs(prisma!);
    const second = await seedAgentOs(prisma!);
    const definitionCount = listAgentDefinitions().length;

    expect(first).toEqual({
      organizationCount: 1,
      definitionCount,
      versionsPublished: definitionCount,
      instancesEnsured: definitionCount,
    });
    expect(second).toEqual(first);
    await expect(prisma!.agentVersion.count()).resolves.toBe(definitionCount);
    await expect(prisma!.agentVersion.count({
      where: { activatedAt: { not: null }, retiredAt: null },
    })).resolves.toBe(definitionCount);
    await expect(prisma!.agentInstance.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(definitionCount);
    await expect(prisma!.agentAuthorityProfileVersion.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(1);
  });

  it('fails closed instead of mutating or accepting a drifted authority version', async () => {
    await seedAgentOs(prisma!);
    await prisma!.agentAuthorityProfileVersion.update({
      where: {
        id_organizationId: {
          id: 'foundation_read_only_probe:v1',
          organizationId: TEST_ORGANIZATION_ID,
        },
      },
      data: { policyHash: 'f'.repeat(64) },
    });

    await expect(seedAgentOs(prisma!)).rejects.toThrow(
      'Authority profile version drift',
    );
  });
});
