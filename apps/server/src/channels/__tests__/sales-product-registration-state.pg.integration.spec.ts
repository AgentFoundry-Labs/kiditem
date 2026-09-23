import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProductPreparationRepositoryAdapter } from '../adapter/out/persistence/candidate-registration.repository.adapter';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';

/**
 * 판매상품 초안의 등록 설정과 등록 상태 읽기(KID-310). 후보가 없는 초안도 후보에서 온 초안과
 * 같은 모양으로 읽혀야 수집상품 화면이 후보 응답에 기대지 않는다.
 */
describe('sales product registration state (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let registrations: ProductPreparationRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    // 읽기는 Prisma 만 쓴다 — 쓰기 경로의 port 는 이 spec 에서 불리지 않는다.
    registrations = new ProductPreparationRepositoryAdapter(
      prisma as unknown as PrismaService, {} as never, {} as never, {} as never,
    );
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function account(organizationId: string) {
    const id = randomUUID();
    await prisma.channelAccount.create({
      data: { id, organizationId, channel: `test-${id.slice(0, 8)}`, name: '몰 계정',
        externalAccountId: `external-${id}`, status: 'active' },
    });
    return id;
  }

  it('reads the registration setting of a draft that has no collected candidate', async () => {
    const accountId = await account(TEST_ORGANIZATION_ID);
    const direct = await prisma.salesProduct.create({
      data: { organizationId: TEST_ORGANIZATION_ID, code: null, name: '직접 작성 초안' },
    });
    const target = await prisma.registrationTarget.create({
      data: { organizationId: TEST_ORGANIZATION_ID, salesProductId: direct.id, channelAccountId: accountId,
        selectedThumbnailUrl: 'https://cdn.example.com/t.png' },
    });

    const views = await registrations.readForSalesProducts(TEST_ORGANIZATION_ID, [direct.id]);

    expect(views.get(direct.id)).toMatchObject({
      registrationState: 'none',
      preparations: [{
        id: target.id,
        salesProductId: direct.id,
        sourceRecordId: null,
        channelAccountId: accountId,
        status: 'draft',
        selectedThumbnailUrl: 'https://cdn.example.com/t.png',
      }],
    });
  });

  it('answers a draft with no setting as none, and never another organization\'s draft', async () => {
    const empty = await prisma.salesProduct.create({
      data: { organizationId: TEST_ORGANIZATION_ID, code: null, name: '설정 없는 초안' },
    });
    const foreignAccount = await account(OTHER_ORGANIZATION_ID);
    const foreign = await prisma.salesProduct.create({
      data: { organizationId: OTHER_ORGANIZATION_ID, code: null, name: '다른 조직 초안' },
    });
    await prisma.registrationTarget.create({
      data: { organizationId: OTHER_ORGANIZATION_ID, salesProductId: foreign.id, channelAccountId: foreignAccount },
    });

    const views = await registrations.readForSalesProducts(TEST_ORGANIZATION_ID, [empty.id, foreign.id]);

    expect(views.get(empty.id)).toEqual({ preparations: [], registrationState: 'none' });
    expect(views.has(foreign.id)).toBe(false);
  });

  it('keeps answering by candidate for a draft that came from one', async () => {
    const accountId = await account(TEST_ORGANIZATION_ID);
    const candidateId = randomUUID();
    const draft = await prisma.salesProduct.create({
      data: { organizationId: TEST_ORGANIZATION_ID, code: null, name: '수집 초안', sourceRecordId: candidateId },
    });
    await prisma.registrationTarget.create({
      data: { organizationId: TEST_ORGANIZATION_ID, salesProductId: draft.id, channelAccountId: accountId },
    });

    const byCandidate = await registrations.readForCandidates(TEST_ORGANIZATION_ID, [candidateId]);

    expect(byCandidate.get(candidateId)?.preparations).toEqual([
      expect.objectContaining({ salesProductId: draft.id, sourceRecordId: candidateId }),
    ]);
  });
});
