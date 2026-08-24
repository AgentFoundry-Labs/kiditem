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
import { SourcingFinalDiscoveryCapabilityAdapter } from '../adapter/in/agent/sourcing-final-discovery-capability.adapter';
import { SourcingExtensionIngestService } from '../application/service/sourcing-extension-ingest.service';
import { SourcingCollectionCoordinator } from '../application/service/sourcing-collection-coordinator.service';
import { canonicalSourcingCandidateIdentity } from '../domain/sourcing-candidate-identity';

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
    const sourceIdentityHash = canonicalSourcingCandidateIdentity({
      sourcePlatform: 'ALIBABA_1688',
      sourceUrl,
      validatedExternalOfferId: '607635921546',
      variantKeyNormalized: '',
    });

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

  it('converges concurrent Agent and extension ingest on one canonical Alibaba candidate', async () => {
    const sourceUrl = 'https://www.alibaba.com/product-detail/kid-toy_123.html';
    const waitForPeerCandidateRead = candidateReadBarrier();
    const agentCandidates = new SourcingCandidateRepositoryAdapter(
      prismaWithCandidateReadBarrier(agentPrisma, waitForPeerCandidateRead) as unknown as PrismaService,
    );
    const extensionCollections = new SourcingCollectionRepositoryAdapter(
      prismaWithCandidateReadBarrier(extensionPrisma, waitForPeerCandidateRead) as unknown as PrismaService,
    );
    const agent = new SourcingFinalDiscoveryCapabilityAdapter(agentCandidates, {
      scrapeProductUrl: async () => ({
        ok: true,
        source_url: sourceUrl,
        scraped_data: { title: 'Agent Alibaba candidate', images: [] },
      }),
    } as never);
    const extension = new SourcingExtensionIngestService(
      new SourcingCollectionCoordinator(extensionCollections),
    );
    const snapshot = await agent.scrapeProductUrl({ sourceUrl });

    const [agentResult, extensionResult] = await Promise.all([
      agent.ingestCandidate({
        organizationId: TEST_ORGANIZATION_ID,
        initiatingUserId: TEST_USER_ID,
        idempotencyKey: 'owner:attempt:cross-entrypoint-alibaba',
        snapshot,
      }),
      extension.ingestV1(
        { organizationId: TEST_ORGANIZATION_ID, userId: TEST_USER_ID },
        {
          page_type: 'detail',
          source_url: sourceUrl,
          source_platform: 'alibaba',
          product_id: 'supplier-product-id-123',
          title: 'Extension Alibaba candidate',
          images: ['https://www.alibaba.com/images/kid-toy.jpg'],
        },
      ),
    ]);

    expect(extensionResult).toEqual({ ok: true, message: 'collected', product_count: 1 });
    await expect(agentPrisma.sourcingCandidate.count({
      where: { organizationId: TEST_ORGANIZATION_ID, isDeleted: false, status: 'sourced' },
    })).resolves.toBe(1);
    const canonical = await agentPrisma.sourcingCandidate.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl,
        isDeleted: false,
        status: 'sourced',
      },
      select: { id: true, sourceIdentityHash: true },
    });
    expect(canonical.sourceIdentityHash).not.toBeNull();
    expect(canonical.id).toBe(agentResult.candidateId);
    await expect(agentPrisma.candidateImage.count({
      where: { organizationId: TEST_ORGANIZATION_ID, candidateId: canonical.id, isDeleted: false },
    })).resolves.toBe(1);
    await expect(agentPrisma.sourcingOwnerIdempotencyReceipt.findMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        capabilityKey: 'sourcing.ingestCandidate',
        idempotencyKey: 'owner:attempt:cross-entrypoint-alibaba',
      },
      select: { result: true },
    })).resolves.toEqual([{ result: { candidateId: canonical.id } }]);
  });
});

/**
 * Forces the pre-fix cross-entrypoint read/create window. Once both writers
 * share the canonical advisory key, the bounded wait lets the first commit
 * before the second reaches its lookup instead of deadlocking the test.
 */
function candidateReadBarrier(): () => Promise<void> {
  let reads = 0;
  let releasePeer: () => void = () => undefined;
  const peerRead = new Promise<void>((resolve) => {
    releasePeer = resolve;
  });
  return async () => {
    reads += 1;
    if (reads >= 2) {
      releasePeer();
      return;
    }
    await Promise.race([
      peerRead,
      new Promise<void>((resolve) => setTimeout(resolve, 100)),
    ]);
  };
}

function prismaWithCandidateReadBarrier(
  prisma: PrismaClient,
  waitForPeerCandidateRead: () => Promise<void>,
): PrismaClient {
  return new Proxy(prisma, {
    get(target, property, receiver) {
      if (property !== '$transaction') return Reflect.get(target, property, receiver);
      return async <T>(
        operation: (transaction: object) => Promise<T>,
        options?: unknown,
      ): Promise<T> => target.$transaction(
        (transaction) => operation(withCandidateReadBarrier(transaction, waitForPeerCandidateRead)),
        options as never,
      );
    },
  }) as PrismaClient;
}

function withCandidateReadBarrier(
  transaction: object,
  waitForPeerCandidateRead: () => Promise<void>,
): object {
  return new Proxy(transaction, {
    get(target, property, receiver) {
      if (property !== 'sourcingCandidate') return Reflect.get(target, property, receiver);
      const candidate = Reflect.get(target, property, receiver) as object;
      return new Proxy(candidate, {
        get(candidateTarget, candidateProperty, candidateReceiver) {
          const member = Reflect.get(candidateTarget, candidateProperty, candidateReceiver);
          if (candidateProperty !== 'findFirst' || typeof member !== 'function') return member;
          return async (...args: unknown[]) => {
            const result = await member.apply(candidateTarget, args);
            await waitForPeerCandidateRead();
            return result;
          };
        },
      });
    },
  });
}
