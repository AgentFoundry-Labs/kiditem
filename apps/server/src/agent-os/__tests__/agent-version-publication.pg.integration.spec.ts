import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestPrisma, resetDb } from '../../test-helpers/real-prisma';
import { AGENT_VERSION_PUBLICATION_DEFINITIONS } from '../domain/catalog/agent-version-publication.registry';
import { AgentVersionPublisher } from '../application/service/work/agent-work-version-publisher.service';

let prisma: PrismaClient | null = null;
let versions: AgentVersionPublisher;

beforeAll(async () => {
  prisma = makeTestPrisma();
  versions = new AgentVersionPublisher(prisma);
  await prisma.$connect();
});

afterAll(async () => prisma?.$disconnect());

beforeEach(async () => {
  if (!prisma) throw new Error('Prisma test client was not initialized');
  await resetDb(prisma);
  await prisma.agentVersion.deleteMany();
});

describe('KID-25 AgentVersion publication', () => {
  it('derives default capability keys from the final catalog for every assigned owner domain', () => {
    expect(AGENT_VERSION_PUBLICATION_DEFINITIONS).toEqual(expect.arrayContaining([
      expect.objectContaining({ agentDefinitionKey: 'operator', capabilityKeys: ['agent_os.platform_probe'] }),
      expect.objectContaining({ agentDefinitionKey: 'sourcing', capabilityKeys: [
        'sourcing.collect_shadow_signals', 'sourcing.createReviewBatch',
        'sourcing.duplicateCheck', 'sourcing.ingestCandidate',
        'sourcing.inspectRecommendationRun', 'sourcing.refreshCollection',
        'sourcing.refreshValidation', 'sourcing.retrieveWorkspaceEvidence',
        'sourcing.scrapeProductUrl', 'sourcing.scrapeUrlWorkflow',
      ] }),
      expect.objectContaining({ agentDefinitionKey: 'merchandising', capabilityKeys: ['products.create_listing_generation_package'] }),
      expect.objectContaining({ agentDefinitionKey: 'supply', capabilityKeys: ['supply.create_purchase_order_draft', 'supply.submit_purchase_order'] }),
      expect.objectContaining({ agentDefinitionKey: 'channel_operations', capabilityKeys: [
        'channels.register_confirmed_listing', 'channels.submit_coupang_listing', 'channels.submit_wing_thumbnail',
      ] }),
      expect.objectContaining({ agentDefinitionKey: 'advertising', capabilityKeys: [] }),
    ]));
  });

  it('publishes six immutable code-owned snapshots and creates immutable A-to-B-to-A successors', async () => {
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
    const returned = await versions.publish(original);
    const originalRow = await prisma!.agentVersion.findFirstOrThrow({
      where: { agentDefinitionKey: original.agentDefinitionKey, manifestHash: original.manifestHash },
    });
    expect(successor.version).toBe(originalRow.version + 1);
    expect(originalRow.capabilityKeys).toEqual([...original.capabilityKeys]);
    expect(originalRow.retiredAt).toBeInstanceOf(Date);
    expect(returned.version).toBe(successor.version + 1);
    expect(returned.id).not.toBe(originalRow.id);
    const successorRow = await prisma!.agentVersion.findUniqueOrThrow({ where: { id: successor.id } });
    expect(successorRow.retiredAt).toBeInstanceOf(Date);
    expect(returned.retiredAt).toBeNull();
  });
});
