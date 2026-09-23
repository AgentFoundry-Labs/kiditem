import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RegistrationStateRepositoryAdapter } from '../adapter/out/persistence/registration-state.repository.adapter';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';

/**
 * 판매상품의 등록 설정과 등록 상태 읽기(KID-310 · KID-313). 원본 기록이 없는 상품도 원본에서 온
 * 상품과 같은 모양으로 읽힌다. 등록 상태는 설정 줄이 아니라 울타리(실행 장부)가 말한다(ADR-0014).
 */
describe('sales product registration state (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let registrations: RegistrationStateRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    registrations = new RegistrationStateRepositoryAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  // 고른 콘텐츠 id 는 Content 소유의 scalar id 다 — 상태 리더는 그대로 비추기만 한다.
  const ASSET_ID = '12121212-1212-4121-8121-121212121212';
  const REVISION_ID = '34343434-3434-4343-8343-343434343434';

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
        selectedThumbnailAssetId: ASSET_ID, selectedDetailPageRevisionId: REVISION_ID },
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
        selectedThumbnailAssetId: ASSET_ID,
        selectedDetailPageRevisionId: REVISION_ID,
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

  it('names the source record of a collected product and projects the fence state of its newest execution', async () => {
    const accountId = await account(TEST_ORGANIZATION_ID);
    const sourceRecordId = randomUUID();
    const product = await prisma.salesProduct.create({
      data: { organizationId: TEST_ORGANIZATION_ID, code: 'KID00000301', status: 'active', name: '수집 상품', sourceRecordId },
    });
    const target = await prisma.registrationTarget.create({
      data: { organizationId: TEST_ORGANIZATION_ID, salesProductId: product.id, channelAccountId: accountId },
    });
    const state = async () => (await registrations.readForSalesProducts(TEST_ORGANIZATION_ID, [product.id])).get(product.id)!;

    expect(await state()).toMatchObject({
      registrationState: 'none',
      preparations: [expect.objectContaining({ salesProductId: product.id, sourceRecordId })],
    });

    await execution(target.id, accountId, { status: 'reconciling', providerOutcome: 'uncertain' });
    expect((await state()).registrationState).toBe('confirming');

    await execution(target.id, accountId, { status: 'failed', providerOutcome: 'definitive_failure' });
    expect(await state()).toMatchObject({ registrationState: 'failed', preparations: [expect.objectContaining({ status: 'failed' })] });

    await execution(target.id, accountId, { status: 'succeeded', providerOutcome: 'succeeded', externalListingId: '427011919' });
    expect(await state()).toMatchObject({ registrationState: 'registered', preparations: [expect.objectContaining({ status: 'registered' })] });
  });

  let executionSequence = 0;
  async function execution(
    registrationTargetId: string,
    channelAccountId: string,
    overrides: { status: string; providerOutcome: string; externalListingId?: string },
  ): Promise<void> {
    executionSequence += 1;
    await prisma.productRegistrationExecution.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        registrationTargetId,
        channelAccountId,
        executionKind: 'external_wing',
        expectedProviderAccountId: 'A00012345',
        idempotencyKey: randomUUID(),
        requestHash: 'a'.repeat(64),
        createdAt: new Date(Date.UTC(2026, 8, 23, 0, 0, executionSequence)),
        ...overrides,
      },
    });
  }
});
