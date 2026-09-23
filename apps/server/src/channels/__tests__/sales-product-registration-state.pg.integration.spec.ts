import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RegistrationStateRepositoryAdapter } from '../adapter/out/persistence/registration-state.repository.adapter';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';

/**
 * 등록 상태 reader 가 읽는 계정별 Channels 사실(KID-320). 계정 줄은 등록 설정과 리스팅의 합집합이고, 실행은
 * 등록성(register · update · composition_change) · 가용성(sold_out · resume)으로 나눠 최신 한 건씩, 마지막 성공
 * 등록성 실행이 얼린 값과 함께 읽는다. `thumbnail_update` 와 보관된 설정은 읽지 않는다.
 */
describe('registration state facts (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let queries = 0;
  let facts: RegistrationStateRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const counted = prisma.$extends({
      query: {
        async $allOperations({ args, query }) {
          queries += 1;
          return query(args);
        },
      },
    });
    facts = new RegistrationStateRepositoryAdapter(counted as unknown as PrismaService);
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  const DETAIL_REVISION = '34343434-3434-4343-8343-343434343434';
  const THUMBNAIL_ASSET = '12121212-1212-4121-8121-121212121212';

  async function account(name: string, organizationId = ORG) {
    const id = randomUUID();
    await prisma.channelAccount.create({
      data: { id, organizationId, channel: `mall-${id.slice(0, 8)}`, name, externalAccountId: `external-${id}`, status: 'active' },
    });
    return id;
  }

  async function product(organizationId = ORG, version = 1) {
    return prisma.salesProduct.create({
      data: { organizationId, code: `KID${randomUUID().slice(0, 8)}`, status: 'active', name: '판매 상품', version },
    });
  }

  async function target(salesProductId: string, channelAccountId: string, extra: { archivedAt?: Date; version?: number } = {}) {
    return prisma.registrationTarget.create({
      data: { organizationId: ORG, salesProductId, channelAccountId, ...extra },
    });
  }

  async function listing(salesProductId: string | null, channelAccountId: string, extra: { status?: string; isActive?: boolean } = {}) {
    return prisma.channelListing.create({
      data: { organizationId: ORG, salesProductId, channelAccountId, externalId: `ext-${randomUUID().slice(0, 8)}`, status: extra.status ?? '승인완료', isActive: extra.isActive ?? true },
    });
  }

  let sequence = 0;
  async function execution(input: {
    registrationTargetId: string | null;
    channelAccountId: string;
    channelListingId?: string | null;
    kind: string;
    status: string;
    providerOutcome?: string;
    payload?: Record<string, unknown>;
  }) {
    sequence += 1;
    return prisma.productRegistrationExecution.create({
      data: {
        organizationId: ORG,
        registrationTargetId: input.registrationTargetId,
        channelAccountId: input.channelAccountId,
        channelListingId: input.channelListingId ?? null,
        executionKind: input.kind,
        idempotencyKey: randomUUID(),
        requestHash: 'a'.repeat(64),
        status: input.status,
        providerOutcome: input.providerOutcome ?? (input.status === 'succeeded' ? 'succeeded' : 'not_attempted'),
        ...(input.payload ? { submissionPayloadJson: input.payload as Prisma.InputJsonValue } : {}),
        createdAt: new Date(Date.UTC(2026, 8, 24, 0, 0, sequence)),
        ...(['succeeded', 'failed', 'cancelled'].includes(input.status)
          ? { completedAt: new Date(Date.UTC(2026, 8, 24, 0, 0, sequence)) }
          : {}),
      },
    });
  }

  function registerPayload(targetVersion: number, productVersion: number) {
    return {
      targetVersion,
      product: { version: productVersion },
      detailPage: { revisionId: DETAIL_REVISION, html: '<p>상세</p>' },
      adapterPayload: { representativeImage: { assetId: THUMBNAIL_ASSET, url: 'https://cdn.example/a.png' } },
    };
  }

  it('reads one row per account: registered, re-sending, and listing-only accounts of the same product', async () => {
    const registeredAccount = await account('등록된 몰');
    const updatingAccount = await account('수정 중 몰');
    const catalogAccount = await account('카탈로그 몰');
    const item = await product(ORG, 4);
    const registeredTarget = await target(item.id, registeredAccount, { version: 2 });
    const updatingTarget = await target(item.id, updatingAccount);
    const registeredListing = await listing(item.id, registeredAccount);
    const updatingListing = await listing(item.id, updatingAccount);
    const catalogListing = await listing(item.id, catalogAccount, { status: 'observed' });

    const registered = await execution({ registrationTargetId: registeredTarget.id, channelAccountId: registeredAccount, kind: 'register', status: 'succeeded', payload: registerPayload(2, 4) });
    const updating = await execution({ registrationTargetId: updatingTarget.id, channelAccountId: updatingAccount, channelListingId: updatingListing.id, kind: 'update', status: 'prepared', payload: { targetVersion: 1, product: { version: 4 }, detailPage: null, adapterPayload: {} } });

    const read = (await facts.readFacts(ORG, [item.id])).get(item.id)!;

    expect(read.productVersion).toBe(4);
    const byAccount = new Map(read.accounts.map((row) => [row.channelAccountId, row]));
    expect(byAccount.size).toBe(3);
    expect(byAccount.get(registeredAccount)).toMatchObject({
      channelAccountName: '등록된 몰',
      target: { id: registeredTarget.id, version: 2, selectedThumbnailAssetId: null, selectedDetailPageRevisionId: null },
      listing: { id: registeredListing.id, externalId: registeredListing.externalId, status: '승인완료' },
      latestListingShaping: { id: registered.id, kind: 'register', status: 'succeeded', providerOutcome: 'succeeded' },
      lastSucceededFrozen: { targetVersion: 2, productVersion: 4, detailPageRevisionId: DETAIL_REVISION, representativeImageAssetId: THUMBNAIL_ASSET },
      latestAvailability: null,
    });
    expect(byAccount.get(updatingAccount)).toMatchObject({
      target: { id: updatingTarget.id },
      listing: { id: updatingListing.id },
      latestListingShaping: { id: updating.id, kind: 'update', status: 'prepared' },
      lastSucceededFrozen: null,
    });
    expect(byAccount.get(catalogAccount)).toMatchObject({
      target: null,
      listing: { id: catalogListing.id, status: 'observed' },
      latestListingShaping: null,
      lastSucceededFrozen: null,
      latestAvailability: null,
    });
  });

  it('keeps the latest listing-shaping execution per account: failed and cancelled registrations without a listing', async () => {
    const mall = await account('몰');
    const failedProduct = await product();
    const cancelledProduct = await product();
    const failedTarget = await target(failedProduct.id, mall);
    const cancelledTarget = await target(cancelledProduct.id, mall);
    await execution({ registrationTargetId: failedTarget.id, channelAccountId: mall, kind: 'register', status: 'cancelled' });
    await execution({ registrationTargetId: failedTarget.id, channelAccountId: mall, kind: 'register', status: 'failed', providerOutcome: 'definitive_failure' });
    await execution({ registrationTargetId: cancelledTarget.id, channelAccountId: mall, kind: 'register', status: 'cancelled' });

    const read = await facts.readFacts(ORG, [failedProduct.id, cancelledProduct.id]);

    expect(read.get(failedProduct.id)!.accounts).toEqual([expect.objectContaining({
      listing: null,
      latestListingShaping: expect.objectContaining({ kind: 'register', status: 'failed', providerOutcome: 'definitive_failure' }),
      lastSucceededFrozen: null,
    })]);
    expect(read.get(cancelledProduct.id)!.accounts).toEqual([expect.objectContaining({
      latestListingShaping: expect.objectContaining({ status: 'cancelled' }),
    })]);
  });

  it('reads availability apart from listing-shaping, and never a thumbnail_update row', async () => {
    const mall = await account('몰');
    const item = await product();
    const itemTarget = await target(item.id, mall);
    const itemListing = await listing(item.id, mall);
    await execution({ registrationTargetId: itemTarget.id, channelAccountId: mall, kind: 'register', status: 'succeeded', payload: registerPayload(1, 1) });
    await execution({ registrationTargetId: itemTarget.id, channelAccountId: mall, channelListingId: itemListing.id, kind: 'sold_out', status: 'succeeded' });
    const soldOut = (await facts.readFacts(ORG, [item.id])).get(item.id)!.accounts[0];
    expect(soldOut.latestAvailability).toEqual({ kind: 'sold_out', status: 'succeeded' });
    expect(soldOut.latestListingShaping).toMatchObject({ kind: 'register', status: 'succeeded' });

    // 리스팅 단위 재개(설정 없이 리스팅에 건 실행)도 이 계정의 가용성이다.
    await execution({ registrationTargetId: null, channelAccountId: mall, channelListingId: itemListing.id, kind: 'resume', status: 'succeeded' });
    await execution({ registrationTargetId: null, channelAccountId: mall, channelListingId: itemListing.id, kind: 'thumbnail_update', status: 'failed', providerOutcome: 'definitive_failure' });
    const resumed = (await facts.readFacts(ORG, [item.id])).get(item.id)!.accounts[0];
    expect(resumed.latestAvailability).toEqual({ kind: 'resume', status: 'succeeded' });
    expect(resumed.latestListingShaping).toMatchObject({ kind: 'register', status: 'succeeded' });
  });

  it('ignores an archived target but still counts the listing it left behind; never reads another organization', async () => {
    const archivedOnly = await account('보관만 된 몰');
    const archivedWithListing = await account('리스팅 남은 몰');
    const item = await product();
    const gone = await target(item.id, archivedOnly, { archivedAt: new Date() });
    await execution({ registrationTargetId: gone.id, channelAccountId: archivedOnly, kind: 'register', status: 'failed', providerOutcome: 'definitive_failure' });
    const leftBehind = await target(item.id, archivedWithListing, { archivedAt: new Date() });
    await execution({ registrationTargetId: leftBehind.id, channelAccountId: archivedWithListing, kind: 'register', status: 'succeeded', payload: registerPayload(1, 1) });
    const oldListing = await listing(item.id, archivedWithListing);
    await listing(item.id, archivedOnly, { isActive: false });

    const foreignAccount = await account('다른 조직 몰', OTHER_ORGANIZATION_ID);
    const foreign = await product(OTHER_ORGANIZATION_ID);
    await prisma.registrationTarget.create({ data: { organizationId: OTHER_ORGANIZATION_ID, salesProductId: foreign.id, channelAccountId: foreignAccount } });

    const read = await facts.readFacts(ORG, [item.id, foreign.id]);

    expect(read.has(foreign.id)).toBe(false);
    expect(read.get(item.id)!.accounts).toEqual([expect.objectContaining({
      channelAccountId: archivedWithListing,
      target: null,
      listing: expect.objectContaining({ id: oldListing.id }),
      latestListingShaping: null,
    })]);
  });

  it('reads a page of products with the same number of queries as one product', async () => {
    const mall = await account('몰');
    const other = await account('다른 몰');
    const products = [];
    for (let index = 0; index < 5; index += 1) {
      const item = await product();
      const itemTarget = await target(item.id, mall);
      await listing(item.id, other);
      await execution({ registrationTargetId: itemTarget.id, channelAccountId: mall, kind: 'register', status: 'succeeded', payload: registerPayload(1, 1) });
      products.push(item.id);
    }

    queries = 0;
    await facts.readFacts(ORG, products.slice(0, 1));
    const single = queries;
    expect(single).toBeGreaterThan(0);
    queries = 0;
    const read = await facts.readFacts(ORG, products);
    expect(read.size).toBe(5);
    expect(queries).toBe(single);
  });
});
