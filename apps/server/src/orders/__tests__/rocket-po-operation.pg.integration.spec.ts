import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OPERATION_TOKEN_HEADER, OperationBeginResponseSchema, type OperationBeginResponse } from '@kiditem/shared/operation';
import {
  COUPANG_ROCKET_PO_CHUNK_KIND,
  COUPANG_ROCKET_PO_KIND,
  COUPANG_ROCKET_PO_SCAN_CHUNK_KIND,
  type CoupangRocketPoScan,
} from '@kiditem/shared/orders-operations';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG, TEST_USER_ID as USER } from '../../test-helpers/real-prisma';
import { realRegistrationStates } from '../../test-helpers/registration-state';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { configureAgentRuntimeBodyParsers } from '../../common/http/agent-runtime-body-parser';
import { FactConflictError } from '../../common/errors/fact-errors';
import { OperationsController } from '../../common/operation/adapter/in/web/operations.controller';
import { OperationRepositoryAdapter } from '../../common/operation/adapter/out/repository/operation.repository.adapter';
import { OPERATION_PORT } from '../../common/operation/application/port/in/operation.port';
import { OPERATION_REPOSITORY } from '../../common/operation/application/port/out/repository/operation.repository.port';
import { OperationOwnerRegistry } from '../../common/operation/application/service/operation-owner.registry';
import { OperationService } from '../../common/operation/application/service/operation.service';
import { ChannelAccountService } from '../../channels/application/service/account/channel-account.service';
import { ChannelAccountPersistenceAdapter } from '../../channels/adapter/out/persistence/channel-account.persistence.adapter';
import { CatalogIdentityService } from '../../channels/application/service/collection/catalog-identity.service';
import { CatalogIdentityPersistenceAdapter } from '../../channels/adapter/out/persistence/catalog-identity.persistence.adapter';
import { ChannelListingQueryService } from '../../channels/application/service/listing/channel-listing-query.service';
import { ChannelListingQueryPersistenceAdapter } from '../../channels/adapter/out/persistence/channel-listing-query.persistence.adapter';
import { ChannelSkuAvailabilityService } from '../../channels/application/service/listing/channel-sku-availability.service';
import { ChannelProductMatchingRepositoryAdapter } from '../../channels/adapter/out/repository/channel-product-matching.repository.adapter';
import { ChannelOptionRecipeRepositoryAdapter } from '../../channels/adapter/out/persistence/channel-option-recipe.repository.adapter';
import { ChannelOptionRecipeService } from '../../channels/application/service/listing/channel-option-recipe.service';
import { ChannelsProductMappingGenerationAdapter } from '../../channels/adapter/out/products/product-mapping-generation.adapter';
import { ProductMappingGenerationRepositoryAdapter } from '../../products/adapter/out/persistence/product-mapping-generation.repository.adapter';
import { ProductAvailabilityRepositoryAdapter } from '../../products/adapter/out/persistence/product-availability.repository.adapter';
import { ProductAvailabilityUseCase } from '../../products/application/service/product-availability.usecase';
import { ProductCollectionFreshnessRepositoryAdapter } from '../../products/adapter/out/persistence/product-source-freshness.repository.adapter';
import { ProductCollectionFreshnessUseCase } from '../../products/application/service/product-collection-freshness.usecase';
import { ProductSourceReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-source-read.repository.adapter';
import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { RocketPurchasePreviewService } from '../../supply/application/service/rocket-purchase-preview.service';
import { RocketWorkbookExportService } from '../../supply/application/service/rocket-purchase-confirmation.service';
import { RocketPurchaseConfirmationTransactionAdapter } from '../../supply/adapter/out/transaction/rocket-purchase-confirmation.transaction.adapter';
import { RocketWorkbookProgressService } from '../../inventory/application/usecase/rocket-workbook-progress.service';
import { RocketWorkbookProgressRepositoryAdapter } from '../../inventory/adapter/out/persistence/rocket-workbook-progress.repository.adapter';
import { CoupangRocketPoOperationOwner } from '../adapter/in/operation/coupang-rocket-po-operation-owner';
import { RocketPoCatalogRepositoryAdapter } from '../adapter/out/repository/rocket-po-catalog.repository.adapter';
import { RocketPoCatalogService } from '../application/service/rocket-po-catalog.service';

// 확장 수집기(orders.coupang_rocket_po)가 밟는 길을 서버에서 그대로: begin → po_rows(발주서 하나 = 항목 하나) →
// po_scan 증거 → finish. 공급자 식별·Channels 관측 식별·스냅샷은 finish 트랜잭션에서만 쓰인다(ADR-0025).
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const scope = {
  channelAccountId: ACCOUNT,
  from: '2026-09-01',
  to: '2026-09-30',
  status: '',
  dateType: 'WAREHOUSING_PLAN_DATE',
  requireConfirmation: true,
};
const checksum = (payload: unknown[]) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

describe('orders.coupang_rocket_po owner over the operation contract + disposable PG', () => {
  let prisma: PrismaClient;
  const dbOperations: string[] = [];
  let app: INestApplication;
  let httpUrl: string;
  let catalog: RocketPoCatalogService;

  beforeAll(async () => {
    prisma = makeTestPrisma().$extends({
      query: {
        async $allOperations({ model, operation, args, query }) {
          dbOperations.push(`${model ?? 'raw'}.${operation}`);
          return query(args);
        },
      },
    }) as unknown as PrismaClient;
    await prisma.$connect();
    const mappingGenerations = new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter());
    const accounts = new ChannelAccountService(new ChannelAccountPersistenceAdapter(prisma as never, mappingGenerations), {} as never);
    catalog = new RocketPoCatalogService(new RocketPoCatalogRepositoryAdapter(
      prisma as never,
      accounts,
      new CatalogIdentityService(new CatalogIdentityPersistenceAdapter()),
      new ChannelListingQueryService(new ChannelListingQueryPersistenceAdapter(prisma as never), { findForListings: async () => [] }, realRegistrationStates(prisma as never)),
    ));
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [OperationsController],
      providers: [
        OperationOwnerRegistry,
        OperationService,
        { provide: OPERATION_PORT, useExisting: OperationService },
        { provide: OPERATION_REPOSITORY, useValue: new OperationRepositoryAdapter(prisma as never) },
        { provide: CoupangRocketPoOperationOwner, useValue: new CoupangRocketPoOperationOwner(catalog) },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false, bodyParser: false });
    // 운영 main.ts와 같은 JSON 한도(청크 1MiB를 받는다).
    configureAgentRuntimeBodyParsers(app as never);
    app.setGlobalPrefix('api');
    app.use((req: { headers: Record<string, string>; authUser?: unknown }, _res: unknown, next: () => void) => {
      req.authUser = { id: USER, organizationId: req.headers['x-test-org'] ?? ORG };
      next();
    });
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    await app.listen(0, '127.0.0.1');
    httpUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.create({
      data: { id: ACCOUNT, organizationId: ORG, channel: 'rocket', name: 'Rocket', vendorId: 'V1', status: 'active' },
    });
  });

  const begin = (body: Record<string, unknown> = scope, organizationId = ORG) =>
    request(httpUrl).post('/api/operations').set('x-test-org', organizationId).send({ kind: COUPANG_ROCKET_PO_KIND, scope: body });
  async function beginRun(body: Record<string, unknown> = scope): Promise<OperationBeginResponse> {
    return OperationBeginResponseSchema.parse((await begin(body).expect(201)).body);
  }
  async function put(run: OperationBeginResponse, chunkKind: string, sequence: number, payload: unknown[]) {
    await request(httpUrl)
      .put(`/api/operations/${run.operation.id}/chunks/${chunkKind}/${sequence}`)
      .set(OPERATION_TOKEN_HEADER, run.token)
      .send({ checksum: checksum(payload), payload })
      .expect(200);
  }
  const finish = (run: OperationBeginResponse, body: Record<string, unknown> = { outcome: 'succeeded' }) =>
    request(httpUrl).post(`/api/operations/${run.operation.id}/finish`).set(OPERATION_TOKEN_HEADER, run.token).send(body);

  /** 확장 수집기의 순서: 발주서마다 항목 하나(200개씩 청크) → 목록 증거. 그 뒤 `.expect(status)`가 finish한다. */
  async function stage(run: OperationBeginResponse, rows: SubmittedRow[], evidence: Partial<CoupangRocketPoScan>) {
    const byPo = new Map<string, SubmittedRow[]>();
    for (const item of rows) byPo.set(item.poNumber, [...(byPo.get(item.poNumber) ?? []), item]);
    const items = [...byPo].map(([poNumber, poRows]) => ({ poNumber, rows: poRows }));
    for (let index = 0; index < items.length; index += 200) {
      await put(run, COUPANG_ROCKET_PO_CHUNK_KIND, index / 200 + 1, items.slice(index, index + 200));
    }
    await put(run, COUPANG_ROCKET_PO_SCAN_CHUNK_KIND, 1, [scan(rows, run.operation.plan as Record<string, unknown>, evidence)]);
  }
  function collect(run: OperationBeginResponse, rows: SubmittedRow[] = [row('P1')], evidence: Partial<CoupangRocketPoScan> = {}) {
    const staged = stage(run, rows, evidence);
    return {
      expect: async (status: number) => {
        await staged;
        return finish(run).expect(status);
      },
    };
  }
  async function publish(rows: SubmittedRow[] = [row('P1')], body: Record<string, unknown> = scope) {
    const run = await beginRun(body);
    await collect(run, rows).expect(200);
    return run.operation.id;
  }
  const saved = { organizationId: ORG, channelAccountId: ACCOUNT };
  const listSaved = (extra: Record<string, unknown> = {}) => catalog.listSavedPos({ ...saved, from: scope.from, to: scope.to, ...extra });

  it('plan은 계정 잠금과 공급자 기대값을 고정하고, 같은 계정의 두 번째 수집은 OPERATION_IN_PROGRESS', async () => {
    const run = await beginRun();
    expect(run.operation).toMatchObject({
      lockKeys: [`account:${ACCOUNT}`],
      plan: { ...scope, vendorExpectations: { rocketVendorId: 'V1', sharedCoupangVendorId: null } },
      window: { start: scope.from, end: scope.to },
    });
    const refused = await begin().expect(409);
    expect(refused.body).toMatchObject({ code: 'OPERATION_IN_PROGRESS', details: { operationId: run.operation.id } });
    await begin({ ...scope, status: 'BAD' }).expect(400);
  });

  it('finish가 스냅샷·관측 식별(lastOperationId)을 한 번 쓰고, 새 수집이 현재가 되며, 실패는 원장에 남기지 않고, 빈 수집도 현재가 된다', async () => {
    const a = await publish([row('P1')]);
    const b = await publish([row('P2')]);
    const replayed = await catalog.loadSavedCollection({ ...saved, rocketPoOperationId: a });
    expect(replayed?.rows.map((item) => item.productNo)).toEqual(['P1']);
    expect(replayed?.collection).toEqual({
      collectionRunId: a, vendorId: 'V1', listPagesRead: 1, totalListPages: 1, truncated: false, detailPoCount: 1, failedPoNumbers: [],
    });
    expect((await listSaved()).map((po) => [po.firstProductName, po.rocketPoOperationId])).toEqual([['P2 item', b]]);
    const listing = await prisma.channelListing.findFirstOrThrow({ where: { organizationId: ORG, externalId: 'P2' } });
    expect(listing).toMatchObject({ lastOperationId: b, lastImportRunId: null });

    const failed = await beginRun();
    await put(failed, COUPANG_ROCKET_PO_CHUNK_KIND, 1, [{ poNumber: '1001', rows: [row('P3')] }]);
    await finish(failed, { outcome: 'failed', errorCode: 'SITE_LOGIN_REQUIRED' }).expect(200);
    expect(await prisma.rocketPoCatalogSnapshot.count({ where: { operationId: failed.operation.id } })).toBe(0);
    expect((await listSaved()).map((po) => po.rocketPoOperationId)).toEqual([b]);

    const empty = await publish([]);
    expect(await listSaved()).toEqual([]);
    expect((await catalog.loadSavedCollection({ ...saved, rocketPoOperationId: empty }))?.rows).toEqual([]);
    await expect(prisma.sourceImportRun.count({ where: { organizationId: ORG } })).resolves.toBe(0);
  });

  it('옛 attempt 스냅샷(sourceImportRunId만, operationId 없음)은 더 새로워도 현재 수집이 되지 않는다', async () => {
    async function seedLegacySnapshot(createdAt: Date) {
      const run = await prisma.sourceImportRun.create({
        data: { organizationId: ORG, sourceType: 'coupang_rocket_po', channelAccountId: ACCOUNT, status: 'completed' },
      });
      await prisma.rocketPoCatalogSnapshot.create({
        data: {
          organizationId: ORG, channelAccountId: ACCOUNT, sourceImportRunId: run.id, collectionRunId: run.id,
          vendorId: 'V1', listPagesRead: 1, totalListPages: 1, detailPoCount: 1, createdAt,
          lines: {
            create: [{
              poLineId: 'LEGACY-1', poNumber: '9001', vendorId: 'V1', productNo: 'LEGACY',
              barcode: '8800000000009', productName: 'Legacy item', orderQty: 1, plannedDeliveryDate: new Date('2026-09-10'),
            }],
          },
        },
      });
    }

    await seedLegacySnapshot(new Date(Date.now() - 60_000));
    expect(await listSaved()).toEqual([]);

    const current = await publish([row('P1')]);
    await seedLegacySnapshot(new Date(Date.now() + 60_000));
    expect((await listSaved()).map((po) => [po.firstProductName, po.rocketPoOperationId])).toEqual([['P1 item', current]]);
  });

  it('finish 응답은 발주서·줄 수를 result로 싣는다', async () => {
    const run = await beginRun();
    const done = await collect(run, [row('P1'), row('P2'), { ...row('P3'), poNumber: '1002', poLineId: '1002:P3:8801234567890:1' }]).expect(200);
    expect(done.body.operation).toMatchObject({ status: 'succeeded', lockKeys: [], result: { purchaseOrders: 2, lines: 3 } });
  });

  it('확정 총액이 없는 줄이 있으면 발주서 금액은 모른다', async () => {
    await publish([
      { ...row('P1'), poNumber: '2001', poLineId: '2001:P1' },
      { ...row('P2'), poNumber: '2001', poLineId: '2001:P2', confirmation: undefined },
      { ...row('P3'), poNumber: '2002', poLineId: '2002:P3' },
    ], { ...scope, requireConfirmation: false });
    expect((await listSaved()).map(({ poNumber, skuCount, orderQuantity, orderAmount }) => ({ poNumber, skuCount, orderQuantity, orderAmount }))).toEqual([
      { poNumber: '2001', skuCount: 2, orderQuantity: 8, orderAmount: null },
      { poNumber: '2002', skuCount: 1, orderQuantity: 4, orderAmount: 3960 },
    ]);
  });

  it('저장한 줄은 확정 정보가 있던 그대로 다시 열리고, 저장 증거가 모자라면 형식 충돌로 닫힌다', async () => {
    const unconfirmed: SubmittedRow = row('P2');
    delete unconfirmed.confirmation;
    const id = await publish([row('P1'), unconfirmed], { ...scope, requireConfirmation: false });
    const exact = { ...saved, rocketPoOperationId: id };
    expect((await catalog.loadSavedCollection(exact))?.rows).toEqual([row('P1'), unconfirmed]);

    await prisma.channelListingOption.updateMany({ where: { organizationId: ORG, externalOptionId: 'P1' }, data: { externalOptionId: 'P1-RENUMBERED' } });
    await expect(catalog.readComplete(exact)).rejects.toBeInstanceOf(FactConflictError);
    await prisma.rocketPoCatalogLine.updateMany({ where: { organizationId: ORG, productNo: 'P1' }, data: { poStatus: null } });
    await expect(catalog.loadSavedCollection(exact)).rejects.toThrow('Saved Rocket PO confirmation is missing poStatus');
  });

  it('begin 뒤 공급자 ID가 바뀌면 빈 관측이어도 rocket_po_vendor_mismatch — 원장에 아무것도 남지 않는다', async () => {
    const run = await beginRun();
    await prisma.channelAccount.update({ where: { id: ACCOUNT }, data: { vendorId: 'CHANGED' } });
    const refused = await collect(run, []).expect(400);
    expect(refused.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'rocket_po_vendor_mismatch' } });
    await finish(run, { outcome: 'failed', errorCode: 'VALIDATION_FAILED' }).expect(200);
    expect(await prisma.rocketPoCatalogSnapshot.count()).toBe(0);
  });

  it('수집 중 계정이 비활성이 되면 rocket_po_account_unavailable로 거절하고 앞 수집은 그대로다; 활성 로켓 계정이 아니면 begin이 404', async () => {
    const a = await publish();
    const b = await beginRun();
    await prisma.channelAccount.update({ where: { id: ACCOUNT }, data: { status: 'inactive' } });
    expect((await collect(b).expect(400)).body).toMatchObject({ details: { reason: 'rocket_po_account_unavailable' } });
    await finish(b, { outcome: 'failed', errorCode: 'VALIDATION_FAILED' }).expect(200);
    expect((await listSaved()).map((po) => po.rocketPoOperationId)).toEqual([a]);
    await begin().expect(404);
    await begin({ ...scope, channelAccountId: randomUUID() }).expect(404);
    await begin(scope, randomUUID()).expect(404);
    await prisma.channelAccount.update({ where: { id: ACCOUNT }, data: { status: 'active', channel: 'coupang' } });
    await begin().expect(404);
  });

  it('대표 Wing 계정의 공급자 ID가 다르면 거절하고 빈 로켓 공급자 ID를 차지하지 않는다', async () => {
    await prisma.channelAccount.update({ where: { id: ACCOUNT }, data: { vendorId: null } });
    await prisma.channelAccount.create({ data: { organizationId: ORG, channel: 'coupang', name: 'Wing', vendorId: 'OTHER', isPrimary: true, status: 'active' } });
    const run = await beginRun();
    expect((await collect(run).expect(400)).body).toMatchObject({ details: { reason: 'rocket_po_vendor_mismatch' } });
    expect((await prisma.channelAccount.findUniqueOrThrow({ where: { id: ACCOUNT } })).vendorId).toBeNull();
    expect(await prisma.channelListingOption.count()).toBe(0);
  });

  it('확정 요청 상태 별칭은 가장 최근 수집 안에서만 모인다; 다른 조직은 읽지 못한다', async () => {
    const statuses = ['거래처확인요청', '거래명세서확인요청', '발주확정'];
    const id = await publish(statuses.map((poStatus, index) => ({
      ...row(`P${index}`),
      poNumber: String(1001 + index),
      poLineId: `${1001 + index}:P${index}`,
      confirmation: { ...row('P1').confirmation!, poStatus },
    })));
    expect(await listSaved({ status: '거래처확인요청' })).toHaveLength(2);
    expect(await catalog.loadSavedCollection({ ...saved, organizationId: randomUUID(), rocketPoOperationId: id })).toBeNull();
    await publish([row('NEW')]);
    expect((await listSaved()).map((po) => po.firstProductName)).toEqual(['NEW item']);
    expect(await prisma.rocketPoCatalogSnapshot.count()).toBe(2);
  });

  it.each(['mixed_vendor', 'duplicate_line', 'missing_confirmation'] as const)('%s 행은 식별을 발행하지 않고 rocket_po_collection_incomplete', async (invalid) => {
    const rows: SubmittedRow[] = [row('P1')];
    if (invalid === 'mixed_vendor') rows[0] = { ...row('P1'), vendorId: 'OTHER' };
    if (invalid === 'duplicate_line') rows.push(row('P1'));
    if (invalid === 'missing_confirmation') delete rows[0]!.confirmation;
    const run = await beginRun();
    expect((await collect(run, rows).expect(400)).body).toMatchObject({ details: { reason: 'rocket_po_collection_incomplete' } });
    expect(await prisma.channelListingOption.count()).toBe(0);
    expect(await prisma.rocketPoCatalogSnapshot.count()).toBe(0);
  });

  it('스냅샷 쓰기가 실패하면 공급자 식별·관측 식별까지 함께 되돌리고, 다시 finish하면 한 번만 발행한다', async () => {
    await prisma.channelAccount.update({ where: { id: ACCOUNT }, data: { vendorId: null } });
    const run = await beginRun();
    await prisma.$executeRawUnsafe(`CREATE FUNCTION reject_rocket_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test snapshot unavailable'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER reject_rocket_snapshot BEFORE INSERT ON rocket_po_catalog_snapshots FOR EACH ROW EXECUTE FUNCTION reject_rocket_snapshot()`);
    try {
      await collect(run).expect(500);
      expect(await prisma.channelListingOption.count()).toBe(0);
      expect((await prisma.channelAccount.findUniqueOrThrow({ where: { id: ACCOUNT } })).vendorId).toBeNull();
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER reject_rocket_snapshot ON rocket_po_catalog_snapshots');
      await prisma.$executeRawUnsafe('DROP FUNCTION reject_rocket_snapshot()');
    }
    await finish(run).expect(200);
    expect(await prisma.rocketPoCatalogSnapshot.count({ where: { operationId: run.operation.id } })).toBe(1);
    expect((await prisma.channelAccount.findUniqueOrThrow({ where: { id: ACCOUNT } })).vendorId).toBe('V1');
  });

  it('빈 공급자 ID는 행이 있는 증거로만 채우고, 다시 수집해도 확정한 옵션 구성은 그대로다', async () => {
    await prisma.channelAccount.update({ where: { id: ACCOUNT }, data: { vendorId: null } });
    const wing = await prisma.channelAccount.create({ data: { organizationId: ORG, channel: 'coupang', name: 'Wing', vendorId: null, isPrimary: true, status: 'active' } });
    await publish([]);
    expect((await prisma.channelAccount.findUniqueOrThrow({ where: { id: ACCOUNT } })).vendorId).toBeNull();
    await publish();
    expect((await prisma.channelAccount.findUniqueOrThrow({ where: { id: wing.id } })).vendorId).toBe('V1');
    const option = await prisma.channelListingOption.findFirstOrThrow({ where: { organizationId: ORG, externalOptionId: 'P1' } });
    const master = await prisma.masterProduct.create({
      data: { organizationId: ORG, code: 'KEEP', sourceAccountKey: 'kiditem', sourceProductCode: 'KEEP', sourceOptionCode: '', name: 'Keep', currentStock: 7 },
    });
    await prisma.channelListingOptionInventoryComponent.create({ data: { organizationId: ORG, channelListingOptionId: option.id, masterProductId: master.id, quantity: 2 } });
    await publish([row('P2')]);
    await publish();
    expect(await prisma.channelListingOptionInventoryComponent.findMany({ where: { channelListingOptionId: option.id }, select: { masterProductId: true, quantity: true } }))
      .toEqual([{ masterProductId: master.id, quantity: 2 }]);
  });

  it('확정 요구가 없는 수집은 바코드 없는 행을 받고, 확정 요구 수집은 거절한다(쪽 수 제한 없음)', async () => {
    const run = await beginRun({ ...scope, requireConfirmation: false, status: 'PA' });
    const rows = Array.from({ length: 63 }, (_, index) => ({ ...row(`P${index}`), poNumber: String(1001 + index), poLineId: `${1001 + index}:P${index}`, barcode: '' }));
    await collect(run, rows, { listPagesRead: 21, totalListPages: 21 }).expect(200);
    const strict = await beginRun();
    expect((await collect(strict, [{ ...row('P1'), barcode: '' }]).expect(400)).body).toMatchObject({ details: { reason: 'rocket_po_collection_incomplete' } });
    expect(new Set((await listSaved()).map((po) => po.rocketPoOperationId))).toEqual(new Set([run.operation.id]));
  });

  it('Supply 미리보기·워크북 확정은 실행 ID로 정확한 수집을 읽고, 워크북에 rocketPoOperationId를 남긴다', async () => {
    const a = await publish();
    await publish([row('P2')]);
    const option = await prisma.channelListingOption.findFirstOrThrow({ where: { organizationId: ORG, externalOptionId: 'P1' } });
    const master = await prisma.masterProduct.create({
      data: { organizationId: ORG, code: 'KI1', sourceAccountKey: 'kiditem', sourceProductCode: 'KI1', sourceOptionCode: '', name: 'Confirmed product', currentStock: 5 },
    });
    const importedAt = new Date();
    const inventoryRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: ORG, sourceType: 'sellpia_inventory', channelAccountId: null, fileName: 'rocket-inventory.json', fileHash: 'e'.repeat(64),
        status: 'completed', rowCount: 1, importedAt, lastVerifiedAt: importedAt, verificationCount: 1, freshnessGeneration: 1n,
      },
    });
    await prisma.channelListingOptionInventoryComponent.create({ data: { organizationId: ORG, channelListingOptionId: option.id, masterProductId: master.id, quantity: 1 } });
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: ORG, requestedGeneration: 1n, verifiedGeneration: 1n, lastVerifiedAt: importedAt,
        lastCompletedImportRunId: inventoryRun.id, sourceOrigin: 'https://kiditem.sellpia.com', sourceAccountKey: 'kiditem',
      },
    });
    const preview = previewService();
    const previewInput = {
      organizationId: ORG,
      userId: USER,
      request: { channelAccountId: ACCOUNT, rocketPoOperationId: a, inventoryAttemptId: inventoryRun.id, editedQuantities: {}, previewScope: 'confirmation_requested' as const },
    };
    const result = await preview.preview(previewInput);
    expect(result.rows).toMatchObject([{ productNo: 'P1', orderQuantity: 4 }]);
    expect(result.catalog).toMatchObject({ rocketPoOperationId: a, rowCount: 1 });
    await expect(preview.preview({ ...previewInput, request: { ...previewInput.request, editedQuantities: { unknown: 1 } } }))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'ROCKET_PREVIEW_DECISION_INVALID' } });

    const workbooks = new RocketWorkbookExportService(
      preview,
      new RocketPurchaseConfirmationTransactionAdapter(
        prisma as never,
        new RocketWorkbookProgressService(new RocketWorkbookProgressRepositoryAdapter()),
        new ProductTransactionalReadRepositoryAdapter(),
        new ChannelOptionRecipeService(new ChannelOptionRecipeRepositoryAdapter(prisma as never, new ProductTransactionalReadRepositoryAdapter(), new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()))),
        catalog,
      ),
      catalog,
    );
    const input = {
      organizationId: ORG,
      userId: USER,
      artifactBytes: Buffer.from('unchanged workbook bytes'),
      request: {
        channelAccountId: ACCOUNT, rocketPoOperationId: a, inventoryAttemptId: inventoryRun.id, idempotencyKey: randomUUID(),
        editedQuantities: { [row('P1').poLineId]: 4 }, shortageReasons: {}, artifactFileName: 'rocket.xlsx',
        artifactContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const,
      },
    };
    const first = await workbooks.exportWorkbook(input);
    expect(first).toMatchObject({ duplicate: false, rows: [{ poLineId: row('P1').poLineId, workbookQuantity: 4 }], inventoryGeneration: '1' });
    expect(await workbooks.exportWorkbook(input)).toMatchObject({ exportId: first.exportId, duplicate: true });
    expect((await workbooks.downloadWorkbook({ organizationId: ORG, exportId: first.exportId })).bytes).toEqual(input.artifactBytes);
    await expect(prisma.rocketPurchaseConfirmation.findUniqueOrThrow({ where: { id: first.exportId } }))
      .resolves.toMatchObject({ rocketPoOperationId: a, sourceImportRunId: null });
    await expect(workbooks.exportWorkbook({ ...input, request: { ...input.request, idempotencyKey: randomUUID(), rocketPoOperationId: randomUUID() } }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('4,000줄 한 번 수집을 청크로 올리고 bulk 식별 쓰기로 발행한다', async () => {
    const rows = Array.from({ length: 4000 }, (_, index) => ({ ...row(`PRODUCT-${index}`), poNumber: String(100000 + index), poLineId: `${100000 + index}:PRODUCT-${index}` }));
    const run = await beginRun();
    dbOperations.length = 0;
    const started = performance.now();
    await collect(run, rows).expect(200);
    process.stdout.write(`ROCKET_OPERATION_MEASUREMENT ${JSON.stringify({ rows: rows.length, elapsedMs: Math.round(performance.now() - started) })}\n`);
    const complete = await catalog.readComplete({ ...saved, rocketPoOperationId: run.operation.id });
    expect(complete.rows).toHaveLength(4000);
    expect(complete.identities).toHaveLength(4000);
    expect(complete.catalog.rowCount).toBe(4000);
  }, 120_000);

  function previewService() {
    const products = new ProductSourceReadRepositoryAdapter(prisma as never);
    const productTransactions = new ProductTransactionalReadRepositoryAdapter();
    const availability = new ProductAvailabilityUseCase(new ProductAvailabilityRepositoryAdapter(prisma as never));
    const recipes = new ChannelOptionRecipeService(new ChannelOptionRecipeRepositoryAdapter(prisma as never, productTransactions, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter())));
    const matching = new ChannelProductMatchingRepositoryAdapter(prisma as never, productTransactions, products, recipes);
    return new RocketPurchasePreviewService(
      catalog,
      new ChannelSkuAvailabilityService(matching, availability),
      new ProductCollectionFreshnessUseCase(new ProductCollectionFreshnessRepositoryAdapter(prisma as never)),
    );
  }
});

function row(productNo: string) {
  return {
    poLineId: `1001:${productNo}:8801234567890:1`,
    poNumber: '1001',
    vendorId: 'V1',
    productNo,
    barcode: '8801234567890',
    productName: `${productNo} item`,
    orderQty: 4,
    plannedDeliveryDate: '2026-09-20',
    poStatusCode: 'RP',
    businessDateBasis: 'expected_inbound' as const,
    confirmation: {
      center: '덕평1센터', inboundType: '택배', poStatus: '거래처확인요청', returnManager: '담당자', returnContact: '010-0000-0000',
      returnAddress: '서울', purchasePrice: 1000, supplyPrice: 900, vat: 90, totalPurchase: 3960, poRegisteredAt: '2026-09-17 09:00:00', xdock: 'N',
    } as { center: string; inboundType: string; poStatus: string; returnManager: string; returnContact: string; returnAddress: string; purchasePrice: number; supplyPrice: number; vat: number; totalPurchase: number; poRegisteredAt: string; xdock: string } | undefined,
  };
}
type SubmittedRow = ReturnType<typeof row>;

function scan(rows: SubmittedRow[], plan: Record<string, unknown>, overrides: Partial<CoupangRocketPoScan>): CoupangRocketPoScan {
  return {
    vendorId: rows.length ? 'V1' : '',
    listPagesRead: 1,
    totalListPages: 1,
    detailPoCount: new Set(rows.map((item) => item.poNumber)).size,
    proof: {
      from: String(plan.from),
      to: String(plan.to),
      status: plan.status as CoupangRocketPoScan['proof']['status'],
      dateType: plan.dateType as CoupangRocketPoScan['proof']['dateType'],
      validatedList: true,
    },
    ...overrides,
  };
}
