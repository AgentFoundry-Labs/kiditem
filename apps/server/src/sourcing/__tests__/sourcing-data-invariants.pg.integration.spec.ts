import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { SourcingCollectionRepositoryAdapter } from '../adapter/out/repository/sourcing-collection.repository.adapter';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaClient } from '@prisma/client';

describe('Sourcing durable data invariants (PG integration)', () => {
  let prisma: PrismaClient;
  let collectionRepository: SourcingCollectionRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    collectionRepository = new SourcingCollectionRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('permits one active collection lane for concurrent claims', async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) =>
        prisma.sourcingEvidenceIngestionRun.create({
          data: runData(`claim-${index}`),
        }),
      ),
    );

    expect(
      attempts.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await prisma.sourcingEvidenceIngestionRun.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sourceKey: '1688.hot_product',
          scopeKey: 'stationery',
          targetKey: 'stationery',
          status: 'collecting',
        },
      }),
    ).toBe(1);
  });

  it('claims one provider lane and discards commit after the source is disabled', async () => {
    const claims = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        collectionRepository.claimAuthorizedRun(collectionClaim(`operation-${index}`)),
      ),
    );
    const permits = claims
      .filter((claim): claim is Extract<typeof claim, { kind: 'claimed' | 'existing' }> =>
        claim.kind === 'claimed' || claim.kind === 'existing',
      )
      .map((claim) => claim.permit);
    expect(permits).toHaveLength(12);
    expect(new Set(permits.map((permit) => permit.runId)).size).toBe(1);
    const permit = permits[0];
    if (!permit) throw new Error('Expected an authorized collection permit');

    await prisma.sourcingCollectionSourceControl.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceKey: '1688.hot_product',
        enabled: false,
      },
    });
    await expect(
      collectionRepository.commit({
        permit,
        output: {
          observations: [],
          typedRecords: [],
          discoveredCount: 0,
          rejectedCount: 0,
          qualityReport: {},
        },
      }),
    ).resolves.toEqual({ kind: 'source_denied', reasonCode: 'source_disabled' });
    await expect(
      prisma.sourcingEvidenceObservation.count({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
    ).resolves.toBe(0);
  });

  it('serializes one recoverable Wing finalize claim and exposes durable completion', async () => {
    const input = recoverableWingFinalizeClaim();
    const claims = await Promise.all(
      Array.from({ length: 8 }, () => collectionRepository.claimRecoverableRun(input)),
    );
    const winner = claims.find(
      (claim): claim is Extract<typeof claim, { kind: 'claimed' }> => claim.kind === 'claimed',
    );
    if (!winner) throw new Error('Expected one recoverable finalize owner');

    expect(claims.filter((claim) => claim.kind === 'claimed')).toHaveLength(1);
    expect(claims.filter((claim) => claim.kind === 'in_progress')).toHaveLength(7);
    await expect(collectionRepository.commit({
      permit: winner.permit,
      output: {
        observations: [],
        typedRecords: [],
        discoveredCount: 0,
        rejectedCount: 0,
        qualityReport: { purpose: 'recommendation_validation' },
      },
    })).resolves.toMatchObject({ kind: 'committed' });
    await expect(collectionRepository.claimRecoverableRun(input)).resolves.toEqual({
      kind: 'completed',
      runId: winner.permit.runId,
    });
  });

  it('reclaims a failed Wing finalize marker with a new token and generation', async () => {
    const input = recoverableWingFinalizeClaim();
    const first = await collectionRepository.claimRecoverableRun(input);
    if (first.kind !== 'claimed') throw new Error('Expected first finalize claim');
    await collectionRepository.fail({
      permit: first.permit,
      error: { code: 'REFRESH_FAILED', message: 'retry me', retryable: true },
    });

    const resumed = await collectionRepository.claimRecoverableRun(input);

    expect(resumed).toMatchObject({
      kind: 'claimed',
      permit: {
        runId: first.permit.runId,
        generation: first.permit.generation + 1,
      },
    });
    if (resumed.kind !== 'claimed') throw new Error('Expected resumed finalize claim');
    expect(resumed.permit.leaseToken).not.toBe(first.permit.leaseToken);
  });

  it('commits extension evidence and stable candidate projection in one authorized transaction', async () => {
    const claim = await collectionRepository.claimAuthorizedRun({
      organizationId: TEST_ORGANIZATION_ID,
      sourceKey: '1688.product_extension',
      scopeKey: 'detail',
      targetKey: '607635921546:',
      idempotencyKey: 'extension-v1-607635921546',
      requestHash: sha256('extension-v1-607635921546'),
      collectorKey: 'kiditem-os-product-extension',
      collectorVersion: 'v1',
      triggerKind: 'extension',
      triggeredByUserId: TEST_USER_ID,
      leaseDurationMs: 60_000,
    });
    if (claim.kind !== 'claimed') throw new Error('Expected an authorized extension claim');
    const capturedAt = new Date();
    const rawPayload = { product_id: '607635921546', price_min: 12.5, moq: 2 };
    const result = await collectionRepository.commit({
      permit: claim.permit,
      output: {
        observations: [{
          organizationId: TEST_ORGANIZATION_ID,
          ingestionRunId: claim.permit.runId,
          sourceKey: '1688.product_extension',
          platform: '1688',
          evidenceFamily: 'supplier_product_extension',
          signalRole: 'supply',
          granularity: 'supply_catalog',
          conceptKey: '어린이 실리콘 식판',
          sourceEntityType: 'supplier_offer',
          sourceEntityId: '607635921546',
          schemaVersion: 'supplier-extension/v1',
          observationKey: sha256('extension-observation-607635921546'),
          revision: 1,
          supportsCandidate: true,
          sourceUrl: 'https://detail.1688.com/offer/607635921546.html',
          eventAt: capturedAt,
          observedAt: capturedAt,
          availableAt: capturedAt,
          revisionAt: null,
          payloadHash: sha256(JSON.stringify(rawPayload)),
          rawPayload,
          ingestedAt: capturedAt,
        }],
        typedRecords: [{
          kind: 'extension_candidate',
          row: {
            organizationId: TEST_ORGANIZATION_ID,
            pageType: 'detail',
            sourceUrl: 'https://detail.1688.com/offer/607635921546.html',
            sourcePlatform: 'ALIBABA_1688',
            externalOfferId: '607635921546',
            variantKeyNormalized: '',
            sourceIdentityHash: sha256('ALIBABA_1688:607635921546:'),
            rawData: rawPayload,
            name: '어린이 실리콘 식판',
            description: null,
            category: null,
            tags: [],
            thumbnailUrl: 'https://cbu01.alicdn.com/img/ibank/example.jpg',
            imageUrl: 'https://cbu01.alicdn.com/img/ibank/example.jpg',
            costCny: 12.5,
            triggeredByUserId: TEST_USER_ID,
            images: [{
              url: 'https://cbu01.alicdn.com/img/ibank/example.jpg',
              role: 'product', label: null, sortOrder: 0,
              source: 'sourcing-extension', isPrimary: true,
            }],
          },
        }],
        discoveredCount: 1,
        rejectedCount: 0,
        qualityReport: { schemaVersion: 'v1' },
      },
    });

    expect(result).toMatchObject({ kind: 'committed', acceptedCount: 1 });
    await expect(prisma.sourcingEvidenceObservation.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sourceKey: '1688.product_extension' },
    })).resolves.toBe(1);
    await expect(prisma.sourcingCandidate.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourcePlatform: 'ALIBABA_1688',
        externalOfferId: '607635921546',
        isDeleted: false,
      },
    })).resolves.toMatchObject({ costCny: expect.anything() });
  });
});

function collectionClaim(idempotencyKey: string) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    sourceKey: '1688.hot_product',
    scopeKey: 'default',
    targetKey: 'children plate',
    idempotencyKey,
    requestHash: sha256('children plate'),
    collectorKey: 'test-collection',
    collectorVersion: 'v1',
    triggerKind: 'manual' as const,
    triggeredByUserId: TEST_USER_ID,
    leaseDurationMs: 60_000,
  };
}

function recoverableWingFinalizeClaim() {
  const operationRunId = '00000000-0000-4000-8000-000000000090';
  return {
    organizationId: TEST_ORGANIZATION_ID,
    sourceKey: 'coupang.wing_catalog',
    scopeKey: 'default',
    targetKey: `finalize:${operationRunId}`,
    idempotencyKey: `wing-operation:${operationRunId}:finalize`,
    requestHash: sha256(`${operationRunId}:recommendation_validation`),
    collectorKey: 'wing-catalog-operation-finalize',
    collectorVersion: '2026-08-14',
    triggerKind: 'extension' as const,
    triggeredByUserId: TEST_USER_ID,
    leaseDurationMs: 120_000,
  };
}

function runData(runKey: string) {
  const now = new Date('2026-08-08T00:00:00.000Z');
  return {
    organizationId: TEST_ORGANIZATION_ID,
    sourceKey: '1688.hot_product',
    scopeKey: 'stationery',
    leaseToken: randomUUID(),
    leaseExpiresAt: new Date('2026-08-08T00:05:00.000Z'),
    sourceControlCheckedAt: now,
    targetKey: 'stationery',
    idempotencyKey: runKey,
    requestHash: sha256(runKey),
    collectorKey: '1688-test',
    collectorVersion: 'test-v1',
    triggerKind: 'test',
    status: 'collecting',
    startedAt: now,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
