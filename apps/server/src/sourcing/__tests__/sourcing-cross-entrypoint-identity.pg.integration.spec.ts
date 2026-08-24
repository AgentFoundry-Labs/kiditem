import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { SourcingCollectionRepositoryAdapter } from '../adapter/out/repository/sourcing-collection.repository.adapter';
import { SourcingCandidateRepositoryAdapter } from '../adapter/out/repository/sourcing-candidate.repository.adapter';
import { SourcingExtensionIngestService } from '../application/service/sourcing-extension-ingest.service';
import { SourcingCollectionCoordinator } from '../application/service/sourcing-collection-coordinator.service';
import { stableSourcingCandidateIdentity } from '../domain/sourcing-candidate-identity';

describe('Sourcing cross-entrypoint candidate identity (PG integration)', () => {
  let agentPrisma: PrismaClient;
  let extensionPrisma: PrismaClient;
  let candidates: SourcingCandidateRepositoryAdapter;
  let extension: SourcingExtensionIngestService;

  beforeAll(async () => {
    agentPrisma = makeTestPrisma();
    extensionPrisma = makeTestPrisma();
    await Promise.all([agentPrisma.$connect(), extensionPrisma.$connect()]);
    candidates = new SourcingCandidateRepositoryAdapter(agentPrisma as unknown as PrismaService);
    const collections = new SourcingCollectionRepositoryAdapter(
      extensionPrisma as unknown as PrismaService,
    );
    extension = new SourcingExtensionIngestService(new SourcingCollectionCoordinator(collections));
  });

  afterAll(async () => Promise.all([agentPrisma?.$disconnect(), extensionPrisma?.$disconnect()]));

  beforeEach(async () => {
    await resetDb(agentPrisma);
    await seedBaseFixture(agentPrisma);
  });

  it('converges concurrent Agent and extension ingest on one canonical 1688 candidate', async () => {
    const sourceUrl = 'https://detail.1688.com/offer/607635921546.html';
    const sourceIdentityHash = stableSourcingCandidateIdentity(
      'ALIBABA_1688',
      '607635921546',
      '',
    );

    const [agent, extensionResult] = await Promise.all([
      candidates.upsertSourcedWithIdempotencyReceipt({
        organizationId: TEST_ORGANIZATION_ID,
        capabilityKey: 'sourcing.ingestCandidate',
        idempotencyKey: 'owner:attempt:cross-entrypoint',
        requestHash: 'a'.repeat(64),
        sourceUrl,
        sourcePlatform: 'ALIBABA_1688',
        externalOfferId: '607635921546',
        variantKeyNormalized: '',
        sourceIdentityHash,
        rawData: { source: 'agent' },
        name: 'Agent candidate',
        description: '',
        category: null,
        tags: [],
        thumbnailUrl: 'https://cbu01.alicdn.com/img/ibank/agent.jpg',
        imageUrl: 'https://cbu01.alicdn.com/img/ibank/agent.jpg',
        costCny: null,
        triggeredByUserId: TEST_USER_ID,
        images: [{
          url: 'https://cbu01.alicdn.com/img/ibank/agent.jpg',
          role: 'product',
          label: null,
          sortOrder: 0,
          source: 'agent-final-scrape',
          isPrimary: true,
        }],
      }),
      extension.ingestV1(
        { organizationId: TEST_ORGANIZATION_ID, userId: TEST_USER_ID },
        {
          page_type: 'detail',
          source_url: sourceUrl,
          source_platform: '1688',
          product_id: '607635921546',
          title: 'Extension candidate',
          price_min: 12.5,
        },
      ),
    ]);

    expect(extensionResult).toEqual({ ok: true, message: 'collected', product_count: 1 });
    const canonical = await agentPrisma.sourcingCandidate.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourcePlatform: 'ALIBABA_1688',
        sourceIdentityHash,
        isDeleted: false,
        status: 'sourced',
      },
      select: { id: true },
    });
    expect(canonical.id).toBe(agent.candidateId);
    await expect(agentPrisma.sourcingCandidate.count({
      where: { organizationId: TEST_ORGANIZATION_ID, isDeleted: false, status: 'sourced' },
    })).resolves.toBe(1);
    await expect(agentPrisma.candidateImage.count({
      where: { organizationId: TEST_ORGANIZATION_ID, candidateId: canonical.id, isDeleted: false },
    })).resolves.toBe(1);
    await expect(agentPrisma.sourcingOwnerIdempotencyReceipt.findMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        capabilityKey: 'sourcing.ingestCandidate',
        idempotencyKey: 'owner:attempt:cross-entrypoint',
      },
      select: { result: true },
    })).resolves.toEqual([{ result: { candidateId: canonical.id } }]);
  });
});
