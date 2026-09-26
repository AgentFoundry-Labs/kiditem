import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OPERATION_TOKEN_HEADER, OperationBeginResponseSchema, type OperationBeginResponse } from '@kiditem/shared/operation';
import { COUPANG_DIRECTSHIP_CHUNK_KIND, COUPANG_DIRECTSHIP_KIND } from '@kiditem/shared/orders-operations';
import { makeTestPrisma, OTHER_ORGANIZATION_ID, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG, TEST_USER_ID as USER } from '../../test-helpers/real-prisma';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { configureAgentRuntimeBodyParsers } from '../../common/http/agent-runtime-body-parser';
import { OperationsController } from '../../common/operation/adapter/in/web/operations.controller';
import { OperationRepositoryAdapter } from '../../common/operation/adapter/out/repository/operation.repository.adapter';
import { OPERATION_PORT } from '../../common/operation/application/port/in/operation.port';
import { OPERATION_REPOSITORY } from '../../common/operation/application/port/out/repository/operation.repository.port';
import { OperationOwnerRegistry } from '../../common/operation/application/service/operation-owner.registry';
import { OperationService } from '../../common/operation/application/service/operation.service';
import { RocketFinalOrderReconciliationTransactionAdapter } from '../../supply/adapter/out/transaction/rocket-final-order-reconciliation.transaction.adapter';
import { RocketFinalOrderReconciliationService } from '../../supply/application/service/rocket-final-order-reconciliation.service';
import { CoupangDirectshipOperationOwner } from '../adapter/in/operation/coupang-directship-operation-owner';
import { readObservedOrderCount } from '../adapter/out/persistence/read/order-facts.reader';
import { OrderOperationCapturePersistenceAdapter } from '../adapter/out/persistence/order-operation-capture.persistence.adapter';
import { CoupangDirectOrderCollectionTransactionAdapter } from '../adapter/out/transaction/coupang-direct-order-collection.transaction.adapter';
import { COUPANG_DIRECT_ORDER_COLLECTION_PORT } from '../application/port/in/coupang-direct-order-collection.port';
import { COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT } from '../application/port/out/transaction/coupang-direct-order-collection.transaction.port';
import { CoupangDirectOrderCollectionService } from '../application/service/coupang-direct-order-collection.service';
import { PrismaService } from '../../prisma/prisma.service';

// 확장 수집기(orders.coupang_directship)가 밟는 길: begin → orders_capture(발주서·센터표) → finish가 캡처만 보관한다.
// 주문·영수증·소비·Supply 대조는 성공한 실행을 운송유형별로 변환(consume)할 때 쓴다(KID-359).
const CHANNEL_ACCOUNT_ID = '51000000-0000-4000-8000-000000000001';
const SKU_ID = '51000000-0000-4000-8000-000000000002';
const checksum = (payload: unknown[]) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

describe('orders.coupang_directship owner over the operation contract + disposable PG', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;
  let service: CoupangDirectOrderCollectionService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const reconciliation = new RocketFinalOrderReconciliationService(new RocketFinalOrderReconciliationTransactionAdapter());
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [OperationsController],
      providers: [
        OperationOwnerRegistry,
        OperationService,
        { provide: OPERATION_PORT, useExisting: OperationService },
        { provide: OPERATION_REPOSITORY, useValue: new OperationRepositoryAdapter(prisma as never) },
        {
          provide: COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT,
          useFactory: (operations: OperationService) => new CoupangDirectOrderCollectionTransactionAdapter(
            prisma as unknown as PrismaService,
            reconciliation,
            new OrderOperationCapturePersistenceAdapter(prisma as unknown as PrismaService, operations),
          ),
          inject: [OPERATION_PORT],
        },
        CoupangDirectOrderCollectionService,
        { provide: COUPANG_DIRECT_ORDER_COLLECTION_PORT, useExisting: CoupangDirectOrderCollectionService },
        CoupangDirectshipOperationOwner,
      ],
    }).compile();
    service = module.get(CoupangDirectOrderCollectionService);
    app = module.createNestApplication({ logger: false, bodyParser: false });
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
    await prisma.channelAccount.create({ data: { id: CHANNEL_ACCOUNT_ID, organizationId: ORG, channel: 'rocket', name: 'Rocket' } });
    await prisma.sellpiaInventoryState.create({ data: { organizationId: ORG, requestedGeneration: 1n, verifiedGeneration: 1n, lastVerifiedAt: new Date() } });
  });

  const begin = (scope: Record<string, unknown> = { channelAccountId: CHANNEL_ACCOUNT_ID }) =>
    request(httpUrl).post('/api/operations').send({ kind: COUPANG_DIRECTSHIP_KIND, scope });
  async function put(run: OperationBeginResponse, sequence: number, payload: unknown[]) {
    await request(httpUrl).put(`/api/operations/${run.operation.id}/chunks/${COUPANG_DIRECTSHIP_CHUNK_KIND}/${sequence}`)
      .set(OPERATION_TOKEN_HEADER, run.token).send({ checksum: checksum(payload), payload }).expect(200);
  }
  const finish = (run: OperationBeginResponse, body: Record<string, unknown> = { outcome: 'succeeded' }) =>
    request(httpUrl).post(`/api/operations/${run.operation.id}/finish`).set(OPERATION_TOKEN_HEADER, run.token).send(body);

  /** 확장 수집기의 순서: 발주서 항목들 → 센터표 → finish. 성공한 실행 ID를 돌려준다. */
  async function capture(input: Capture): Promise<string> {
    const run = OperationBeginResponseSchema.parse((await begin().expect(201)).body);
    await put(run, 1, input.pos.map((purchaseOrder) => ({ purchaseOrder })));
    await put(run, 2, [{ centers: input.centers }]);
    await finish(run).expect(200);
    return run.operation.id;
  }
  const consume = (operationId: string, input: Capture, transport: 'SHIPMENT' | 'MILKRUN', organizationId = ORG) =>
    service.consume({ organizationId, userId: USER, operationId, capture: selection(input), transport });

  it('plan은 활성 로켓 계정의 계정 잠금만 정하고, 같은 계정의 두 번째 캡처는 OPERATION_IN_PROGRESS; 로켓 계정이 아니면 404', async () => {
    const first = OperationBeginResponseSchema.parse((await begin().expect(201)).body);
    expect(first.operation).toMatchObject({ lockKeys: [`account:${CHANNEL_ACCOUNT_ID}`], plan: { channelAccountId: CHANNEL_ACCOUNT_ID, captureMode: 'browser' } });
    expect((await begin().expect(409)).body).toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    await begin({ channelAccountId: randomUUID() }).expect(404);
    await begin({ channelAccountId: CHANNEL_ACCOUNT_ID, from: '2026-07-01' }).expect(400);
  });

  it('finish는 캡처를 실행 ID로 한 번 보관하고 result(rowCount·유형별 발주서 수)만 적는다 — 주문·영수증은 쓰지 않는다; 실패는 보관하지 않는다', async () => {
    const run = OperationBeginResponseSchema.parse((await begin().expect(201)).body);
    const input = mixedCapture();
    await put(run, 1, input.pos.map((purchaseOrder) => ({ purchaseOrder })));
    await put(run, 2, [{ centers: input.centers }]);
    const done = await finish(run).expect(200);
    expect(done.body.operation).toMatchObject({
      status: 'succeeded',
      result: { rowCount: 2, purchaseOrders: 2, lines: 2, partialDetailCount: 0, transports: { SHIPMENT: 1, MILKRUN: 1 } },
    });
    const artifacts = await prisma.orderCollectionArtifact.findMany({ where: { organizationId: ORG } });
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({ operationId: run.operation.id, sourceImportRunId: null, sourceContentType: 'application/json' });
    await expect(service.readCapture({ organizationId: ORG, operationId: run.operation.id })).resolves.toMatchObject({ channelAccountId: CHANNEL_ACCOUNT_ID, pos: [{ seq: 'PO-OWNER' }, { seq: 'PO-MILKRUN' }] });
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.coupangDirectTransportReceipt.count()).toBe(0);
    expect(await prisma.sourceImportRun.count({ where: { organizationId: ORG } })).toBe(0);
    const failed = OperationBeginResponseSchema.parse((await begin().expect(201)).body);
    await put(failed, 1, [{ purchaseOrder: input.pos[0] }]);
    const refused = await finish(failed).expect(400);
    expect(refused.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'coupang_direct_centers_missing' } });
    await finish(failed, { outcome: 'failed', errorCode: 'VALIDATION_FAILED' }).expect(200);
    expect(await prisma.orderCollectionArtifact.count({ where: { organizationId: ORG } })).toBe(1);
    await expect(service.readCapture({ organizationId: ORG, operationId: failed.operation.id })).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
  });

  it('성공한 실행을 운송유형별로 소비·재생하고, 주문·영수증·소비가 실행 ID를 적으며 주문 사실이 그 주문을 센다', async () => {
    const input = mixedCapture();
    const operationId = await capture(input);
    const receipt = await consume(operationId, input, 'SHIPMENT');
    const replay = await consume(operationId, input, 'SHIPMENT');
    const projection = await service.readProjection({ organizationId: ORG, operationId, transport: 'SHIPMENT' });
    const milkrun = await consume(operationId, input, 'MILKRUN');
    expect(receipt).toMatchObject({ effectOperationId: operationId, duplicate: false, collectedLines: [{ poNumber: 'PO-OWNER', productNo: 'P-OWNER' }] });
    expect(replay).toEqual({ ...receipt, duplicate: true });
    expect(projection).toMatchObject({ operationId, request: { transport: 'SHIPMENT', pos: [{ seq: 'PO-OWNER' }] }, receipt: { duplicate: false } });
    expect(milkrun).toMatchObject({ transport: 'MILKRUN', collectedLines: [{ poNumber: 'PO-MILKRUN', productNo: 'P-MILKRUN' }] });
    const orders = await prisma.order.findMany({ where: { organizationId: ORG } });
    expect(orders).toHaveLength(2);
    expect(orders.every((order) => order.operationId === operationId && order.sourceImportRunId === null)).toBe(true);
    const consumptions = await prisma.coupangDirectTransportConsumption.findMany();
    expect(consumptions.map((row) => [row.operationId, row.sourceImportRunId])).toEqual([[operationId, null], [operationId, null]]);
    expect(await prisma.coupangDirectTransportReceipt.count()).toBe(2);
    await expect(prisma.$transaction((tx) => readObservedOrderCount(tx, ORG))).resolves.toBe(2);
  });

  it('워크북과 맞는 최종주문은 실행 ID로 고정된 셀피아 전송 키를 남긴다', async () => {
    const exportId = await seedRequest('PO-1', 'P-1', '8801234567890', 3);
    const input = oneCapture('PO-1', 'P-1', '8801234567890', 3);
    const operationId = await capture(input);
    const receipt = await consume(operationId, input, 'SHIPMENT');
    expect(receipt).toMatchObject({ exportId, transmissionIntentKey: `rocket-final-order:${operationId}:shipment`, matchedLineCount: 1 });
    await expect(prisma.rocketPurchaseConfirmationTransmission.findFirstOrThrow()).resolves.toMatchObject({
      confirmationId: exportId, directshipOperationId: operationId, sourceImportRunId: null, transport: 'SHIPMENT', intentKey: `rocket-final-order:${operationId}:shipment`,
    });
  });

  it('다른 실행의 같은 유형 발주는 영수증을 나눠 쓰고, 쓰인 센터가 바뀌면 새 영수증이다', async () => {
    const firstInput = mixedCapture();
    const firstId = await capture(firstInput);
    const first = await consume(firstId, firstInput, 'SHIPMENT');
    const changedMilkrunCenter = structuredClone(firstInput);
    changedMilkrunCenter.centers['Busan FC']!.addr = 'Changed Busan address';
    const secondId = await capture(changedMilkrunCenter);
    const second = await consume(secondId, changedMilkrunCenter, 'SHIPMENT');
    const changedShipmentCenter = structuredClone(changedMilkrunCenter);
    changedShipmentCenter.centers['Seoul FC']!.addr = 'Changed Seoul address';
    const thirdId = await capture(changedShipmentCenter);
    const third = await consume(thirdId, changedShipmentCenter, 'SHIPMENT');
    expect(second).toEqual({ ...first, duplicate: true });
    expect(third).toMatchObject({ effectOperationId: thirdId, duplicate: false });
    expect(third.payloadChecksum).not.toBe(first.payloadChecksum);
    expect(await prisma.order.findFirstOrThrow({ where: { externalOrderId: 'PO-OWNER' }, select: { receiverAddr: true } })).toEqual({ receiverAddr: 'Changed Seoul address' });
    expect(await prisma.coupangDirectTransportReceipt.count()).toBe(2);
    expect(await prisma.coupangDirectTransportConsumption.count()).toBe(3);
  });

  it('변환 실패(바코드 불일치)는 성공한 실행과 캡처를 그대로 두고 아무것도 쓰지 않는다', async () => {
    await seedRequest('PO-1', 'P-1', '8801234567890', 4);
    const input = oneCapture('PO-1', 'P-1', 'DIFFERENT', 3);
    const operationId = await capture(input);
    await expect(consume(operationId, input, 'SHIPMENT')).rejects.toMatchObject({ code: 'SUPPLY_ROCKET_FINAL_ORDER_BARCODE_MISMATCH' });
    const operation = await request(httpUrl).get(`/api/operations?kinds=${COUPANG_DIRECTSHIP_KIND}&limit=1`).expect(200);
    expect(operation.body.operations[0]).toMatchObject({ id: operationId, status: 'succeeded' });
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.coupangDirectTransportReceipt.count()).toBe(0);
    expect(await prisma.coupangDirectTransportConsumption.count()).toBe(0);
  });

  it('빈 운송유형 탐색은 주문 없이 영수증을 남기고 재생한다', async () => {
    const input = oneCapture('PO-SHIPMENT-ONLY', 'P-SHIPMENT-ONLY', '8801234567890', 2);
    const operationId = await capture(input);
    const first = await consume(operationId, input, 'MILKRUN');
    expect(first).toMatchObject({ transport: 'MILKRUN', collectedLines: [], transmissionIntentKey: null, duplicate: false });
    expect(await consume(operationId, input, 'MILKRUN')).toEqual({ ...first, duplicate: true });
    expect(await prisma.order.count()).toBe(0);
  });

  it('다른 조직·끝나지 않은 실행·다른 계정·캡처에 없는 발주 선택은 소비하지 않는다', async () => {
    const input = oneCapture('PO-OWNER', 'P-OWNER', '8801234567890', 2);
    const operationId = await capture(input);
    await expect(consume(operationId, input, 'SHIPMENT', OTHER_ORGANIZATION_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const running = OperationBeginResponseSchema.parse((await request(httpUrl).post('/api/operations').send({ kind: COUPANG_DIRECTSHIP_KIND, scope: { channelAccountId: CHANNEL_ACCOUNT_ID } }).expect(201)).body);
    await expect(consume(running.operation.id, input, 'SHIPMENT')).rejects.toMatchObject({ code: 'STATE_CONFLICT', details: { reason: 'COUPANG_DIRECT_OPERATION_NOT_SUCCEEDED' } });
    await expect(consume(operationId, { ...input, channelAccountId: randomUUID() }, 'SHIPMENT')).rejects.toMatchObject({ code: 'STATE_CONFLICT', details: { reason: 'COUPANG_DIRECT_ACCOUNT_MISMATCH' } });
    const outside = structuredClone(input);
    outside.pos[0]!.items[0]!.qty = 9;
    await expect(consume(operationId, outside, 'SHIPMENT')).rejects.toMatchObject({ code: 'STATE_CONFLICT', details: { reason: 'COUPANG_DIRECT_CAPTURE_SELECTION_CONFLICT' } });
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.coupangDirectTransportConsumption.count()).toBe(0);
  });

  it('계정 ID는 대소문자를 가리지 않고 맞춘다', async () => {
    const lettered = 'abcdef00-0000-4000-8000-00000000000a';
    await prisma.channelAccount.create({ data: { id: lettered, organizationId: ORG, channel: 'rocket', name: 'Rocket lettered' } });
    const input = { ...oneCapture('PO-CASE', 'P-CASE', '8801234567890', 2), channelAccountId: lettered };
    const run = OperationBeginResponseSchema.parse((await begin({ channelAccountId: lettered.toUpperCase() }).expect(201)).body);
    await put(run, 1, input.pos.map((purchaseOrder) => ({ purchaseOrder })));
    await put(run, 2, [{ centers: input.centers }]);
    await finish(run).expect(200);
    const receipt = await consume(run.operation.id, { ...input, channelAccountId: lettered.toUpperCase() }, 'MILKRUN');
    expect(receipt).toMatchObject({ transport: 'MILKRUN', duplicate: false });
  });

  it('보관된 캡처나 영수증이 깨져 있으면 STATE_CONFLICT(이유 코드)로 거절한다', async () => {
    const input = oneCapture('PO-BROKEN', 'P-BROKEN', '8801234567890', 2);
    const operationId = await capture(input);
    await consume(operationId, input, 'MILKRUN');
    await prisma.coupangDirectTransportReceipt.updateMany({ data: { collectedLines: 'not-lines' as never } });
    await expect(consume(operationId, input, 'MILKRUN')).rejects.toMatchObject({ code: 'STATE_CONFLICT', details: { reason: 'COUPANG_DIRECT_RECEIPT_INVALID' } });

    await prisma.orderCollectionArtifact.updateMany({ where: { operationId }, data: { sourceBytes: Buffer.from('not json') } });
    await expect(consume(operationId, input, 'SHIPMENT')).rejects.toMatchObject({ code: 'STATE_CONFLICT', details: { reason: 'COUPANG_DIRECT_CAPTURE_INVALID' } });
  });

  async function seedRequest(poNumber: string, productNo: string, barcode: string, quantity: number) {
    const confirmation = await prisma.rocketPurchaseConfirmation.create({
      data: {
        organizationId: ORG, channelAccountId: CHANNEL_ACCOUNT_ID, rocketPoOperationId: randomUUID(), idempotencyKey: randomUUID(),
        requestHash: 'a'.repeat(64), freshnessGeneration: 1n, confirmedBy: USER,
      },
    });
    const line = await prisma.rocketPurchaseConfirmationLine.create({
      data: { organizationId: ORG, confirmationId: confirmation.id, poLineId: randomUUID(), poNumber, productNo, barcode, productName: 'Rocket item', orderQuantity: quantity, confirmedQuantity: quantity },
    });
    await prisma.rocketPurchaseConfirmationAllocation.create({
      data: { organizationId: ORG, confirmationLineId: line.id, legacySellpiaInventorySkuId: SKU_ID, unitsPerSale: 1, quantity },
    });
    return confirmation.id;
  }
});

type Capture = ReturnType<typeof oneCapture>;

function selection(input: Capture) {
  return { channelAccountId: input.channelAccountId, centers: input.centers, pos: input.pos };
}

function oneCapture(poNumber: string, productNo: string, barcode: string, qty: number) {
  return {
    channelAccountId: CHANNEL_ACCOUNT_ID,
    centers: { 'Seoul FC': { addr: 'Seoul', zip: '01234', contact: '02-1234' } } as Record<string, { addr: string; zip: string; contact: string }>,
    pos: [{
      seq: poNumber,
      status: 'PA' as const,
      center: 'Seoul FC',
      transport: 'SHIPMENT' as 'SHIPMENT' | 'MILKRUN',
      edd: '2026-07-20',
      reg: '2026-07-18 09:00:00',
      items: [{ skuId: productNo, barcode, name: 'Rocket item', qty, amount: qty * 1000 }],
    }],
  };
}

function mixedCapture(): Capture {
  const shipment = oneCapture('PO-OWNER', 'P-OWNER', '8801234567890', 2);
  return {
    ...shipment,
    centers: { ...shipment.centers, 'Busan FC': { addr: 'Busan', zip: '48900', contact: '051-1234' } },
    pos: [
      ...shipment.pos,
      {
        ...shipment.pos[0]!,
        seq: 'PO-MILKRUN',
        center: 'Busan FC',
        transport: 'MILKRUN' as const,
        items: [{ ...shipment.pos[0]!.items[0]!, skuId: 'P-MILKRUN', barcode: '8801234567891' }],
      },
    ],
  };
}
