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
import { SourcingCandidateRepositoryAdapter } from '../adapter/out/repository/sourcing-candidate.repository.adapter';
import { realSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';

describe('Sourcing final owner idempotency receipt (PG integration)', () => {
  let prisma: PrismaClient;
  let candidates: SourcingCandidateRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    candidates = new SourcingCandidateRepositoryAdapter(prisma as unknown as PrismaService, realSalesProductDraftPort(prisma));
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('replays the immutable candidate outcome after promotion, rejection, and deletion without duplicating', async () => {
    const input = receiptInput();
    const first = await candidates.upsertSourcedWithIdempotencyReceipt(input);

    await prisma.sourcingCandidate.update({
      where: { id: first.candidateId },
      data: { status: 'promoted' },
    });
    await expect(candidates.upsertSourcedWithIdempotencyReceipt(input)).resolves.toEqual(first);

    await prisma.sourcingCandidate.update({
      where: { id: first.candidateId },
      data: { status: 'rejected' },
    });
    await expect(candidates.upsertSourcedWithIdempotencyReceipt(input)).resolves.toEqual(first);

    await prisma.sourcingCandidate.update({
      where: { id: first.candidateId },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    await expect(candidates.upsertSourcedWithIdempotencyReceipt(input)).resolves.toEqual(first);
    await expect(prisma.sourcingCandidate.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(1);
    await expect(prisma.sourcingOwnerIdempotencyReceipt.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(1);
  });

  /**
   * 직접 작성한 판매상품에는 원천 기록이 없다. 생성 시작 영수증은 초안을 가리키므로 후보 없이도
   * 열리고, 같은 키로 다시 오면 그 결과를 그대로 돌려준다(KID-310 · ADR-0022).
   */
  it('⭐ 후보 없는 직접 작성 초안도 생성 영수증을 열고 같은 키에 같은 결과를 돌려준다', async () => {
    const draft = await prisma.salesProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'DIRECTLY-AUTHORED-GENERATION',
        name: '직접 만든 상품',
      },
      select: { id: true },
    });
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: draft.id,
      idempotencyKey: 'owner:attempt:direct-generation',
      requestHash: 'c'.repeat(64),
    };

    await expect(candidates.claimQuickProcess(input)).resolves.toEqual({ salesProductId: draft.id });
    await expect(candidates.claimQuickProcess(input)).resolves.toEqual({ salesProductId: draft.id });
    await expect(prisma.sourcingOwnerIdempotencyReceipt.findMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        capabilityKey: 'sourcing.quick_process',
        idempotencyKey: input.idempotencyKey,
      },
      select: { result: true },
    })).resolves.toEqual([{ result: { salesProductId: draft.id } }]);

    // 같은 키에 다른 요청이 오면 재응답이 아니라 충돌이다 — 후보 키로 적힌 옛 영수증도 여기서 막힌다.
    await expect(candidates.claimQuickProcess({ ...input, requestHash: 'd'.repeat(64) }))
      .rejects.toThrow('owner_idempotency_input_conflict');
  });

  it('rejects the same owner key when the canonical request hash changes', async () => {
    const input = receiptInput();
    await candidates.upsertSourcedWithIdempotencyReceipt(input);

    await expect(candidates.upsertSourcedWithIdempotencyReceipt({
      ...input,
      requestHash: 'b'.repeat(64),
    })).rejects.toThrow('owner_idempotency_input_conflict');
    await expect(prisma.sourcingCandidate.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(1);
  });

  it('serializes concurrent quick-process request-hash drift on one existing receipt row', async () => {
    const candidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: 'https://detail.1688.com/offer/quick-process.html',
        sourcePlatform: 'ALIBABA_1688',
        name: 'Quick process receipt candidate',
      },
      select: { id: true },
    });
    const otherPrisma = makeTestPrisma();
    await otherPrisma.$connect();
    const otherCandidates = new SourcingCandidateRepositoryAdapter(
      otherPrisma as unknown as PrismaService,
      realSalesProductDraftPort(otherPrisma),
    );
    // 생성 시작 영수증의 대상은 판매상품 초안이다(KID-310).
    const draft = await prisma.salesProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidate.id,
        code: 'QUICK-PROCESS-RECEIPT',
        name: 'Quick process receipt candidate',
      },
      select: { id: true },
    });
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: draft.id,
      idempotencyKey: 'owner:attempt:quick-process',
    };

    try {
      const outcomes = await Promise.allSettled([
        candidates.claimQuickProcess({ ...input, requestHash: 'a'.repeat(64) }),
        otherCandidates.claimQuickProcess({ ...input, requestHash: 'b'.repeat(64) }),
      ]);

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
      const rejected = outcomes.find(
        (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
      );
      expect(rejected?.reason).toMatchObject({
        message: 'owner_idempotency_input_conflict',
      });
      await expect(prisma.sourcingOwnerIdempotencyReceipt.findMany({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          capabilityKey: 'sourcing.quick_process',
          idempotencyKey: input.idempotencyKey,
        },
        select: { requestHash: true, result: true },
      })).resolves.toEqual([
        expect.objectContaining({ result: { salesProductId: draft.id } }),
      ]);
    } finally {
      await otherPrisma.$disconnect();
    }
  });

  it('recovers one concurrent source identity conflict with a bounded retry and records both owner receipts', async () => {
    const [first, second] = await Promise.all([
      candidates.upsertSourcedWithIdempotencyReceipt({
        ...receiptInput(),
        idempotencyKey: 'owner:attempt:parallel-one',
      }),
      candidates.upsertSourcedWithIdempotencyReceipt({
        ...receiptInput(),
        idempotencyKey: 'owner:attempt:parallel-two',
        requestHash: 'b'.repeat(64),
      }),
    ]);

    expect(second.candidateId).toBe(first.candidateId);
    await expect(prisma.sourcingCandidate.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(1);
    await expect(prisma.sourcingOwnerIdempotencyReceipt.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(2);
  });

  it('serializes a normalized Alibaba URL without a source identity hash across different owner keys', async () => {
    const [first, second] = await Promise.all([
      candidates.upsertSourcedWithIdempotencyReceipt({
        ...receiptInput(),
        idempotencyKey: 'owner:attempt:alibaba-url-one',
        sourceUrl: 'https://www.alibaba.com/product-detail/toy_123.html',
        sourcePlatform: 'ALIBABA',
        externalOfferId: null,
        sourceIdentityHash: null,
      }),
      candidates.upsertSourcedWithIdempotencyReceipt({
        ...receiptInput(),
        idempotencyKey: 'owner:attempt:alibaba-url-two',
        requestHash: 'b'.repeat(64),
        sourceUrl: 'https://www.alibaba.com/product-detail/toy_123.html',
        sourcePlatform: 'ALIBABA',
        externalOfferId: null,
        sourceIdentityHash: null,
      }),
    ]);

    expect(second.candidateId).toBe(first.candidateId);
    await expect(prisma.sourcingCandidate.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: 'https://www.alibaba.com/product-detail/toy_123.html',
      },
    })).resolves.toBe(1);
    await expect(prisma.sourcingOwnerIdempotencyReceipt.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(2);
    await expect(prisma.sourcingOwnerIdempotencyReceipt.findMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        capabilityKey: 'sourcing.ingestCandidate',
        idempotencyKey: {
          in: [
            'owner:attempt:alibaba-url-one',
            'owner:attempt:alibaba-url-two',
          ],
        },
      },
      select: { idempotencyKey: true, result: true },
      orderBy: { idempotencyKey: 'asc' },
    })).resolves.toEqual([
      {
        idempotencyKey: 'owner:attempt:alibaba-url-one',
        result: { candidateId: first.candidateId },
      },
      {
        idempotencyKey: 'owner:attempt:alibaba-url-two',
        result: { candidateId: first.candidateId },
      },
    ]);
  });
});

function receiptInput() {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    capabilityKey: 'sourcing.ingestCandidate',
    idempotencyKey: 'owner:attempt:ingest-candidate',
    requestHash: 'a'.repeat(64),
    sourceUrl: 'https://detail.1688.com/offer/1.html',
    sourcePlatform: 'ALIBABA_1688',
    externalOfferId: '1',
    variantKeyNormalized: '',
    sourceIdentityHash: 'c'.repeat(64),
    rawData: { source: 'pg-receipt-test' },
    name: 'Receipt candidate',
    description: '',
    category: null,
    tags: [],
    thumbnailUrl: null,
    imageUrl: null,
    costCny: null,
    triggeredByUserId: TEST_USER_ID,
    images: [],
  };
}
