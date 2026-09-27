import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ERROR_DEFINITIONS, type KiditemErrorCode } from '@kiditem/shared/errors';
import {
  REGISTRATION_EVIDENCE_CHUNK_KIND,
  REGISTRATION_KIND,
  RegistrationPlanSchema,
  parseRegistrationPayload,
} from '@kiditem/shared/channels-operations';
import type { OperationBeginResponse } from '@kiditem/shared/operation';
import type { RegistrationMallInput } from '@kiditem/shared/sales-product';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { seedSourceProduct } from '../../test-helpers/inventory-seeds';
import { realRegistrableDetailPages, realRegistrationContentWorkspace } from '../../test-helpers/registration-content-workspace';
import { realDraftDeletionPorts, untouchedRegistrationStates } from '../../test-helpers/sales-product-draft-port';
import { OperationRepositoryAdapter } from '../../common/operation/adapter/out/repository/operation.repository.adapter';
import { OperationOwnerRegistry } from '../../common/operation/application/service/operation-owner.registry';
import { OperationService } from '../../common/operation/application/service/operation.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { ownerTransaction } from '../../prisma/owner-transaction';
import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { ProductMappingGenerationRepositoryAdapter } from '../../products/adapter/out/persistence/product-mapping-generation.repository.adapter';
import { RegistrationOperationOwner } from '../adapter/in/operation/registration-operation-owner';
import { ChannelIntegrityAdapter } from '../adapter/out/integrity/channel-integrity.adapter';
import { ChannelOptionRecipeRepositoryAdapter } from '../adapter/out/persistence/channel-option-recipe.repository.adapter';
import { RegistrationTargetRepositoryAdapter } from '../adapter/out/persistence/registration-target.repository.adapter';
import { SalesProductRepositoryAdapter } from '../adapter/out/persistence/sales-product.repository.adapter';
import { ThumbnailExecutionPersistenceAdapter } from '../adapter/out/persistence/thumbnail-execution.persistence.adapter';
import { ChannelsProductMappingGenerationAdapter } from '../adapter/out/products/product-mapping-generation.adapter';
import { RegistrationOperationRepositoryAdapter } from '../adapter/out/repository/registration-operation.repository.adapter';
import type { ChannelRegistrableThumbnailPort } from '../application/port/out/content/registrable-thumbnail.port';
import type { ChannelRegistrableDetailPagePort } from '../application/port/out/content/registrable-detail-page.port';
import { ChannelOptionRecipeService } from '../application/service/listing/channel-option-recipe.service';
import { RegistrationOperationService } from '../application/service/registration/registration-operation.service';
import { RegistrationTargetUseCase } from '../application/service/registration/registration-target.usecase';
import { ThumbnailExecutionService } from '../application/service/registration/thumbnail-execution.service';
import { SalesProductUseCase } from '../application/service/sales-product/sales-product.usecase';
import { channelAdapters, realRegistrationPreflight } from './channel-adapters';
import { hashRegistrationSubmissionPayload } from '../domain/registration/registration-submission-payload';
import { productTransactionalRead } from './product-transactional-read.fake';

/**
 * 옛 등록 실행 fence · 대상 실행 저장소 스펙(`registration-target-execution.repository.pg`, `registration-execution-fence.pg`)의
 * 회귀 케이스를 등록 실행 kind 의 seam(실행 계약 begin · chunk · finish → owner plan · finalize)으로 옮겼다(KID-364).
 * 옛 준비 · 시작 거절은 plan 거절이고, 옛 결과 보고는 증거 청크 + finish 다. 몰 사실은 실제 채널 어댑터(Wing 셀피아 사전검사
 * 포함)가 읽고, Content 의 상세 · 대표이미지만 여기서 정한다.
 */
const WING_LISTING_ID = '1234567890';
const WING_URL = `https://wing.coupang.com/tenants/seller-web/vendor-inventory/modify?sellerProductId=${WING_LISTING_ID}`;
const checksum = (payload: unknown[]) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');
const refused = (code: KiditemErrorCode) => ({ code, kind: ERROR_DEFINITIONS[code].kind });

describe('registration operation regressions carried over from the execution fence (PostgreSQL, KID-364)', () => {
  let prisma: PrismaClient;
  let operations: OperationService;
  let targets: RegistrationTargetRepositoryAdapter;
  let detail: { revisionId: string; html: string } | null = null;
  let representative: { assetId: string; url: string } | null = null;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const db = prisma as unknown as PrismaService;
    targets = new RegistrationTargetRepositoryAdapter(db, productTransactionalRead(), realRegistrationContentWorkspace(prisma));
    const salesProducts = new SalesProductUseCase(
      new SalesProductRepositoryAdapter(db, productTransactionalRead(), targets, realRegistrationContentWorkspace(prisma), realRegistrableDetailPages(prisma)),
      ...realDraftDeletionPorts(prisma),
      untouchedRegistrationStates,
    );
    const recipes = new ChannelOptionRecipeService(new ChannelOptionRecipeRepositoryAdapter(
      db, new ProductTransactionalReadRepositoryAdapter(), new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
    ));
    const adapters = channelAdapters({ registration: realRegistrationPreflight(prisma) });
    // Content 는 외부 owner 다 — 이 스펙은 고른 상세 · 대표이미지가 plan 에 얼려지는지만 본다.
    const detailPages = { read: async () => detail } as unknown as ChannelRegistrableDetailPagePort;
    const thumbnails = {
      find: async () => representative ? { assetId: representative.assetId, contentWorkspaceId: randomUUID(), salesProductId: '', image: { url: representative.url, sha256: null } } : null,
    } as unknown as ChannelRegistrableThumbnailPort;
    const registry = new OperationOwnerRegistry(null as never, null as never);
    operations = new OperationService(new OperationRepositoryAdapter(db), registry);
    const service = new RegistrationOperationService(
      new RegistrationOperationRepositoryAdapter(db, adapters, recipes), salesProducts, new RegistrationTargetUseCase(targets),
      detailPages, thumbnails, new ThumbnailExecutionService(thumbnails, new ThumbnailExecutionPersistenceAdapter(db)),
      adapters, new ChannelIntegrityAdapter(), operations,
    );
    registry.register(new RegistrationOperationOwner(service));
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    detail = null;
    representative = null;
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  const begin = (scope: Record<string, unknown>) =>
    operations.begin(ORG, { kind: REGISTRATION_KIND, scope: { idempotencyKey: `k-${randomUUID()}`, submit: true, ...scope } }, { userId: USER });
  const planOf = (begun: OperationBeginResponse) => RegistrationPlanSchema.parse(begun.operation.plan);
  const register = (fixture: Fixture, extra: Record<string, unknown> = {}) =>
    begin({ executionKind: 'register', registrationTargetId: fixture.targetId, expectedVersion: 1, ...extra });
  const confirm = async (begun: OperationBeginResponse, evidence: Record<string, unknown>) => {
    const payload = [{
      payloadHash: planOf(begun).payloadHash, observedUrl: null, providerAccountId: 'vendor-1', observedStatus: null, message: null, options: [],
      ...evidence,
    }];
    await operations.putChunk({
      organizationId: ORG, operationId: begun.operation.id, token: begun.token, chunkKind: REGISTRATION_EVIDENCE_CHUNK_KIND, sequence: 1,
      request: { checksum: checksum(payload), payload },
    });
    return operations.finish({
      organizationId: ORG, operationId: begun.operation.id, token: begun.token,
      request: { outcome: 'succeeded', result: { submitted: true, mallOutcome: 'confirmed', providerOutcome: 'succeeded' } },
    });
  };
  const status = async (id: string) => (await prisma.operation.findUniqueOrThrow({ where: { id } })).status;

  describe('plan refusals (old prepare · start fences)', () => {
    const CASES: Array<[string, KiditemErrorCode, (fixture: Fixture) => Promise<unknown>]> = [
      ['stale target version', 'CHANNELS_REGISTRATION_TARGET_STALE', (f) => prisma.registrationTarget.update({ where: { id: f.targetId }, data: { version: { increment: 1 } } })],
      ['archived target', 'CHANNELS_REGISTRATION_TARGET_NOT_FOUND', (f) => prisma.registrationTarget.update({ where: { id: f.targetId }, data: { archivedAt: new Date() } })],
      ['changed selected options', 'VALIDATION_FAILED', (f) => prisma.registrationTargetOption.deleteMany({ where: { registrationTargetId: f.targetId } })],
      ['unused option', 'CHANNELS_PREFLIGHT_FAILED', (f) => prisma.salesProductOption.update({ where: { id: f.optionId }, data: { supplyStatus: 'unused' } })],
      ['archived product', 'CHANNELS_SALES_PRODUCT_NOT_SELLING', (f) => prisma.salesProduct.update({ where: { id: f.productId }, data: { status: 'archived' } })],
      ['inactive account', 'CHANNELS_ACCOUNT_INACTIVE', (f) => prisma.channelAccount.update({ where: { id: f.accountId }, data: { status: 'inactive' } })],
    ];
    it.each(CASES)('refuses a register after a %s before any lock', async (_name, code, change) => {
      const fixture = await createFixture(prisma, targets);
      await change(fixture);
      await expect(register(fixture)).rejects.toMatchObject(refused(code));
      expect(await prisma.operation.count()).toBe(0);
    });

    it('refuses an update or composition change whose listing was taken down, and a composition change whose option was', async () => {
      const fixture = await createFixture(prisma, targets, { listing: true, component: true });
      const transitions = [{ channelListingOptionId: fixture.listingOptionId, salesProductOptionId: fixture.optionId }];
      await prisma.channelListingOption.update({ where: { id: fixture.listingOptionId! }, data: { isActive: false } });
      await expect(begin({ executionKind: 'composition_change', registrationTargetId: fixture.targetId, expectedVersion: 1, channelListingId: fixture.listingId, optionTransitions: transitions }))
        .rejects.toMatchObject({ ...refused('CHANNELS_EXECUTION_STALE'), details: { reason: 'COMPOSITION_OPTIONS_INACTIVE' } });
      await prisma.channelListing.update({ where: { id: fixture.listingId! }, data: { isActive: false } });
      await expect(begin({ executionKind: 'composition_change', registrationTargetId: fixture.targetId, expectedVersion: 1, channelListingId: fixture.listingId, optionTransitions: transitions }))
        .rejects.toMatchObject({ ...refused('CHANNELS_EXECUTION_STALE'), details: { reason: 'LISTING_INACTIVE' } });
      expect(await prisma.operation.count()).toBe(0);
    });

    it('refuses a register whose selling option has no issued KID', async () => {
      const fixture = await createFixture(prisma, targets);
      await prisma.salesProductOption.update({ where: { id: fixture.optionId }, data: { optionCode: null } });
      await expect(register(fixture)).rejects.toMatchObject(refused('CHANNELS_KID_REQUIRED'));
      expect(await prisma.operation.count()).toBe(0);
    });

    it('keeps the price update inside 10 to 10,000,000 won on a mall that takes price sends', async () => {
      const fixture = await createFixture(prisma, targets, { listing: true, channel: 'kakao' });
      const update = () => begin({ executionKind: 'update', registrationTargetId: fixture.targetId, expectedVersion: 1, channelListingId: fixture.listingId, updateFields: ['salePrice'] });
      for (const price of [9, 10_000_001]) {
        await prisma.salesProductOption.update({ where: { id: fixture.optionId }, data: { salePrice: price } });
        await expect(update()).rejects.toMatchObject(refused('VALIDATION_FAILED'));
      }
      await prisma.salesProductOption.update({ where: { id: fixture.optionId }, data: { salePrice: 10 } });
      const begun = await update();
      expect(parseRegistrationPayload('update', planOf(begun).payload).snapshot).toMatchObject({ kind: 'update', updateFields: ['salePrice'], detailPage: null });
    });
  });

  describe('one registration per account (old fence)', () => {
    it('refuses a new register while the account has an active listing of the product, naming it, and opens again once it is taken down', async () => {
      const fixture = await createFixture(prisma, targets, { listing: true, channel: 'kidkids' });
      await expect(register(fixture)).rejects.toMatchObject({
        ...refused('REGISTRATION_ALREADY_REGISTERED'), details: { existing: { externalListingId: 'provider-listing-1' } },
      });
      await prisma.channelListing.update({ where: { id: fixture.listingId! }, data: { isActive: false } });
      const begun = await register(fixture);
      await confirm(begun, { channelAccountId: fixture.accountId, externalListingId: 'kk-2' });
      await expect(register(fixture)).rejects.toMatchObject(refused('REGISTRATION_ALREADY_REGISTERED'));
    });

    it('refuses a Wing register before any lock when the account has no vendor identity, and a missing target with 404', async () => {
      const fixture = await createFixture(prisma, targets, { channel: 'coupang' });
      await prisma.channelAccount.update({ where: { id: fixture.accountId }, data: { vendorId: null, externalAccountId: null } });
      await expect(register(fixture)).rejects.toThrow('vendor identity');
      expect(await prisma.operation.count()).toBe(0);
      await expect(begin({ executionKind: 'register', registrationTargetId: randomUUID(), expectedVersion: 1 }))
        .rejects.toMatchObject(refused('CHANNELS_REGISTRATION_TARGET_NOT_FOUND'));
    });

    it('confirms a generic mall register whose screen gives no seller id, and still refuses a different seller id', async () => {
      const fixture = await createFixture(prisma, targets, { channel: 'kidkids' });
      const begun = await register(fixture);
      await expect(confirm(begun, { channelAccountId: fixture.accountId, providerAccountId: null, externalListingId: 'kk-no-seller' }))
        .resolves.toMatchObject({ operation: { status: 'succeeded' } });
      const other = await createFixture(prisma, targets, { channel: 'kidkids', externalAccountSuffix: '-other' });
      const second = await register(other);
      await expect(confirm(second, { channelAccountId: other.accountId, providerAccountId: 'someone-else', externalListingId: 'kk-other' }))
        .rejects.toMatchObject({ ...refused('CHANNELS_EXECUTION_EVIDENCE_REJECTED'), details: { reason: 'account_mismatch' } });
    });

    it('refuses a confirmation that names another mall account', async () => {
      const fixture = await createFixture(prisma, targets, { channel: 'kidkids' });
      const begun = await register(fixture);
      await expect(confirm(begun, { channelAccountId: randomUUID(), externalListingId: 'kk-1' }))
        .rejects.toMatchObject({ ...refused('CHANNELS_EXECUTION_EVIDENCE_REJECTED'), details: { reason: 'EVIDENCE_ACCOUNT_MISMATCH' } });
    });
  });

  it('keeps the scope submit for a price update even on a mall whose registration is not pressed by the browser (price send is not [등록])', async () => {
    const fixture = await createFixture(prisma, targets, { listing: true, channel: 'kidsnote' });
    const update = await begin({ executionKind: 'update', registrationTargetId: fixture.targetId, expectedVersion: 1, channelListingId: fixture.listingId, updateFields: ['salePrice'], submit: true });
    expect(planOf(update).submit).toBe(true);
    await operations.cancel(ORG, update.operation.id);
    const registerPlan = planOf(await register(fixture, { channelListingId: fixture.listingId }));
    expect(registerPlan.submit).toBe(false);
  });

  describe('freezing', () => {
    it('freezes the detail and representative image only for register and composition change, and never writes run values into the target', async () => {
      const fixture = await createFixture(prisma, targets, { listing: true, channel: 'kakao' });
      detail = { revisionId: randomUUID(), html: '<p>동결한 상세</p>' };
      representative = { assetId: randomUUID(), url: 'https://storage.example.com/representative.png' };
      const adapterValues = { deliveryType: '이번 실행 값', '0': '0' };
      const registered = await register(fixture, { channelListingId: fixture.listingId, adapterValues, adapterDefaults: { fulfillmentMode: '0' } });
      const snapshot = parseRegistrationPayload('register', planOf(registered).payload).snapshot!;
      expect(snapshot).toMatchObject({ detailPage: detail, adapterValues, adapterDefaults: { fulfillmentMode: '0' }, adapterPayload: { representativeImage: representative } });
      await operations.cancel(ORG, registered.operation.id);
      await expect(prisma.registrationTarget.findUniqueOrThrow({ where: { id: fixture.targetId }, select: { registrationInput: true, version: true } }))
        .resolves.toEqual({ registrationInput: fixture.registrationInput, version: 1 });

      const updated = await begin({ executionKind: 'update', registrationTargetId: fixture.targetId, expectedVersion: 1, channelListingId: fixture.listingId, updateFields: ['salePrice'] });
      const priceOnly = parseRegistrationPayload('update', planOf(updated).payload).snapshot!;
      expect(priceOnly.detailPage).toBeNull();
      expect(priceOnly.adapterPayload).not.toHaveProperty('representativeImage');
    });
  });

  describe('Coupang Wing end to end', () => {
    async function wingFixture() {
      const fixture = await createFixture(prisma, targets, {
        channel: 'coupang', component: true,
        registrationInput: { mallCategory: null, mallFields: {}, adapter: { coupang: { wingCategoryKey: '64687', wingProduct: { sellerProductName: 'WING 등록명', variants: [{ maximumBuyForPerson: 3 }] } } } },
      });
      await prisma.$transaction((tx) => realRegistrationContentWorkspace(prisma).ensureSalesProductWorkspace(ownerTransaction(tx), {
        organizationId: ORG, salesProductId: fixture.productId, createdByUserId: null,
      }));
      return fixture;
    }
    const wingScope = (fixture: Fixture) => ({
      adapterValues: { sellpiaInventorySkuId: fixture.masterProductId, sellpiaQuantity: '2' },
      form: { categoryCell: '웹 카테고리', productName: '웹 노출명', variants: [{ stock: 999, salePrice: 3_000 }] },
    });

    it('freezes the adapter payload and the overlaid form in the payload hash, confirms by vendor and Wing URL and applies the Sellpia recipe', async () => {
      const fixture = await wingFixture();
      const begun = await register(fixture, wingScope(fixture));
      const plan = planOf(begun);
      expect(plan).toMatchObject({ mallKey: 'coupang', expectedProviderAccountId: 'vendor-1', submit: true });
      const payload = parseRegistrationPayload('register', plan.payload);
      expect(payload.snapshot!.adapterPayload).toMatchObject({
        wingProduct: { sellerProductName: 'WING 등록명', productName: '공통 상품', variants: [{ maximumBuyForPerson: 3, vendorItemCode: 'KID00000001' }] },
        sellpiaMatch: { sellpiaInventorySkuId: fixture.masterProductId, quantity: 2 },
        existingChannelListing: null,
        vendorItemCode: 'KID00000001',
      });
      // 웹 폼 위에 얼린 WING 값이 덮이고, 그 최종본이 payloadHash 에 들어간다.
      expect(payload.form).toMatchObject({ categoryCell: '웹 카테고리', productName: '공통 상품', sellerProductName: 'WING 등록명', variants: [{ stock: 999, vendorItemCode: 'KID00000001' }] });
      expect(plan.payloadHash).toBe(hashRegistrationSubmissionPayload(plan.payload, new ChannelIntegrityAdapter().sha256));
      await expect(prisma.registrationTarget.findUniqueOrThrow({ where: { id: fixture.targetId }, select: { registrationInput: true } }))
        .resolves.toEqual({ registrationInput: fixture.registrationInput });

      await expect(confirm(begun, {
        channelAccountId: fixture.accountId, observedUrl: WING_URL, externalListingId: WING_LISTING_ID,
        options: [{ salesProductOptionId: fixture.optionId, externalOptionId: '88001122', sellerSku: 'KID00000001' }],
      })).resolves.toMatchObject({ operation: { status: 'succeeded' } });
      const listing = await prisma.channelListing.findFirstOrThrow({
        where: { organizationId: ORG, channelAccountId: fixture.accountId, externalId: WING_LISTING_ID },
        select: { salesProductId: true, options: { select: { kidItemCode: true, inventoryComponents: { select: { masterProductId: true, quantity: true } } } } },
      });
      expect(listing).toEqual({ salesProductId: fixture.productId, options: [{ kidItemCode: 'KID00000001', inventoryComponents: [{ masterProductId: fixture.masterProductId, quantity: 2 }] }] });
    });

    it.each([
      ['a foreign vendor', { providerAccountId: 'vendor-9' }],
      ['no vendor', { providerAccountId: null }],
      ['a non-Wing URL', { observedUrl: 'https://www.coupang.com/vp/products/1' }],
      ['a non-numeric listing id', { externalListingId: 'W-123' }],
    ])('refuses Wing confirmation from %s and writes no listing', async (_name, evidence) => {
      const fixture = await wingFixture();
      const begun = await register(fixture, wingScope(fixture));
      await expect(confirm(begun, { channelAccountId: fixture.accountId, observedUrl: WING_URL, externalListingId: WING_LISTING_ID, ...evidence }))
        .rejects.toMatchObject(refused('CHANNELS_EXECUTION_EVIDENCE_REJECTED'));
      expect(await prisma.channelListing.count({ where: { organizationId: ORG, channelAccountId: fixture.accountId } })).toBe(0);
      expect(await status(begun.operation.id)).toBe('executing');
    });
  });

  describe('confirmation recipes', () => {
    it('refuses an omitted or partial option identity for a templated registration and writes nothing', async () => {
      for (const mode of ['omitted', 'partial'] as const) {
        const fixture = await createFixture(prisma, targets, { channel: 'kidkids', externalAccountSuffix: `-${mode}` });
        const second = await addSelectedOption(prisma, targets, fixture);
        const begun = await register(fixture, { expectedVersion: 2, applyCompositionTemplate: true });
        await expect(confirm(begun, {
          channelAccountId: fixture.accountId, providerAccountId: `vendor-1-${mode}`, externalListingId: `template-${mode}`,
          options: mode === 'partial' ? [{ salesProductOptionId: fixture.optionId, externalOptionId: 'opt-1', sellerSku: null }] : [],
        })).rejects.toMatchObject({ ...refused('CHANNELS_EXECUTION_EVIDENCE_REJECTED'), details: { reason: 'TEMPLATE_OPTIONS_INCOMPLETE' } });
        expect(second).toBeTruthy();
        expect(await prisma.channelListing.count({ where: { externalId: `template-${mode}` } })).toBe(0);
        expect(await status(begun.operation.id)).toBe('executing');
      }
    });

    it('fills only empty recipes from the template and preserves a confirmed one', async () => {
      const fixture = await createFixture(prisma, targets, { listing: true, component: true, channel: 'kidkids' });
      await prisma.channelListingOptionInventoryComponent.create({ data: {
        organizationId: ORG, channelListingOptionId: fixture.listingOptionId!, masterProductId: fixture.masterProductId, quantity: 5,
      } });
      const begun = await register(fixture, { channelListingId: fixture.listingId, applyCompositionTemplate: true });
      await confirm(begun, {
        channelAccountId: fixture.accountId, externalListingId: 'provider-listing-1',
        options: [{ salesProductOptionId: fixture.optionId, externalOptionId: 'provider-option-1', sellerSku: null }],
      });
      await expect(prisma.channelListingOptionInventoryComponent.findMany({ where: { channelListingOptionId: fixture.listingOptionId! }, select: { quantity: true } }))
        .resolves.toEqual([{ quantity: 5 }]);

      const fresh = await createFixture(prisma, targets, { component: true, channel: 'kidkids', externalAccountSuffix: '-2' });
      const templated = await register(fresh, { applyCompositionTemplate: true });
      await confirm(templated, {
        channelAccountId: fresh.accountId, providerAccountId: 'vendor-1-2', externalListingId: 'kk-new-1',
        options: [{ salesProductOptionId: fresh.optionId, externalOptionId: 'kk-new-opt-1', sellerSku: null }],
      });
      const option = await prisma.channelListingOption.findFirstOrThrow({ where: { externalOptionId: 'kk-new-opt-1' }, select: { inventoryComponents: { select: { quantity: true } } } });
      expect(option.inventoryComponents).toEqual([{ quantity: 1 }]);
    });

    it('swaps every confirmed composition link in place', async () => {
      const change = await compositionChange();
      await expect(confirm(change.begun, change.evidence)).resolves.toMatchObject({ operation: { status: 'succeeded' } });
      await expect(readChannelOptions(prisma, change.channelOptionIds)).resolves.toEqual([
        { id: change.channelOptionIds[0], salesProductOptionId: change.newOptionIds[0], kidItemCode: 'KID00000003', inventoryComponents: [{ quantity: 3 }] },
        { id: change.channelOptionIds[1], salesProductOptionId: change.newOptionIds[1], kidItemCode: 'KID00000004', inventoryComponents: [{ quantity: 4 }] },
      ].sort((left, right) => left.id.localeCompare(right.id)));
    });

    it('leaves every link, KID and recipe unchanged when a later transition mismatches', async () => {
      const change = await compositionChange();
      const before = await readChannelOptions(prisma, change.channelOptionIds);
      await prisma.salesProductOptionComponent.updateMany({ where: { salesProductOptionId: change.newOptionIds[1] }, data: { quantity: 99 } });
      await expect(confirm(change.begun, change.evidence)).rejects.toMatchObject({ ...refused('CHANNELS_OPTION_RECIPE_INVALID'), details: { reason: 'CONFIRMED_COMPOSITION_MISMATCH' } });
      await expect(readChannelOptions(prisma, change.channelOptionIds)).resolves.toEqual(before);
      expect(await status(change.begun.operation.id)).toBe('executing');
    });

    it('rolls back the confirmation when the real recipe target validation fails', async () => {
      const change = await compositionChange();
      const before = await readChannelOptions(prisma, change.channelOptionIds);
      await prisma.salesProductOptionComponent.deleteMany({ where: { masterProductId: change.masterProductId } });
      await prisma.channelListingOptionInventoryComponent.deleteMany({ where: { masterProductId: change.masterProductId } });
      await prisma.masterProduct.delete({ where: { id: change.masterProductId } });
      await expect(confirm(change.begun, change.evidence)).rejects.toThrow();
      const after = await readChannelOptions(prisma, change.channelOptionIds);
      expect(after.map(({ salesProductOptionId, kidItemCode }) => ({ salesProductOptionId, kidItemCode })))
        .toEqual(before.map(({ salesProductOptionId, kidItemCode }) => ({ salesProductOptionId, kidItemCode })));
      expect(await status(change.begun.operation.id)).toBe('executing');
    });

    it('leaves an existing link and recipe untouched while the provider result is unresolved', async () => {
      const change = await compositionChange();
      const before = await readChannelOptions(prisma, change.channelOptionIds);
      await operations.finish({ organizationId: ORG, operationId: change.begun.operation.id, token: change.begun.token, request: { outcome: 'reconciling', result: { providerOutcome: 'uncertain' } } });
      await expect(readChannelOptions(prisma, change.channelOptionIds)).resolves.toEqual(before);
    });

    async function compositionChange() {
      const fixture = await createFixture(prisma, targets, { listing: true, component: true, channel: 'kidkids' });
      const secondChannelOptionId = randomUUID();
      const oldSecondId = randomUUID();
      const newIds = [randomUUID(), randomUUID()] as const;
      await prisma.salesProductOption.create({ data: {
        id: oldSecondId, organizationId: ORG, salesProductId: fixture.productId, optionCode: 'KID00000002', optionKey: '빨강', values: ['빨강'],
        salePrice: 3_000, supplyStatus: 'selling', sortOrder: 1, components: { create: { masterProductId: fixture.masterProductId, quantity: 2 } },
      } });
      await prisma.channelListingOption.update({ where: { id: fixture.listingOptionId! }, data: { kidItemCode: 'KID00000001' } });
      await prisma.channelListingOption.create({ data: {
        id: secondChannelOptionId, organizationId: ORG, listingId: fixture.listingId!, externalOptionId: 'provider-option-2', salesProductOptionId: oldSecondId, kidItemCode: 'KID00000002', isActive: true,
      } });
      await prisma.channelListingOptionInventoryComponent.createMany({ data: [
        { organizationId: ORG, channelListingOptionId: fixture.listingOptionId!, masterProductId: fixture.masterProductId, quantity: 1 },
        { organizationId: ORG, channelListingOptionId: secondChannelOptionId, masterProductId: fixture.masterProductId, quantity: 2 },
      ] });
      for (const [index, id] of newIds.entries()) {
        await prisma.salesProductOption.create({ data: {
          id, organizationId: ORG, salesProductId: fixture.productId, optionCode: `KID0000000${3 + index}`, optionKey: `새 구성 ${index}`, values: [`새 구성 ${index}`],
          salePrice: 3_000, supplyStatus: 'selling', sortOrder: 2 + index, components: { create: { masterProductId: fixture.masterProductId, quantity: 3 + index } },
        } });
      }
      await targets.update(ORG, fixture.targetId, {
        expectedVersion: 1, registrationInput: fixture.registrationInput, selectedThumbnailAssetId: null, selectedDetailPageRevisionId: null,
        selectedOptions: newIds.map((salesProductOptionId) => ({ salesProductOptionId })),
      });
      const channelOptionIds = [fixture.listingOptionId!, secondChannelOptionId] as const;
      const begun = await begin({
        executionKind: 'composition_change', registrationTargetId: fixture.targetId, expectedVersion: 2, channelListingId: fixture.listingId,
        optionTransitions: channelOptionIds.map((channelListingOptionId, index) => ({ channelListingOptionId, salesProductOptionId: newIds[index] })),
      });
      return {
        begun, channelOptionIds, newOptionIds: newIds, masterProductId: fixture.masterProductId,
        evidence: {
          channelAccountId: fixture.accountId, externalListingId: 'provider-listing-1',
          options: [
            { salesProductOptionId: newIds[0], externalOptionId: 'provider-option-1', sellerSku: null },
            { salesProductOptionId: newIds[1], externalOptionId: 'provider-option-2', sellerSku: null },
          ],
        },
      };
    }
  });
});

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function createFixture(
  prisma: PrismaClient,
  targets: RegistrationTargetRepositoryAdapter,
  input: { listing?: boolean; component?: boolean; channel?: string; registrationInput?: RegistrationMallInput; externalAccountSuffix?: string } = {},
) {
  const accountId = randomUUID();
  const productId = randomUUID();
  const optionId = randomUUID();
  const listingId = input.listing ? randomUUID() : null;
  const listingOptionId = input.listing ? randomUUID() : null;
  const channel = input.channel ?? 'smartstore';
  const registrationInput: RegistrationMallInput = input.registrationInput ?? { mallCategory: { key: 'category-1', label: null }, mallFields: {}, adapter: {} };
  await prisma.channelAccount.create({ data: {
    id: accountId, organizationId: ORG, channel, name: `${channel} ${accountId.slice(0, 6)}`,
    externalAccountId: `vendor-1${input.externalAccountSuffix ?? ''}`, vendorId: 'vendor-1', status: 'active',
  } });
  await prisma.salesProduct.create({ data: { id: productId, organizationId: ORG, code: `SP-${productId.slice(0, 8)}`, status: 'active', name: '공통 상품', version: 1 } });
  await prisma.salesProductOption.create({ data: {
    id: optionId, organizationId: ORG, salesProductId: productId, optionCode: 'KID00000001', optionKey: '파랑', values: ['파랑'],
    salePrice: 3_000, normalPrice: 5_000, supplyStatus: 'selling', sortOrder: 0,
  } });
  let masterProductId: string = randomUUID();
  if (input.component) {
    masterProductId = (await seedSourceProduct(prisma, { id: masterProductId, organizationId: ORG, code: `SOURCE-${productId.slice(0, 8)}`, name: '원천 상품', currentStock: 10 })).id;
    await prisma.salesProductOptionComponent.create({ data: { organizationId: ORG, salesProductOptionId: optionId, masterProductId, quantity: 1 } });
  }
  if (listingId && listingOptionId) {
    await prisma.channelListing.create({ data: { id: listingId, organizationId: ORG, channelAccountId: accountId, salesProductId: productId, externalId: 'provider-listing-1', isActive: true } });
    await prisma.channelListingOption.create({ data: {
      id: listingOptionId, organizationId: ORG, listingId, externalOptionId: 'provider-option-1', salesProductOptionId: optionId, sellerSku: 'EXISTING-SKU', isActive: true,
    } });
  }
  const targetId = await targets.create(ORG, { salesProductId: productId, channelAccountId: accountId, registrationInput, selectedOptions: [{ salesProductOptionId: optionId }] });
  return { accountId, productId, optionId, listingId, listingOptionId, masterProductId, targetId, registrationInput };
}

async function addSelectedOption(prisma: PrismaClient, targets: RegistrationTargetRepositoryAdapter, fixture: Fixture) {
  const secondOptionId = randomUUID();
  await prisma.salesProductOption.create({ data: {
    id: secondOptionId, organizationId: ORG, salesProductId: fixture.productId, optionCode: 'KID00000002', optionKey: '초록', values: ['초록'],
    salePrice: 4_000, normalPrice: 6_000, supplyStatus: 'selling', sortOrder: 1,
  } });
  await targets.update(ORG, fixture.targetId, {
    expectedVersion: 1, registrationInput: fixture.registrationInput, selectedThumbnailAssetId: null, selectedDetailPageRevisionId: null,
    selectedOptions: [{ salesProductOptionId: fixture.optionId }, { salesProductOptionId: secondOptionId }],
  });
  return secondOptionId;
}

function readChannelOptions(prisma: PrismaClient, ids: readonly string[]) {
  return prisma.channelListingOption.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, salesProductOptionId: true, kidItemCode: true, inventoryComponents: { select: { quantity: true } } },
    orderBy: { id: 'asc' },
  });
}
