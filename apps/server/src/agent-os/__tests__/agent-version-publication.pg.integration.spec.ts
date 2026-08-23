import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestPrisma, resetDb } from '../../test-helpers/real-prisma';
import { AGENT_VERSION_PUBLICATION_DEFINITIONS } from '../domain/catalog/agent-version-publication.registry';
import { AgentWorkVersionPublisher } from '../application/service/work/agent-work-version-publisher.service';

let prisma: PrismaClient | null = null;
let versions: AgentWorkVersionPublisher;

beforeAll(async () => {
  prisma = makeTestPrisma();
  versions = new AgentWorkVersionPublisher(prisma);
  await prisma.$connect();
});

afterAll(async () => prisma?.$disconnect());

beforeEach(async () => {
  if (!prisma) throw new Error('Prisma test client was not initialized');
  await resetDb(prisma);
  await prisma.agentWorkVersion.deleteMany();
});

describe('KID-25 AgentVersion publication', () => {
  it('publishes six immutable code-owned snapshots and creates a successor for a changed capability catalog', async () => {
    expect(AGENT_VERSION_PUBLICATION_DEFINITIONS).toHaveLength(6);
    const published = await Promise.all(
      AGENT_VERSION_PUBLICATION_DEFINITIONS.map((definition) => versions.publish(definition)),
    );
    expect(new Set(published.map((version) => version.agentDefinitionKey)).size).toBe(6);
    expect(published.every((version) => version.activatedAt && !version.retiredAt)).toBe(true);

    const original = AGENT_VERSION_PUBLICATION_DEFINITIONS.find((definition) => definition.agentDefinitionKey === 'sourcing')!;
    const successor = await versions.publish({
      ...original,
      capabilityKeys: [...original.capabilityKeys, 'analytics.readOverview'],
      manifestHash: 'f'.repeat(64),
    });
    const originalRow = await prisma!.agentWorkVersion.findFirstOrThrow({
      where: { agentDefinitionKey: original.agentDefinitionKey, manifestHash: original.manifestHash },
    });
    expect(successor.version).toBe(originalRow.version + 1);
    expect(originalRow.capabilityKeys).toEqual([...original.capabilityKeys]);
    expect(originalRow.retiredAt).toBeInstanceOf(Date);
  });
});
