import { realRegistrationContentWorkspace } from '../../test-helpers/registration-content-workspace';
import { productTransactionalRead } from './product-transactional-read.fake';
import { channelAdapters } from './channel-adapters';
import { RegistrationTargetRepositoryAdapter } from '../adapter/out/persistence/registration-target.repository.adapter';
import { RegistrationExecutionRepositoryAdapter } from '../adapter/out/repository/registration-execution.repository.adapter';
import type { TargetExecutionIntent } from '../application/port/out/repository/registration-execution.repository.port';
import { randomUUID } from 'node:crypto';
import { ERROR_DEFINITIONS, type KiditemErrorCode } from '@kiditem/shared/errors';
import type { PrismaClient } from '@prisma/client';
import { REGISTRATION_ALREADY_REGISTERED_CODE, type PrepareTargetExecutionInput, type ReportTargetExecutionInput } from '@kiditem/shared/sales-product';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';

const MALL_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const WING_ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';
const SALES_PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const SALES_PRODUCT_OPTION_ID = '55555555-5555-4555-8555-555555555555';
/** 직접 작성한 판매상품 — 원천 기록(후보)이 없다. */
const DIRECT_SALES_PRODUCT_ID = '66666666-6666-4666-8666-666666666666';
const DIRECT_SALES_PRODUCT_OPTION_ID = '77777777-7777-4777-8777-777777777777';
const KIDKIDS_ADMIN = 'https://partner.kidkids.net';

/**
 * 등록 실행 울타리(ADR-0014 · ADR-0020)를 등록 대상 실행 경로에서 잰다(KID-321). 몰 전용 경로는 없다 —
 * 폼 몰 · 쿠팡 WING 모두 대상 하나에 살아 있는 실행 하나, 같은 키는 같은 실행, 결과는 `outcome` 하나로
 * 보고한다. 몰마다 다른 것은 채널 어댑터가 맡는다.
 */
describe('registration execution fence (PG integration)', () => {
  let prisma: PrismaClient;
  let targets: RegistrationTargetRepositoryAdapter;
  let repository: RegistrationExecutionRepositoryAdapter;
  let candidateId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new RegistrationExecutionRepositoryAdapter(
      prisma as unknown as PrismaService,
      channelAdapters(),
    );
    targets = new RegistrationTargetRepositoryAdapter(
      prisma as unknown as PrismaService,
      productTransactionalRead(),
      realRegistrationContentWorkspace(prisma),
    );
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.createMany({
      data: [
        { id: MALL_ACCOUNT_ID, organizationId: TEST_ORGANIZATION_ID, channel: 'kidkids', externalAccountId: 'seller-1', name: 'kidkids', status: 'active' },
        { id: SECOND_ACCOUNT_ID, organizationId: TEST_ORGANIZATION_ID, channel: 'smartstore', externalAccountId: 'seller-2', name: 'smartstore', status: 'active' },
        { id: WING_ACCOUNT_ID, organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', name: 'Wing', status: 'active' },
      ],
    });
    candidateId = (await prisma.sourceRecord.create({
      data: {
        sourceIdentityHash: randomUUID(),
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: `https://1688.com/item/${randomUUID()}`,
        sourcePlatform: 'ALIBABA_1688',
        rawData: {},
        name: 'Kids rain boots',
      },
    })).id;
    await createProduct(SALES_PRODUCT_ID, SALES_PRODUCT_OPTION_ID, 'Kids rain boots', candidateId);
  });

  it('refuses a target on an archived product and prepares a registration only for a selling product with a KID', async () => {
    await prisma.salesProduct.update({ where: { id: SALES_PRODUCT_ID }, data: { status: 'archived' } });
    await expect(targets.resolve(TEST_ORGANIZATION_ID, { salesProductId: SALES_PRODUCT_ID, channelAccountId: MALL_ACCOUNT_ID }))
      .rejects.toThrow('보관된 판매상품');

    await prisma.salesProduct.update({ where: { id: SALES_PRODUCT_ID }, data: { status: 'active' } });
    const targetId = await resolveTarget(MALL_ACCOUNT_ID);
    await prisma.salesProduct.update({ where: { id: SALES_PRODUCT_ID }, data: { status: 'draft', code: null } });
    await expect(prepare(targetId, MALL_ACCOUNT_ID)).rejects.toMatchObject(refused('CHANNELS_SALES_PRODUCT_NOT_SELLING'));
    expect(await prisma.productRegistrationExecution.count()).toBe(0);
  });

  it('returns one target under concurrent same-account resolution and keeps separate targets per account', async () => {
    const [left, right] = await Promise.all([resolveTarget(MALL_ACCOUNT_ID), resolveTarget(MALL_ACCOUNT_ID)]);
    expect(left).toBe(right);
    const second = await resolveTarget(SECOND_ACCOUNT_ID);
    expect(second).not.toBe(left);
    expect(await prisma.registrationTarget.count({
      where: { organizationId: TEST_ORGANIZATION_ID, salesProductId: SALES_PRODUCT_ID, archivedAt: null },
    })).toBe(2);
  });

  it('runs the same fence for a directly authored product that has no source record', async () => {
    await createProduct(DIRECT_SALES_PRODUCT_ID, DIRECT_SALES_PRODUCT_OPTION_ID, 'Direct rain boots', null);
    const targetId = await resolveTarget(MALL_ACCOUNT_ID, DIRECT_SALES_PRODUCT_ID);
    const prepared = await prepare(targetId, MALL_ACCOUNT_ID, { salesProductId: DIRECT_SALES_PRODUCT_ID });
    const started = await start(prepared.executionId);
    await expect(report(prepared.executionId, started, 'confirmed', { externalListingId: 'direct-1' }))
      .resolves.toMatchObject({ status: 'succeeded' });
    await expect(prisma.channelListing.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, channelAccountId: MALL_ACCOUNT_ID, externalId: 'direct-1' },
      select: { salesProductId: true },
    })).resolves.toEqual({ salesProductId: DIRECT_SALES_PRODUCT_ID });
  });

  it('keeps the source record as provenance and refuses a new registration once the product is archived', async () => {
    const targetId = await resolveTarget(MALL_ACCOUNT_ID);
    const prepared = await prepare(targetId, MALL_ACCOUNT_ID);
    await prisma.salesProduct.update({ where: { id: SALES_PRODUCT_ID }, data: { status: 'archived' } });

    // 남은 실행은 판매상품을 통해 원천 기록에 닿는다 — 실행 행이 원천을 열쇠로 갖지 않는다.
    await expect(prisma.salesProduct.findUniqueOrThrow({ where: { id: SALES_PRODUCT_ID }, select: { sourceRecordId: true } }))
      .resolves.toEqual({ sourceRecordId: candidateId });
    await expect(start(prepared.executionId)).rejects.toMatchObject(refused('CHANNELS_EXECUTION_STALE'));
    await expect(resolveTarget(SECOND_ACCOUNT_ID)).rejects.toThrow('보관된 판매상품');
  });

  it('admits one live execution per target: another intent conflicts until the first closes as not submitted', async () => {
    const targetId = await resolveTarget(MALL_ACCOUNT_ID);
    const first = await prepare(targetId, MALL_ACCOUNT_ID);
    await expect(prepare(targetId, MALL_ACCOUNT_ID)).rejects.toMatchObject({ code: 'CHANNELS_LISTING_EXECUTION_ACTIVE' });

    const started = await start(first.executionId);
    await expect(report(first.executionId, started, 'not_submitted', { message: '폼 채우기 실패' }))
      .resolves.toMatchObject({ status: 'failed', providerOutcome: 'definitive_failure' });
    await expect(prepare(targetId, MALL_ACCOUNT_ID)).resolves.toMatchObject({ status: 'prepared' });
    expect(await prisma.productRegistrationExecution.count({ where: { registrationTargetId: targetId } })).toBe(2);
  });

  it('keeps an unknown outcome reconciling and blocking, then leaves the target open for the next intent after success', async () => {
    const targetId = await resolveTarget(MALL_ACCOUNT_ID);
    const prepared = await prepare(targetId, MALL_ACCOUNT_ID);
    const started = await start(prepared.executionId);
    await expect(report(prepared.executionId, started, 'uncertain', {}))
      .resolves.toMatchObject({ status: 'reconciling', providerOutcome: 'uncertain' });
    await expect(prepare(targetId, MALL_ACCOUNT_ID)).rejects.toMatchObject({ code: 'CHANNELS_LISTING_EXECUTION_ACTIVE' });
    // 결과를 모르는 제출은 "제출 안 됨"으로 되돌릴 수 없다 — 몰 식별자가 있으면 거절된다.
    await report(prepared.executionId, started, 'submitted', { externalListingId: 'kk-9' });
    await expect(report(prepared.executionId, started, 'not_submitted', {})).rejects.toMatchObject(refused('CHANNELS_EXECUTION_EVIDENCE_REJECTED'));

    await expect(report(prepared.executionId, started, 'confirmed', { externalListingId: 'kk-9' }))
      .resolves.toMatchObject({ status: 'succeeded' });
    await expect(prisma.registrationTarget.findUniqueOrThrow({ where: { id: targetId }, select: { archivedAt: true } }))
      .resolves.toEqual({ archivedAt: null });
    // 이미 등록된 계정에 새 register 는 열리지 않는다 — 몰에 올라간 리스팅을 이름으로 말한다(KID-320 S7).
    await expect(prepare(targetId, MALL_ACCOUNT_ID)).rejects.toMatchObject({
      ...refused(REGISTRATION_ALREADY_REGISTERED_CODE),
      details: { existing: { externalListingId: 'kk-9' } },
    });
  });

  it('refuses a new register when the account already has an active listing of the product, naming it, before any intent', async () => {
    const targetId = await resolveTarget(MALL_ACCOUNT_ID);
    await prisma.channelListing.create({
      data: { organizationId: TEST_ORGANIZATION_ID, channelAccountId: MALL_ACCOUNT_ID, salesProductId: SALES_PRODUCT_ID, externalId: 'catalog-77', status: '판매중' },
    });

    const refusal = await prepare(targetId, MALL_ACCOUNT_ID).catch((error: unknown) => error);
    expect(refusal).toMatchObject({
      ...refused(REGISTRATION_ALREADY_REGISTERED_CODE),
      details: { existing: { externalListingId: 'catalog-77' } },
    });
    expect(await prisma.productRegistrationExecution.count()).toBe(0);
    // 다른 계정은 막지 않는다.
    await expect(prepare(await resolveTarget(SECOND_ACCOUNT_ID), SECOND_ACCOUNT_ID)).resolves.toMatchObject({ status: 'prepared' });
  });

  it('refuses a new register after a succeeded listing-shaping execution until the listing it made is taken down; a later cancelled execution changes nothing', async () => {
    const targetId = await resolveTarget(MALL_ACCOUNT_ID);
    await prisma.channelListing.create({
      data: { organizationId: TEST_ORGANIZATION_ID, channelAccountId: MALL_ACCOUNT_ID, salesProductId: SALES_PRODUCT_ID, externalId: 'gone-1', status: '판매중지', isActive: false },
    });
    const row = (kind: string, status: string, seconds: number, externalListingId: string | null = null) => prisma.productRegistrationExecution.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID, registrationTargetId: targetId, channelAccountId: MALL_ACCOUNT_ID, executionKind: kind,
        idempotencyKey: randomUUID(), requestHash: 'a'.repeat(64), status,
        providerOutcome: status === 'succeeded' ? 'succeeded' : 'not_attempted', externalListingId,
        createdAt: new Date(Date.UTC(2026, 8, 20, 0, 0, seconds)), completedAt: new Date(Date.UTC(2026, 8, 20, 0, 0, seconds)),
      },
    });
    // 내린 리스팅(gone-1)을 만든 성공 실행은 막지 않는다 — 몰에 더는 없다.
    await row('register', 'succeeded', 1, 'gone-1');
    await expect(prepare(targetId, MALL_ACCOUNT_ID)).resolves.toMatchObject({ status: 'prepared' });
    await prisma.productRegistrationExecution.deleteMany({ where: { status: 'prepared' } });

    // 카탈로그가 아직 가져오지 않은 성공 실행(kk-41)은 실행만으로 막는다.
    await row('register', 'succeeded', 2, 'kk-41');
    await expect(prepare(targetId, MALL_ACCOUNT_ID)).rejects.toMatchObject({ details: { existing: { externalListingId: 'kk-41' } } });

    // 취소는 몰에 아무것도 하지 않았으므로 앞선 성공을 지우지 않는다.
    await row('register', 'cancelled', 3);
    await expect(prepare(targetId, MALL_ACCOUNT_ID)).rejects.toMatchObject({ details: { existing: { externalListingId: 'kk-41' } } });
  });

  it('replays concurrent same-key preparations as one execution and grants one lease to concurrent starts', async () => {
    const targetId = await resolveTarget(MALL_ACCOUNT_ID);
    const key = randomUUID();
    const [left, right] = await Promise.all([prepare(targetId, MALL_ACCOUNT_ID, { key }), prepare(targetId, MALL_ACCOUNT_ID, { key })]);
    expect(left.executionId).toBe(right.executionId);
    const starts = await Promise.all([start(left.executionId), start(left.executionId)]);
    expect(starts.filter((result) => result.maySubmit)).toHaveLength(1);
    expect(new Set(starts.map((result) => result.leaseToken)).size).toBe(1);
  });

  it('refuses a Wing registration before any intent when the account has no vendor identity', async () => {
    const targetId = await resolveTarget(WING_ACCOUNT_ID);
    await expect(prepare(targetId, WING_ACCOUNT_ID)).rejects.toThrow('vendor identity');
    expect(await prisma.productRegistrationExecution.count()).toBe(0);
  });

  async function createProduct(id: string, optionId: string, name: string, sourceRecordId: string | null) {
    await prisma.salesProduct.create({
      data: { id, organizationId: TEST_ORGANIZATION_ID, sourceRecordId, code: `SP-${id.slice(0, 8)}`, status: 'active', name },
    });
    await prisma.salesProductOption.create({
      data: {
        id: optionId, organizationId: TEST_ORGANIZATION_ID, salesProductId: id, optionCode: `KID${id.slice(0, 8).replace(/\D/g, '0')}`,
        optionKey: '단일', values: [], salePrice: 12900, normalPrice: 15900, supplyStatus: 'selling', sortOrder: 0,
      },
    });
  }

  /** 등록 대상을 세우는 길은 하나다 — 상품 × 몰 계정으로 찾거나 만든다(KID-310 · ADR-0022). */
  function resolveTarget(channelAccountId: string, salesProductId = SALES_PRODUCT_ID): Promise<string> {
    return targets.resolve(TEST_ORGANIZATION_ID, { salesProductId, channelAccountId });
  }

  async function prepare(targetId: string, channelAccountId: string, input: { salesProductId?: string; key?: string } = {}) {
    const request: PrepareTargetExecutionInput = {
      expectedVersion: 1, kind: 'register', idempotencyKey: input.key ?? randomUUID(),
      applyCompositionTemplate: false, optionTransitions: [],
    };
    return repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID, request,
      snapshot: await intentFor(targetId, channelAccountId, input.salesProductId ?? SALES_PRODUCT_ID),
    });
  }

  function start(executionId: string) {
    return repository.startTarget({ organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID, executionId });
  }

  function report(
    executionId: string,
    started: { leaseToken: string | null; payloadHash: string },
    outcome: ReportTargetExecutionInput['outcome'],
    evidence: Partial<ReportTargetExecutionInput['evidence']>,
  ) {
    const externalListingId = evidence.externalListingId;
    return repository.reportTarget({
      organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID, executionId,
      report: {
        leaseToken: started.leaseToken!, payloadHash: started.payloadHash, outcome,
        evidence: {
          channelAccountId: MALL_ACCOUNT_ID,
          ...(outcome === 'confirmed' && externalListingId
            ? { providerAccountId: 'seller-1', observedUrl: `${KIDKIDS_ADMIN}/goods/${externalListingId}` }
            : {}),
          ...evidence,
        },
      },
    });
  }

  /** 서비스가 모으는 실행 의도 — 판매 상품 · 선택 옵션 · 몰 값을 지금 행에서 읽는다. */
  async function intentFor(targetId: string, channelAccountId: string, salesProductId: string): Promise<TargetExecutionIntent> {
    const target = await prisma.registrationTarget.findUniqueOrThrow({
      where: { id: targetId },
      select: { version: true, registrationInput: true, selectedOptions: { orderBy: { sortOrder: 'asc' }, select: { salesProductOptionId: true } } },
    });
    const product = await prisma.salesProduct.findUniqueOrThrow({ where: { id: salesProductId }, include: { options: true } });
    const timestamp = new Date().toISOString();
    return {
      targetId, targetVersion: target.version, channelAccountId, kind: 'register', channelListingId: null,
      applyCompositionTemplate: false, optionTransitions: [], detailPage: null,
      registrationInput: target.registrationInput as Record<string, unknown>,
      product: {
        id: product.id, code: product.code, ownCode: null, sabangnetGoodsNo: null, sourcePlatform: null, sourceUrl: null,
        description: '', targetAudience: null, ageGroup: null, productSize: null, colorVariantNames: [], boxSetQuantity: null,
        registrationDefaults: null, kcStatus: 'unknown', sourceRecordId: product.sourceRecordId, name: product.name,
        shortName: null, englishName: null, printName: null, modelName: null, modelNo: null, brand: null, manufacturer: null,
        originCountry: null, originRegion: null, keywords: [], standardCategory: null, status: product.status as 'active',
        taxType: 'taxable', deliveryFeeType: null, deliveryFee: null, optionAxes: [], stockManaged: false, imageUrls: [],
        noticeCategory: null, noticeValues: [], certifications: [], importDeclarationNo: null, adminMemo: null,
        version: product.version, createdAt: timestamp, updatedAt: timestamp, channelOverrides: [], channelListings: [],
        options: target.selectedOptions.map(({ salesProductOptionId }) => {
          const option = product.options.find((row) => row.id === salesProductOptionId)!;
          return {
            id: option.id, optionCode: option.optionCode, values: [], optionKey: option.optionKey, alias: null, barcode: null,
            salePrice: option.salePrice, normalPrice: option.normalPrice, supplyStatus: option.supplyStatus as 'selling',
            safetyStock: null, sortOrder: option.sortOrder, referenceCost: null, components: [], linkedChannelOptionCount: 0,
          };
        }),
      },
    };
  }
});

/** 거절은 등록 코드와 그 kind로 단언한다(문장 단언 금지, KID-341). */
function refused(code: KiditemErrorCode) {
  return { code, kind: ERROR_DEFINITIONS[code].kind };
}
