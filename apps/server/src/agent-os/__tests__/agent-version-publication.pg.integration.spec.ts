import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { PrismaClientAgentVersionRepository } from '../adapter/out/repository/prisma-agent-version.repository';
import type { PublishAgentVersionInput } from '../application/port/out/repository/agent-version.repository.port';

const AUTHORITY_PROFILE_ID = 'foundation_read_only_probe:v1';

let prisma: PrismaClient | null = null;
let versions: PrismaClientAgentVersionRepository;

beforeAll(async () => {
  prisma = makeTestPrisma();
  versions = new PrismaClientAgentVersionRepository(prisma);
  await prisma.$connect();
});

afterAll(async () => prisma?.$disconnect());

beforeEach(async () => {
  if (!prisma) throw new Error('Prisma test client was not initialized');
  await resetDb(prisma);
  await seedBaseFixture(prisma);
  await prisma.agentAuthorityProfileVersion.create({
    data: {
      id: AUTHORITY_PROFILE_ID,
      organizationId: TEST_ORGANIZATION_ID,
      profileKey: 'foundation_read_only_probe',
      version: 1,
      capabilityKeys: ['agent_os.platform_probe'],
      policyDocument: { sideEffects: ['read'] },
      policyHash: 'f'.repeat(64),
    },
  });
});

describe('durable AgentVersion publication', () => {
  it('serializes equal publication, creates one immutable successor, and keeps an existing session pinned', async () => {
    const original = manifest('a', 'agent-config/prompts/agents/manager.md');
    const [first, raced] = await Promise.all([
      versions.publishAndActivate(original),
      versions.publishAndActivate(original),
    ]);

    expect(raced.id).toBe(first.id);
    expect(first.version).toBe(1);
    await prisma!.agentSession.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        createdByUserId: TEST_USER_ID,
        copilotThreadId: '11111111-1111-4111-8111-111111111111',
        primaryAgentVersionId: first.id,
        authorityProfileVersionId: AUTHORITY_PROFILE_ID,
        lifecycle: 'active',
      },
    });

    const changed = await versions.publishAndActivate(
      manifest('b', 'agent-config/prompts/agents/manager-v2.md'),
    );

    expect(changed).toMatchObject({ version: 2, manifestHash: 'b'.repeat(64) });
    const [originalRow, session, activeCount] = await Promise.all([
      prisma!.agentVersion.findUniqueOrThrow({ where: { id: first.id } }),
      prisma!.agentSession.findUniqueOrThrow({
        where: {
          organizationId_copilotThreadId: {
            organizationId: TEST_ORGANIZATION_ID,
            copilotThreadId: '11111111-1111-4111-8111-111111111111',
          },
        },
      }),
      prisma!.agentVersion.count({
        where: {
          agentDefinitionKey: 'operator',
          activatedAt: { not: null },
          retiredAt: null,
        },
      }),
    ]);

    expect(originalRow.manifestHash).toBe('a'.repeat(64));
    expect(originalRow.retiredAt).toBeInstanceOf(Date);
    expect(session.primaryAgentVersionId).toBe(first.id);
    expect(activeCount).toBe(1);
  });
});

function manifest(
  hashCharacter: string,
  promptPath: string,
): PublishAgentVersionInput {
  const runtimeManifest = {
    schemaVersion: 1 as const,
    agentDefinitionKey: 'operator',
    runtimeKind: 'coordinator' as const,
    runtimeType: 'copilotkit_agui',
    modelIdentity: 'gpt-test',
    capabilityKeys: ['agent_os.platform_probe'],
    policyDocument: { sideEffects: ['read'] },
    delegation: {
      role: 'leaf' as const,
      allowedAgentDefinitionKeys: [],
      maxDepth: 0,
      maxChildrenPerTask: 0,
    },
    limits: { maxTurns: 20, maxContextTokens: 8_192, summaryTargetTokens: 512 },
    assets: {
      prompt: { path: promptPath, sha256: 'c'.repeat(64) },
      summaryPrompt: {
        path: 'agent-config/prompts/system/session-summary.md',
        sha256: 'd'.repeat(64),
      },
      skills: [],
      outputSchema: null,
    },
  };
  return {
    agentDefinitionKey: runtimeManifest.agentDefinitionKey,
    displayName: 'Operator',
    description: 'Operator',
    runtimeType: runtimeManifest.runtimeType,
    modelIdentity: runtimeManifest.modelIdentity,
    capabilityKeys: runtimeManifest.capabilityKeys,
    policyDocument: runtimeManifest.policyDocument,
    manifestHash: hashCharacter.repeat(64),
    runtimeManifest,
  };
}
