import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
} from '../../../../../test-helpers/real-prisma';
import { PrismaClientAgentVersionRepository } from '../prisma-agent-version.repository';
import type { PublishAgentVersionInput } from '../../../../application/port/out/repository/agent-version.repository.port';

let prisma: PrismaClient | null = null;
let repository: PrismaClientAgentVersionRepository;

beforeAll(async () => {
  prisma = makeTestPrisma();
  repository = new PrismaClientAgentVersionRepository(prisma);
  await prisma.$connect();
});
afterAll(async () => prisma?.$disconnect());
beforeEach(async () => {
  if (!prisma) throw new Error('Prisma test client was not initialized');
  await resetDb(prisma);
  await seedBaseFixture(prisma);
});

describe('PrismaAgentVersionRepository', () => {
  it('serializes publication, reuses equal hash, and retires the previous active row', async () => {
    const input = manifestInput('a', 40);
    const [first, raced] = await Promise.all([
      repository.publishAndActivate(input),
      repository.publishAndActivate(input),
    ]);
    expect(raced.id).toBe(first.id);
    expect(first.version).toBe(1);

    const changed = await repository.publishAndActivate(manifestInput('b', 41));
    expect(changed.version).toBe(2);
    expect(await prisma!.agentVersion.count({
      where: { agentDefinitionKey: 'operator', activatedAt: { not: null }, retiredAt: null },
    })).toBe(1);
    const immutableFirst = await prisma!.agentVersion.findUniqueOrThrow({
      where: { id: first.id },
    });
    expect(immutableFirst.manifestHash).toBe('a'.repeat(64));
    expect(immutableFirst.retiredAt).toBeInstanceOf(Date);

    const reactivated = await repository.publishAndActivate(input);
    expect(reactivated.id).toBe(first.id);
    expect(reactivated.version).toBe(1);
    expect(reactivated.retiredAt).toBeNull();
    expect(await prisma!.agentVersion.count({
      where: { agentDefinitionKey: 'operator', activatedAt: { not: null }, retiredAt: null },
    })).toBe(1);
    expect((await prisma!.agentVersion.findUniqueOrThrow({
      where: { id: changed.id },
    })).retiredAt).toBeInstanceOf(Date);
  });

  it('keeps an exact retired version addressable for an already-bound session while active lookup denies it', async () => {
    const v1 = await repository.publishAndActivate(manifestInput('a', 40));
    await repository.publishAndActivate(manifestInput('b', 41));

    await expect(repository.findActiveAgentVersion({ agentDefinitionKey: 'operator', agentVersionId: v1.id })).resolves.toBeNull();
    await expect(repository.findKnownAgentVersion({ agentDefinitionKey: 'operator', agentVersionId: v1.id })).resolves.toMatchObject({
      id: v1.id,
      agentDefinitionKey: 'operator',
      retiredAt: expect.any(Date),
    });
    await expect(repository.findKnownAgentVersion({ agentDefinitionKey: 'foreign', agentVersionId: v1.id })).resolves.toBeNull();
  });
});

function manifestInput(hashCharacter: string, maxTurns: number): PublishAgentVersionInput {
  const runtimeManifest = {
    schemaVersion: 1 as const,
    agentDefinitionKey: 'operator',
    runtimeKind: 'coordinator' as const,
    runtimeType: 'copilotkit_agui',
    modelIdentity: 'gpt-test',
    capabilityKeys: ['agent_os.platform_probe'],
    policyDocument: { sideEffects: ['read'] },
    delegation: {
      role: 'orchestrator' as const,
      allowedAgentDefinitionKeys: ['sourcing'],
      maxDepth: 2,
      maxChildrenPerTask: 5,
    },
    limits: { maxTurns, maxContextTokens: 8_192, summaryTargetTokens: 512 },
    assets: {
      prompt: { path: 'agent-config/prompts/agents/manager.md', sha256: 'c'.repeat(64) },
      summaryPrompt: { path: 'agent-config/prompts/system/session-summary.md', sha256: 'd'.repeat(64) },
      skills: [],
      outputSchema: null,
    },
  };
  return {
    agentDefinitionKey: 'operator',
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
