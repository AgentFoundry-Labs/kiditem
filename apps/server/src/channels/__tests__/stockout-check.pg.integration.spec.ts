import { channelAdapters } from './channel-adapters';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG, OTHER_ORGANIZATION_ID, TEST_USER_ID as USER } from '../../test-helpers/real-prisma';
import { seedSourceProduct } from '../../test-helpers/inventory-seeds';
import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { StockoutCheckPersistenceAdapter } from '../adapter/out/persistence/stockout-check.persistence.adapter';
import { StockoutCheckService } from '../application/service/listing/stockout-check.service';
import { RegistrationExecutionRepositoryAdapter } from '../adapter/out/repository/registration-execution.repository.adapter';
import type { PrismaService } from '../../prisma/prisma.service';
import { ownerTransaction } from '../../prisma/owner-transaction';
import { makeWingCatalogOperations } from '../../test-helpers/wing-catalog-operations';
import { makeChannelsOperations } from '../../test-helpers/channels-operations';
import { SABANGNET_MALL_LISTINGS_KIND } from '@kiditem/shared/channels-operations';

const POLICY = 'capacity_at_or_below_safety_stock' as const;
describe('explicit stockout transaction fence (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let persistence: StockoutCheckPersistenceAdapter;
  let service: StockoutCheckService;
  let executions: RegistrationExecutionRepositoryAdapter;
  beforeAll(async () => {
    prisma = makeTestPrisma(); await prisma.$connect();
    persistence = new StockoutCheckPersistenceAdapter(prisma as PrismaService, new ProductTransactionalReadRepositoryAdapter(), makeWingCatalogOperations(prisma).operations);
    executions = new RegistrationExecutionRepositoryAdapter(prisma as PrismaService, channelAdapters());
    service = new StockoutCheckService(persistence, executions, channelAdapters());
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });

  async function fixture() {
    const account = await prisma.channelAccount.create({ data: { organizationId: ORG, channel: 'coupang', name: 'Stockout', status: 'active', externalAccountId: 'vendor' } });
    const listing = await prisma.channelListing.create({ data: { organizationId: ORG, channelAccountId: account.id, externalId: 'listing-external', status: 'active' } });
    const option = await prisma.channelListingOption.create({ data: { organizationId: ORG, listingId: listing.id, externalOptionId: 'option-external', rawJson: { registrationType: 'NORMAL' }, status: 'active', safetyStock: 2 } });
    const product = await seedSourceProduct(prisma, { organizationId: ORG, code: randomUUID(), name: 'component', currentStock: 5 });
    await prisma.channelListingOptionInventoryComponent.create({ data: { organizationId: ORG, channelListingOptionId: option.id, masterProductId: product.id, quantity: 2 } });
    return { account, listing, option, product };
  }
  it('reads minimum floor capacity from confirmed compositions in the exact caller transaction, without stock mutation', async () => {
    const f = await fixture();
    const second = await seedSourceProduct(prisma, { organizationId: ORG, code: randomUUID(), name: 'second', currentStock: 100 });
    await prisma.channelListingOptionInventoryComponent.create({ data: { organizationId: ORG, channelListingOptionId: f.option.id, masterProductId: second.id, quantity: 3 } });
    expect(await persistence.readSubjects(ORG, [f.listing.id])).toMatchObject([{ options: [{ capacity: 2, safetyStock: 2 }] }]);
    await prisma.$transaction(async tx => {
      await tx.masterProduct.update({ where: { id: f.product.id }, data: { currentStock: 1 } });
      expect(await persistence.readSubjects(ORG, [f.listing.id], ownerTransaction(tx))).toMatchObject([{ options: [{ capacity: 0 }] }]);
    });
    expect((await prisma.masterProduct.findUniqueOrThrow({ where: { id: f.product.id } })).currentStock).toBe(1);
    expect(await persistence.readSubjects(OTHER_ORGANIZATION_ID, [f.listing.id])).toEqual([]);
    expect(await persistence.readSubjects(ORG, [])).toEqual([]);
  });
  it('keeps absent recipes and dangling product facts unknown', async () => {
    const f = await fixture();
    await prisma.masterProduct.delete({ where: { id: f.product.id } });
    expect(await service.preview(ORG, [f.listing.id])).toMatchObject([{ decision: 'unknown' }]);
    await prisma.channelListingOptionInventoryComponent.deleteMany({ where: { channelListingOptionId: f.option.id } });
    expect(await service.preview(ORG, [f.listing.id])).toMatchObject([{ decision: 'unknown' }]);
  });
  it('marks the uncertain composition option compositionUnconfirmed and blocks the whole listing while that execution is active', async () => {
    const f = await fixture();
    const sibling = await prisma.channelListingOption.create({ data: { organizationId: ORG, listingId: f.listing.id, externalOptionId: 'sibling-external', rawJson: { registrationType: 'NORMAL' }, status: 'active', safetyStock: 2 } });
    await prisma.channelListingOptionInventoryComponent.create({ data: { organizationId: ORG, channelListingOptionId: sibling.id, masterProductId: f.product.id, quantity: 2 } });
    expect(await service.preview(ORG, [f.listing.id])).toMatchObject([{ decision: 'eligible', optionCodes: ['option-external', 'sibling-external'].sort() }]);

    const execution = await prisma.productRegistrationExecution.create({ data: {
      organizationId: ORG, channelAccountId: f.account.id, channelListingId: f.listing.id, executionKind: 'composition_change',
      idempotencyKey: randomUUID(), requestHash: 'composition-request', status: 'reconciling', providerOutcome: 'uncertain',
      submissionPayloadJson: { kind: 'composition_change', optionTransitions: [{ channelListingOptionId: f.option.id, salesProductOptionId: randomUUID() }] },
    } });

    const [subject] = await persistence.readSubjects(ORG, [f.listing.id]);
    expect(subject!.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: f.option.id, compositionUnconfirmed: true }),
      expect.objectContaining({ id: sibling.id, compositionUnconfirmed: false, capacity: 2, safetyStock: 2 }),
    ]));
    expect(await service.preview(ORG, [f.listing.id])).toMatchObject([{ decision: 'active_execution', optionCodes: [] }]);
    await expect(service.prepare(ORG, USER, { listingId: f.listing.id, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: 'STATE_CONFLICT', details: { reason: 'active_execution' } });
    expect(await prisma.productRegistrationExecution.count({ where: { organizationId: ORG, executionKind: 'sold_out' } })).toBe(0);
    await prisma.productRegistrationExecution.update({ where: { id: execution.id }, data: { status: 'failed', providerOutcome: 'definitive_failure' } });
    expect(await service.preview(ORG, [f.listing.id])).toMatchObject([{ decision: 'eligible', optionCodes: ['option-external', 'sibling-external'].sort() }]);
  });
  it('freezes the stockout policy and refuses start after stock recovery without claiming a lease', async () => {
    const f = await fixture();
    const input = { listingId: f.listing.id, idempotencyKey: randomUUID() };
    const prepared = await service.prepare(ORG, USER, input);
    expect(prepared.payload).toMatchObject({ kind: 'sold_out', stockoutPolicy: POLICY, optionCodes: ['option-external'] });
    const start = { organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId };
    await expect(executions.startListingAvailability(start)).rejects.toMatchObject({ code: 'INTERNAL_ERROR', details: { reason: 'STOCKOUT_ELIGIBILITY_CHECK_MISSING' } });
    await prisma.masterProduct.update({ where: { id: f.product.id }, data: { currentStock: 10 } });
    expect((await service.prepare(ORG, USER, input)).executionId).toBe(prepared.executionId);
    await expect(service.prepare(ORG, null, input)).rejects.toMatchObject({ code: 'CHANNELS_EXECUTION_IDEMPOTENCY_CONFLICT', details: { reason: 'ACTOR_MISMATCH' } });
    const guarded = { ...start, assertInventoryStockout: (tx: Parameters<StockoutCheckService['assertEligible']>[0], snapshot: typeof prepared.payload) => service.assertEligible(tx, ORG, snapshot, prepared.executionId) };
    await expect(executions.startListingAvailability(guarded)).rejects.toMatchObject({ code: 'STATE_CONFLICT', details: { reason: 'in_stock' } });
    expect(await prisma.productRegistrationExecution.findUnique({ where: { id: prepared.executionId } })).toMatchObject({ status: 'prepared', providerOutcome: 'not_attempted', leaseToken: null });
    await prisma.masterProduct.update({ where: { id: f.product.id }, data: { currentStock: 5 } });
    expect(await executions.startListingAvailability(guarded)).toMatchObject({ maySubmit: true, status: 'executing', providerOutcome: 'uncertain' });
    expect(await executions.startListingAvailability(guarded)).toMatchObject({ maySubmit: false });
    expect(await service.preview(ORG, [f.listing.id])).toMatchObject([{ decision: 'active_execution' }]);
    await expect(service.prepare(ORG, USER, { ...input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: 'STATE_CONFLICT', details: { reason: 'active_execution' } });
  });
  it('rejects resume with a stockout policy and distinguishes manual from stockout intent hashes', async () => {
    const f = await fixture();
    const request = { channelAccountId: f.account.id, externalListingId: f.listing.externalId, kind: 'sold_out' as const, stockoutPolicy: POLICY, optionCodes: [f.option.externalOptionId], idempotencyKey: randomUUID() };
    await expect(executions.prepareListingAvailability({ organizationId: ORG, requestedByUserId: USER, request: { ...request, kind: 'resume' } })).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'STOCKOUT_POLICY_ON_RESUME' } });
    await executions.prepareListingAvailability({ organizationId: ORG, requestedByUserId: USER, request });
    const { stockoutPolicy: _policy, ...manual } = request;
    await expect(executions.prepareListingAvailability({ organizationId: ORG, requestedByUserId: USER, request: { ...manual, idempotencyKey: randomUUID() } }))
      .rejects.toMatchObject({ code: 'CHANNELS_LISTING_EXECUTION_ACTIVE' });
  });
  it('does not let an old successful stop override newer positive provider observations', async () => {
    const f = await fixture();
    const prepared = await service.prepare(ORG, USER, { listingId: f.listing.id, idempotencyKey: randomUUID() });
    await prisma.productRegistrationExecution.update({ where: { id: prepared.executionId }, data: { status: 'succeeded', providerOutcome: 'succeeded', completedAt: new Date('2026-09-01T00:00:00Z') } });
    expect(await service.preview(ORG, [f.listing.id])).toMatchObject([{ decision: 'already_sold_out' }]);
    await prisma.channelListingOptionDailySnapshot.create({ data: { organizationId: ORG, listingId: f.listing.id, listingOptionId: f.option.id, channel: 'coupang', externalId: f.listing.externalId, externalOptionId: f.option.externalOptionId, businessDate: new Date('2026-09-02'), stockQty: 20, lastObservedAt: new Date('2026-09-02T00:00:00Z') } });
    expect(await service.preview(ORG, [f.listing.id])).toMatchObject([{ decision: 'eligible' }]);
  });
  it('dates a catalog status written by a Wing catalog operation by that operation, so an older observation does not override it (KID-354)', async () => {
    const f = await fixture();
    await prisma.channelListingOptionDailySnapshot.create({ data: { organizationId: ORG, listingId: f.listing.id, listingOptionId: f.option.id, channel: 'coupang', externalId: f.listing.externalId, externalOptionId: f.option.externalOptionId, businessDate: new Date('2026-09-02'), stockQty: 20, lastObservedAt: new Date('2026-09-02T00:00:00Z') } });
    const listed = await makeWingCatalogOperations(prisma).runList(f.account.id, [{
      externalProductId: f.listing.externalId, registeredName: 'r', displayName: 'd', category: null, manufacturer: null, brand: null,
      productStatus: 'APPROVED', media: [], raw: {},
      options: [{ externalOptionId: f.option.externalOptionId, optionName: '기본', skuStatus: 'SUSPENSION', salePrice: 1000, sellerSku: null, modelNumber: null, barcode: null, attributes: [], media: [], raw: {} }],
    }]);
    await expect(prisma.channelListingOption.findUniqueOrThrow({ where: { id: f.option.id } })).resolves.toMatchObject({ lastOperationId: listed.id, lastImportRunId: null });
    const [subject] = await persistence.readSubjects(ORG, [f.listing.id]);
    expect(subject?.options[0]).toMatchObject({ status: 'SUSPENSION' });
  });
  it('dates a status written by a Sabangnet listings operation by that operation, so an older sold-out observation does not outlive the fresh import (KID-363)', async () => {
    const mall = await prisma.channelAccount.create({ data: { organizationId: ORG, channel: 'kidsnote', externalAccountId: 'kidsnote', name: '키즈노트', status: 'active' } });
    const channels = makeChannelsOperations(prisma);
    const begun = await channels.operations.begin(ORG, { kind: SABANGNET_MALL_LISTINGS_KIND, scope: {} }, { userId: null });
    const row = { sendSerial: '1', sabangnetShopId: 'shop0472', mallProductCode: 'KN-1', sabangnetProductNo: '1', modelName: null, ownProductCode: null, productName: '네일팁', salePrice: 1000, supplyStatus: '공급중', firstSentAt: null };
    const imported = await channels.runBegun(begun, (plan) => [
      { chunkKind: 'listing_rows', items: [row] },
      { chunkKind: 'listing_scan', items: [{ collection: { totalRecords: 1, recordsRead: 1, pagesRead: 1, totalPages: 1, truncated: false, skippedByShop: {}, missingMallCode: 0 }, proof: { dateFrom: '20000101', dateTo: String(plan.dateTo), pageSize: 500, validatedList: true } }] },
    ]);
    const listing = await prisma.channelListing.findFirstOrThrow({ where: { organizationId: ORG, channelAccountId: mall.id, externalId: 'KN-1' }, include: { options: true } });
    expect(listing).toMatchObject({ lastOperationId: imported.id, lastImportRunId: null });
    // 가져오기보다 먼저 본 품절 관측은 새 가져오기를 이기지 않는다.
    await prisma.channelListingOptionDailySnapshot.create({ data: { organizationId: ORG, listingId: listing.id, listingOptionId: listing.options[0]!.id, channel: 'kidsnote', externalId: 'KN-1', externalOptionId: 'KN-1', businessDate: new Date('2026-01-02'), stockQty: 0, lastObservedAt: new Date('2026-01-02T00:00:00Z') } });
    const [subject] = await persistence.readSubjects(ORG, [listing.id]);
    expect(subject?.options[0]).toMatchObject({ status: '사방넷 공급중' });
  });
});
