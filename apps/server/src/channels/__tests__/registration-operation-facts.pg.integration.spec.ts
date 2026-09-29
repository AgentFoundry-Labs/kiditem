import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { seedRegistrationOperation } from './registration-operation-seeds';
import {
  readPreparedRegistrationRecipes,
  readRegistrationFailureCounts,
  readSalesProductOptionExecutionCounts,
  readUnresolvedCompositionOptionIds,
} from '../adapter/out/persistence/registration-operation-facts';

const KIDKIDS = '11111111-1111-4111-8111-111111111111';
const WING = '22222222-2222-4222-8222-222222222222';
const OTHER_KIDKIDS = '33333333-3333-4333-8333-333333333333';
const SECOND_KIDKIDS = '44444444-4444-4444-8444-444444444444';
const PRODUCT = '60000000-0000-4000-8000-000000000001';
const LISTING = '70000000-0000-4000-8000-000000000001';
const SECOND_LISTING = '70000000-0000-4000-8000-000000000002';

/**
 * 등록 실행(`channels.registration`)에서 fence 밖 Channels 어댑터가 읽는 사실(KID-364, 옛 등록 실행 원장 reader 를 옮김).
 * 실행 행은 실행 계약 표에 있고, 읽기는 plan 을 품은 실행만 본다.
 */
describe('registration operation facts (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  const failed = (channelAccountId: string, mallKey: string, organizationId = TEST_ORGANIZATION_ID) => seedRegistrationOperation(prisma, {
    organizationId, executionKind: 'register', mallKey, channelAccountId, payload: { snapshot: null, form: {} }, status: 'failed',
  });

  it('counts failed registrations per mall, fences organizations and leaves out representative images', async () => {
    await failed(KIDKIDS, 'kidkids');
    await failed(KIDKIDS, 'kidkids');
    await failed(SECOND_KIDKIDS, 'kidkids');
    await failed(WING, 'coupang');
    await failed(OTHER_KIDKIDS, 'kidkids', OTHER_ORGANIZATION_ID);
    await seedRegistrationOperation(prisma, { executionKind: 'register', mallKey: 'kidkids', channelAccountId: KIDKIDS, payload: { snapshot: null, form: {} }, status: 'succeeded' });
    await seedRegistrationOperation(prisma, { executionKind: 'thumbnail_update', mallKey: 'coupang', channelAccountId: WING, payload: {}, status: 'failed' });

    await expect(prisma.$transaction((tx) => readRegistrationFailureCounts(tx, { organizationId: TEST_ORGANIZATION_ID }))).resolves.toEqual([
      { channel: 'kidkids', mallName: '키드키즈', count: 3 },
      { channel: 'coupang', mallName: '쿠팡 WING', count: 1 },
    ]);
  });

  it('counts a registration whose lease lapsed with the browser gone as failed, as the contract will close it', async () => {
    const lapsed = await seedRegistrationOperation(prisma, { executionKind: 'register', mallKey: 'kidkids', channelAccountId: KIDKIDS, payload: { snapshot: null, form: {} }, status: 'executing' });
    await expect(prisma.$transaction((tx) => readRegistrationFailureCounts(tx, { organizationId: TEST_ORGANIZATION_ID }))).resolves.toEqual([]);
    await prisma.operation.update({ where: { id: lapsed.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    await expect(prisma.$transaction((tx) => readRegistrationFailureCounts(tx, { organizationId: TEST_ORGANIZATION_ID }))).resolves.toEqual([
      { channel: 'kidkids', mallName: '키드키즈', count: 1 },
    ]);
  });

  it('holds only the options of live composition changes and releases them once the change ends', async () => {
    const composition = (channelListingId: string, status: 'prepared' | 'executing' | 'reconciling' | 'succeeded', optionIds: string[]) =>
      seedRegistrationOperation(prisma, {
        executionKind: 'composition_change', channelAccountId: KIDKIDS, channelListingId,
        payload: { snapshot: { optionTransitions: optionIds.map((channelListingOptionId) => ({ channelListingOptionId })) }, form: null },
        status,
      });
    const running = await composition(LISTING, 'executing', ['option-a', 'option-b']);
    const held = await composition(SECOND_LISTING, 'reconciling', ['option-c']);
    await composition(LISTING, 'prepared', ['option-not-started']);
    await composition(LISTING, 'succeeded', ['option-done']);
    const read = () => prisma.$transaction((tx) => readUnresolvedCompositionOptionIds(tx, {
      organizationId: TEST_ORGANIZATION_ID, channelListingIds: [LISTING, SECOND_LISTING],
    }));

    await expect(read()).resolves.toEqual(new Set(['option-a', 'option-b', 'option-c']));
    await prisma.operation.update({ where: { id: running.id }, data: { status: 'succeeded', finishedAt: new Date() } });
    await expect(read()).resolves.toEqual(new Set(['option-c']));
    await prisma.operation.update({ where: { id: held.id }, data: { status: 'failed', finishedAt: new Date() } });
    await expect(read()).resolves.toEqual(new Set());
  });

  it('counts each option a registration froze for the product, once per operation', async () => {
    const snapshot = { product: { id: PRODUCT, options: [{ id: 'opt-1' }, { id: 'opt-2' }, { id: 'opt-1' }] } };
    await seedRegistrationOperation(prisma, { executionKind: 'register', channelAccountId: KIDKIDS, salesProductId: PRODUCT, payload: { snapshot, form: null }, status: 'succeeded' });
    await seedRegistrationOperation(prisma, { executionKind: 'update', channelAccountId: KIDKIDS, salesProductId: PRODUCT, payload: { snapshot: { product: { options: [{ id: 'opt-1' }] } }, form: null }, status: 'failed' });
    const counts = await prisma.$transaction((tx) => readSalesProductOptionExecutionCounts(tx, { organizationId: TEST_ORGANIZATION_ID, salesProductId: PRODUCT }));
    expect(Object.fromEntries(counts)).toEqual({ 'opt-1': 2, 'opt-2': 1 });
  });

  it('reads the frozen recipe of a succeeded register by the listing it connected, and refuses a tampered payload', async () => {
    const snapshot = { adapterPayload: { vendorItemCode: 'KID00000001' } };
    const registered = await seedRegistrationOperation(prisma, {
      executionKind: 'register', channelAccountId: WING, payload: { snapshot, form: null }, status: 'succeeded', result: { channelListingId: LISTING },
    });
    await seedRegistrationOperation(prisma, {
      executionKind: 'register', channelAccountId: WING, payload: { snapshot, form: null }, status: 'failed', result: { channelListingId: LISTING },
    });
    const read = () => prisma.$transaction((tx) => readPreparedRegistrationRecipes(tx, { organizationId: TEST_ORGANIZATION_ID, channelListingIds: [LISTING] }));
    await expect(read()).resolves.toEqual([{ channelListingId: LISTING, snapshot }]);

    const stored = await prisma.operation.findUniqueOrThrow({ where: { id: registered.id } });
    const plan = stored.plan as { payload: { snapshot: Record<string, unknown> } };
    plan.payload.snapshot = { adapterPayload: { vendorItemCode: 'KID99999999' } };
    await prisma.operation.update({ where: { id: registered.id }, data: { plan: plan as unknown as Prisma.InputJsonValue } });
    await expect(read()).rejects.toMatchObject({ code: 'INTERNAL_ERROR', details: { reason: 'REGISTERED_RECIPE_HASH_MISMATCH' } });
  });
});
