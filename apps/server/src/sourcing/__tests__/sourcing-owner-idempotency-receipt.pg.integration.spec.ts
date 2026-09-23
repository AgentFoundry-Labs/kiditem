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
import { SourceRecordRepositoryAdapter } from '../adapter/out/repository/source-record.repository.adapter';
import { SourceRecordDuplicateError } from '../domain/source-record-admission';
import { SourcingAgentCommandService } from '../application/service/sourcing-agent-command.service';
import { realSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';

describe('Sourcing final owner idempotency receipt (PG integration)', () => {
  let prisma: PrismaClient;
  let candidates: SourceRecordRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    candidates = new SourceRecordRepositoryAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('replays the immutable admission outcome after its draft becomes a selling product, without a second record', async () => {
    const { receipt, record } = receiptInput();
    const first = await candidates.admitOnce(receipt, record, realSalesProductDraftPort(prisma));

    await prisma.salesProduct.update({ where: { id: first.salesProductId }, data: { code: 'KID00000077', status: 'active' } });
    await expect(candidates.admitOnce(receipt, record, realSalesProductDraftPort(prisma))).resolves.toEqual(first);

    await expect(prisma.sourceRecord.count({ where: { organizationId: TEST_ORGANIZATION_ID } })).resolves.toBe(1);
    await expect(prisma.sourcingOwnerIdempotencyReceipt.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      select: { result: true },
    })).resolves.toEqual([{ result: { sourceRecordId: first.sourceRecordId, salesProductId: first.salesProductId } }]);
  });

  /**
   * 직접 작성한 판매상품에는 원천 기록이 없다. 생성 시작 영수증은 초안을 가리키므로 후보 없이도
   * 열리고, 같은 키로 다시 오면 그 결과를 그대로 돌려준다(KID-310 · ADR-0022).
   */
  it('⭐ 후보 없는 직접 작성 초안도 생성 영수증을 열고 같은 키에 같은 결과를 돌려준다', async () => {
    const draft = await prisma.salesProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: null,
        status: 'draft',
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
    const { receipt, record } = receiptInput();
    await candidates.admitOnce(receipt, record, realSalesProductDraftPort(prisma));

    await expect(candidates.admitOnce({ ...receipt, requestHash: 'b'.repeat(64) }, record, realSalesProductDraftPort(prisma)))
      .rejects.toThrow('owner_idempotency_input_conflict');
    await expect(prisma.sourceRecord.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(1);
  });

  it('serializes concurrent quick-process request-hash drift on one existing receipt row', async () => {
    const otherPrisma = makeTestPrisma();
    await otherPrisma.$connect();
    const otherCandidates = new SourceRecordRepositoryAdapter(otherPrisma as unknown as PrismaService);
    // 생성 시작 영수증의 대상은 판매상품 초안이다(KID-310).
    const draft = await prisma.salesProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: null,
        status: 'draft',
        name: 'Quick process receipt draft',
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

  it('lets one of two owner keys for the same source in and refuses the other, leaving one receipt', async () => {
    const { receipt, record } = receiptInput();
    const outcomes = await Promise.allSettled([
      candidates.admitOnce({ ...receipt, idempotencyKey: 'owner:attempt:parallel-one' }, record, realSalesProductDraftPort(prisma)),
      candidates.admitOnce({ ...receipt, idempotencyKey: 'owner:attempt:parallel-two', requestHash: 'b'.repeat(64) },
        record, realSalesProductDraftPort(prisma)),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect((outcomes.find((outcome) => outcome.status === 'rejected') as PromiseRejectedResult).reason)
      .toBeInstanceOf(SourceRecordDuplicateError);
    await expect(prisma.sourceRecord.count({ where: { organizationId: TEST_ORGANIZATION_ID } })).resolves.toBe(1);
    // 거절된 쪽은 영수증을 남기지 않는다 — 같은 키로 다시 와도 같은 거절이다.
    await expect(prisma.sourcingOwnerIdempotencyReceipt.count({ where: { organizationId: TEST_ORGANIZATION_ID } }))
      .resolves.toBe(1);
  });
  /**
   * 직접 작성(`POST /api/sourcing/product-generation`)은 원본 기록을 만들지 않는다(KID-313). 초안은
   * `sourceRecordId = null` 이고, 같은 멱등 키로 다시 오면 같은 초안이다.
   */
  it('⭐ 직접 작성은 원본 기록 없이 초안 하나를 만들고, 같은 키의 재시도는 그 초안을 다시 쓴다', async () => {
    const gateway = {
      registerUploadedDetailPage: async (input: { salesProductId: string }) => ({
        salesProductId: input.salesProductId, detailGenerationId: 'uploaded', contentWorkspaceId: null, href: '/x',
      }),
      startProductGeneration: async () => { throw new Error('not used'); },
    };
    const commands = new SourcingAgentCommandService(candidates, gateway as never, realSalesProductDraftPort(prisma));
    const command = {
      title: '직접 만든 상품',
      imageUrls: ['https://cdn.example.com/1.jpg'],
      detailPageImageUrls: ['https://cdn.example.com/detail.jpg'],
      salePrice: 12_000,
    };
    const coordinate = { idempotencyKey: 'direct-generation', requestHash: 'e'.repeat(64) };

    const first = await commands.createProductGeneration(command, TEST_ORGANIZATION_ID, TEST_USER_ID, coordinate);
    const again = await commands.createProductGeneration(command, TEST_ORGANIZATION_ID, TEST_USER_ID, coordinate);

    expect(again.salesProductId).toBe(first.salesProductId);
    await expect(prisma.sourceRecord.count()).resolves.toBe(0);
    const draft = await prisma.salesProduct.findUniqueOrThrow({
      where: { id: first.salesProductId },
      include: { options: true },
    });
    expect(draft).toMatchObject({
      status: 'draft', code: null, sourceRecordId: null, sourcePlatform: 'KIDITEM_PRODUCT_REGISTRATION', name: '직접 만든 상품',
    });
    expect(draft.options.map((option) => option.salePrice)).toEqual([12_000]);
    await expect(prisma.salesProduct.count()).resolves.toBe(1);
  });
});

function receiptInput() {
  return {
    receipt: {
      organizationId: TEST_ORGANIZATION_ID,
      capabilityKey: 'sourcing.ingestCandidate',
      idempotencyKey: 'owner:attempt:ingest-candidate',
      requestHash: 'a'.repeat(64),
    },
    record: {
      organizationId: TEST_ORGANIZATION_ID,
      sourceUrl: 'https://detail.1688.com/offer/1.html',
      sourcePlatform: 'ALIBABA_1688',
      externalOfferId: '1',
      variantKeyNormalized: '',
      sourceIdentityHash: 'c'.repeat(64),
      rawData: { source: 'pg-receipt-test' },
      name: 'Receipt source',
      description: '',
      category: null,
      tags: [],
      thumbnailUrl: null,
      imageUrl: null,
      costCny: null,
      triggeredByUserId: TEST_USER_ID,
      images: [],
    },
  };
}
