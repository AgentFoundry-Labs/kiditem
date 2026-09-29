import { Injectable } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { accountLockKey } from '@kiditem/shared/operation';
import {
  COUPANG_SHIPMENT_LIST_CHUNK_KIND,
  COUPANG_SHIPMENT_LIST_KIND,
  MALL_TRACKING_UPLOAD_CHUNK_KIND,
  MALL_TRACKING_UPLOAD_KIND,
  SELLPIA_AUTO_INVOICE_CHUNK_KIND,
  SELLPIA_AUTO_INVOICE_KIND,
  SELLPIA_ORDER_SNAPSHOT_CHUNK_KIND,
  SELLPIA_ORDER_SNAPSHOT_KIND,
  SELLPIA_ORDER_TRANSFER_CHUNK_KIND,
  SELLPIA_ORDER_TRANSFER_KIND,
  SELLPIA_POST_TRANSFER_CHUNK_KIND,
  SELLPIA_POST_TRANSFER_KIND,
} from '@kiditem/shared/orders-action-operations';
import {
  COUPANG_DIRECTSHIP_KIND,
  MALL_ORDERS_CHUNK_KIND,
  MALL_ORDERS_KIND,
  SELLPIA_SHIPMENT_TRACKING_CHUNK_KIND,
  SELLPIA_SHIPMENT_TRACKING_KIND,
} from '@kiditem/shared/orders-operations';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID as OTHER_ORG,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';
import { ordersOperationsApp } from '../../test-helpers/orders-operations';
import { OperationOwner } from '../../common/operation/application/port/out/owner/operation-owner.decorator';
import type { OperationOwnerPort } from '../../common/operation/application/port/out/owner/operation-owner.port';
import { CHANNEL_ACCOUNT_PORT } from '../../channels/application/port/in/account/channel-account.port';
import { ChannelAccountService } from '../../channels/application/service/account/channel-account.service';
import { ChannelAccountPersistenceAdapter } from '../../channels/adapter/out/persistence/channel-account.persistence.adapter';
import { ChannelCredentialsAdapter } from '../../channels/adapter/out/credentials/channel-credentials.adapter';
import { ChannelsProductMappingGenerationAdapter } from '../../channels/adapter/out/products/product-mapping-generation.adapter';
import { ProductMappingGenerationRepositoryAdapter } from '../../products/adapter/out/persistence/product-mapping-generation.repository.adapter';
import { MallOrdersOperationOwner } from '../adapter/in/operation/mall-orders-operation-owner';
import { SellpiaShipmentTrackingOperationOwner } from '../adapter/in/operation/sellpia-shipment-tracking-operation-owner';
import { SellpiaOrderTransferOperationOwner } from '../adapter/in/operation/sellpia-order-transfer-operation-owner';
import { SellpiaPostTransferOperationOwner } from '../adapter/in/operation/sellpia-post-transfer-operation-owner';
import { SellpiaAutoInvoiceOperationOwner } from '../adapter/in/operation/sellpia-auto-invoice-operation-owner';
import { SellpiaOrderSnapshotOperationOwner } from '../adapter/in/operation/sellpia-order-snapshot-operation-owner';
import { CoupangShipmentListOperationOwner } from '../adapter/in/operation/coupang-shipment-list-operation-owner';
import { MallTrackingUploadOperationOwner } from '../adapter/in/operation/mall-tracking-upload-operation-owner';
import { OrdersActionOperationsController } from '../adapter/in/web/orders-action-operations.controller';
import { OrderOperationCapturePersistenceAdapter } from '../adapter/out/persistence/order-operation-capture.persistence.adapter';
import { OrderMallAccountPersistenceAdapter } from '../adapter/out/persistence/order-mall-account.persistence.adapter';
import { SellpiaActionOutcomesPersistenceAdapter } from '../adapter/out/persistence/sellpia-action-outcomes.persistence.adapter';
import { CoupangDirectOrderCollectionTransactionAdapter } from '../adapter/out/transaction/coupang-direct-order-collection.transaction.adapter';
import { ORDER_OPERATION_CAPTURE_PORT } from '../application/port/in/order-operation-capture.port';
import { ROCKET_FINAL_ORDER_RECONCILIATION_PORT } from '../../supply/application/port/in/procurement/rocket-final-order-reconciliation.port';
import { COUPANG_DIRECT_ORDER_COLLECTION_PORT } from '../application/port/in/coupang-direct-order-collection.port';
import { COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT } from '../application/port/out/transaction/coupang-direct-order-collection.transaction.port';
import { ORDER_MALL_ACCOUNT_PORT } from '../application/port/out/persistence/order-mall-account.port';
import { SELLPIA_ACTION_OUTCOMES_PORT } from '../application/port/out/persistence/sellpia-action-outcomes.port';
import { CoupangDirectOrderCollectionService } from '../application/service/coupang-direct-order-collection.service';
import { MallOrdersOperationService } from '../application/service/mall-orders-operation.service';
import { OrderCollectionService } from '../application/service/order-collection.service';
import { OrdersActionOperationService } from '../application/service/orders-action-operation.service';
import { SellpiaInvoiceTargetsService } from '../application/service/sellpia-invoice-targets.service';
import { SellpiaOrderTransferService } from '../application/service/sellpia-order-transfer.service';
import { CoupangDirectshipService } from '../coupang-directship/coupang-directship.service';

// 옛 확장 워커 액션 6개가 옮겨 온 Orders 작업 실행 kind(KID-355 wave8b)를 실제 실행 계약(HTTP)·실제 owner·실제 PG로 돈다.
// 셀피아·몰·쿠팡에는 아무것도 쓰지 않는다 — 확장이 올릴 청크와 finish를 그대로 흉내 낸다.
const TODAY = '2026-09-29';
const DIRECTSHIP_ACCOUNT = '44444444-4444-4444-8444-444444444444';

function kidkidsOrder(om: string) {
  return {
    om,
    ordName: '풍산초',
    orderDate: `${TODAY} 10:00:00`,
    recvName: '풍산초',
    recvAddr: '06000 서울 강남구 테헤란로 1',
    recvTel: '02-000-0000',
    recvMobile: '010-0000-0000',
    recvMsg: '',
    items: [{ name: '상품 1', qty: 1, unit: 1000, sum: 1000 }],
  };
}

/** 키드키즈 변환기가 셀피아 주문번호로 매기는 값: 주문일 YYYYMMDD + 그날 순번 네 자리. 전송 대상은 이 번호다. */
const sellpiaNo = (index: number) => `${TODAY.replace(/-/g, '')}${String(index).padStart(4, '0')}`;

function tracking(ordNo: string, provider: string) {
  return { ordNo, itemNo: '', invNo: `INV-${ordNo}`, courier: '1136', provider };
}

/** 직배송 실행 자리 — 전송 원천 kind 판정만 본다(캡처·소비 기록 없음). */
@OperationOwner()
@Injectable()
class DirectshipStandInOwner implements OperationOwnerPort {
  readonly kind = COUPANG_DIRECTSHIP_KIND;
  async plan() {
    return { lockKeys: [accountLockKey(DIRECTSHIP_ACCOUNT)], plan: { channelAccountId: DIRECTSHIP_ACCOUNT } };
  }
  async finalize() {
    return { result: { rowCount: 1 } };
  }
}

/** Python 생성기(외부 프로세스) 자리 — 직배송 성공 경로는 이 스펙이 부르지 않는다. */
class UnusedDirectshipGenerator {
  async generate(): Promise<never> {
    throw new Error('directship generator must not run in this spec');
  }
}

describe('Orders 작업 실행 kind 6종(KID-355 wave8b) over the operation contract + disposable PG', () => {
  let prisma: PrismaClient;
  let harness: Awaited<ReturnType<typeof ordersOperationsApp>>;
  let kidkidsAccount: string;
  let onchAccount: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const channelAccounts = new ChannelAccountService(
      new ChannelAccountPersistenceAdapter(prisma as never, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter())),
      new ChannelCredentialsAdapter(),
    );
    harness = await ordersOperationsApp(prisma, {
      owners: [
        MallOrdersOperationOwner,
        DirectshipStandInOwner,
        SellpiaShipmentTrackingOperationOwner,
        SellpiaOrderTransferOperationOwner,
        SellpiaPostTransferOperationOwner,
        SellpiaAutoInvoiceOperationOwner,
        SellpiaOrderSnapshotOperationOwner,
        CoupangShipmentListOperationOwner,
        MallTrackingUploadOperationOwner,
      ],
      controllers: [OrdersActionOperationsController],
      providers: [
        MallOrdersOperationService,
        OrderCollectionService,
        SellpiaOrderTransferService,
        SellpiaInvoiceTargetsService,
        OrdersActionOperationService,
        CoupangDirectOrderCollectionService,
        { provide: CoupangDirectshipService, useClass: UnusedDirectshipGenerator },
        { provide: COUPANG_DIRECT_ORDER_COLLECTION_PORT, useExisting: CoupangDirectOrderCollectionService },
        { provide: COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT, useClass: CoupangDirectOrderCollectionTransactionAdapter },
        // 직배송 소비(consume)는 이 스펙이 부르지 않는다 — 소비 기록 읽기(readProjection)만 실제 PG로 돈다.
        { provide: ROCKET_FINAL_ORDER_RECONCILIATION_PORT, useValue: {} },
        { provide: CHANNEL_ACCOUNT_PORT, useValue: channelAccounts },
        { provide: ORDER_OPERATION_CAPTURE_PORT, useClass: OrderOperationCapturePersistenceAdapter },
        { provide: ORDER_MALL_ACCOUNT_PORT, useClass: OrderMallAccountPersistenceAdapter },
        { provide: SELLPIA_ACTION_OUTCOMES_PORT, useClass: SellpiaActionOutcomesPersistenceAdapter },
      ],
    });
  });

  afterAll(async () => {
    await harness?.app.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const create = (channel: string, name: string) =>
      prisma.channelAccount.create({ data: { organizationId: ORG, channel, name, externalAccountId: channel, isPrimary: true } });
    kidkidsAccount = (await create('kidkids', '키드키즈')).id;
    onchAccount = (await create('onch', '온채널')).id;
  });

  const post = (path: string, body: Record<string, unknown>, organizationId = ORG) =>
    request(harness.httpUrl).post(`/api/orders/action-operations/${path}`).set('x-test-org', organizationId).send(body);
  const readSource = (operationId: string, organizationId = ORG) =>
    request(harness.httpUrl).get(`/api/orders/action-operations/${operationId}/source`).set('x-test-org', organizationId)
      .buffer(true).parse((res, done) => {
        const parts: Buffer[] = [];
        res.on('data', (part: Buffer) => parts.push(part));
        res.on('end', () => done(null, Buffer.concat(parts)));
      });

  /** 키드키즈 몰 주문 실행 하나를 성공으로 끝낸다 — 셀피아 전송의 원천. */
  async function mallSource(orderNumbers: string[]): Promise<string> {
    const run = await harness.beginRun(MALL_ORDERS_KIND, { channelAccountId: kidkidsAccount, mallKey: 'kidkids', collectionDate: TODAY, collectionMode: 'browser' });
    await harness.put(run, [{ chunkKind: MALL_ORDERS_CHUNK_KIND, payload: orderNumbers.map(kidkidsOrder) }]);
    await harness.finish(run).expect(200);
    return run.operation.id;
  }

  /** 전송 실행을 접수 확인(submitted)으로 끝낸다(`accepted`는 셀피아 주문번호). */
  async function submittedTransfer(orderNumbers: string[], accepted: string[]): Promise<string> {
    const sourceOperationId = await mallSource(orderNumbers);
    const run = await harness.beginRun(SELLPIA_ORDER_TRANSFER_KIND, { sourceOperationId, shopName: '키드키즈' });
    await harness.put(run, [{ chunkKind: SELLPIA_ORDER_TRANSFER_CHUNK_KIND, payload: [{ outcome: 'submitted', acceptedOrderNumbers: accepted, baselineRows: 0, afterRows: accepted.length, mallMessage: null }] }]);
    await harness.finish(run).expect(200);
    return run.operation.id;
  }

  describe('orders.sellpia_order_transfer', () => {
    it('plan은 원천 몰 주문 실행의 변환 파일에서 대상 주문번호를 읽고 셀피아 잠금을 쥔다; source 라우트가 같은 파일을 plan 이름으로 준다', async () => {
      const sourceOperationId = await mallSource(['K-1', 'K-2']);
      const run = await harness.beginRun(SELLPIA_ORDER_TRANSFER_KIND, { sourceOperationId, shopName: '키드키즈' });
      expect(run.operation.lockKeys).toEqual(['resource:sellpia:login']);
      expect(run.operation.plan).toMatchObject({ sourceOperationId, shopName: '키드키즈', transport: null, targetOrderNumbers: [sellpiaNo(1), sellpiaNo(2)] });
      const fileName = String((run.operation.plan as { fileName: string }).fileName);

      const source = await readSource(run.operation.id).expect(200);
      expect(source.headers['content-disposition']).toContain(encodeURIComponent(fileName));
      expect(source.headers['cache-control']).toBe('private, no-store');
      const book = XLSX.read(source.body as Buffer, { type: 'buffer' });
      expect(book.SheetNames.length).toBeGreaterThan(0);
      await expect(prisma.orderCollectionArtifact.count({ where: { organizationId: ORG } })).resolves.toBe(1);

      expect((await readSource(run.operation.id, OTHER_ORG).expect(404)).body.toString()).toContain('OPERATION_NOT_FOUND');
    });

    it('원천이 없거나·다른 조직이거나·끝나지 않았거나 전송 원천 kind가 아니면 ORDERS_TRANSFER_SOURCE_UNAVAILABLE', async () => {
      const missing = await harness.begin(SELLPIA_ORDER_TRANSFER_KIND, { sourceOperationId: DIRECTSHIP_ACCOUNT, shopName: '키드키즈' }).expect(422);
      expect(missing.body).toMatchObject({ code: 'ORDERS_TRANSFER_SOURCE_UNAVAILABLE' });
      const sourceOperationId = await mallSource(['K-1']);
      await harness.begin(SELLPIA_ORDER_TRANSFER_KIND, { sourceOperationId, shopName: '키드키즈' }, OTHER_ORG).expect(422);
      const tracking = await harness.beginRun(SELLPIA_SHIPMENT_TRACKING_KIND, { startDate: TODAY, endDate: TODAY });
      await harness.finish(tracking).expect(200);
      const wrongKind = await harness.begin(SELLPIA_ORDER_TRANSFER_KIND, { sourceOperationId: tracking.operation.id, shopName: '키드키즈' }).expect(422);
      expect(wrongKind.body).toMatchObject({ code: 'ORDERS_TRANSFER_SOURCE_UNAVAILABLE' });
      const running = await harness.beginRun(MALL_ORDERS_KIND, { channelAccountId: onchAccount, mallKey: 'onch', collectionDate: TODAY, collectionMode: 'browser' });
      await harness.begin(SELLPIA_ORDER_TRANSFER_KIND, { sourceOperationId: running.operation.id, shopName: '온채널' }).expect(422);
    });

    it('운송유형은 직배송 원천에만 — 몰 주문에 주면·직배송에 안 주면 VALIDATION_FAILED, 소비 기록 없는 직배송은 원천 없음', async () => {
      const sourceOperationId = await mallSource(['K-1']);
      const mallWithTransport = await harness.begin(SELLPIA_ORDER_TRANSFER_KIND, { sourceOperationId, shopName: '키드키즈', transport: 'SHIPMENT' }).expect(400);
      expect(mallWithTransport.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'transport_not_allowed' } });
      const directship = await harness.beginRun(COUPANG_DIRECTSHIP_KIND, {});
      await harness.finish(directship).expect(200);
      const noTransport = await harness.begin(SELLPIA_ORDER_TRANSFER_KIND, { sourceOperationId: directship.operation.id, shopName: '쿠팡직배송' }).expect(400);
      expect(noTransport.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'transport_required' } });
      const unconsumed = await harness.begin(SELLPIA_ORDER_TRANSFER_KIND, { sourceOperationId: directship.operation.id, shopName: '쿠팡직배송', transport: 'MILKRUN' }).expect(422);
      expect(unconsumed.body).toMatchObject({ code: 'ORDERS_TRANSFER_SOURCE_UNAVAILABLE' });
    });

    it('다시 만든 파일의 주문번호가 plan과 다르면 source 라우트가 거절한다', async () => {
      const sourceOperationId = await mallSource(['K-1', 'K-2']);
      const run = await harness.beginRun(SELLPIA_ORDER_TRANSFER_KIND, { sourceOperationId, shopName: '키드키즈' });
      await prisma.orderCollectionArtifact.updateMany({
        where: { organizationId: ORG, operationId: sourceOperationId },
        data: { sourceBytes: new Uint8Array(Buffer.from(JSON.stringify({ orders: [kidkidsOrder('K-1')] }), 'utf8')) },
      });
      const changed = await readSource(run.operation.id).expect(422);
      expect(changed.body.toString()).toContain('ORDERS_TRANSFER_SOURCE_UNAVAILABLE');
    });

    it('접수 확인 못 함은 reconciling으로 잠금을 쥐고, 운영자 confirm이 대상 전부를 받아들여진 번호로 닫는다', async () => {
      const sourceOperationId = await mallSource(['K-1', 'K-2']);
      const run = await harness.beginRun(SELLPIA_ORDER_TRANSFER_KIND, { sourceOperationId, shopName: '키드키즈' });
      await harness.put(run, [{ chunkKind: SELLPIA_ORDER_TRANSFER_CHUNK_KIND, payload: [{ outcome: 'unknown', acceptedOrderNumbers: [sellpiaNo(1)], baselineRows: 3, afterRows: 4, mallMessage: null }] }]);
      const held = await harness.finish(run, { outcome: 'reconciling', result: { outcome: 'unknown' } }).expect(200);
      expect(held.body.operation).toMatchObject({ status: 'reconciling', lockKeys: ['resource:sellpia:login'] });
      expect((await harness.begin(SELLPIA_POST_TRANSFER_KIND, {}).expect(409)).body).toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
      await readSource(run.operation.id).expect(200);

      const confirmed = await post(`${run.operation.id}/confirm`, {}).expect(201);
      expect(confirmed.body.operation).toMatchObject({ status: 'succeeded', result: { outcome: 'submitted', acceptedOrderNumbers: [sellpiaNo(1), sellpiaNo(2)], targetOrderCount: 2 } });
      await readSource(run.operation.id).expect(404);
    });

    it('운영자 close는 미접수(SELLPIA_TRANSFER_NOT_SUBMITTED)로 닫고 잠금을 놓는다; reconciling이 아닌 실행은 거절', async () => {
      const sourceOperationId = await mallSource(['K-1']);
      const run = await harness.beginRun(SELLPIA_ORDER_TRANSFER_KIND, { sourceOperationId, shopName: '키드키즈' });
      await harness.put(run, [{ chunkKind: SELLPIA_ORDER_TRANSFER_CHUNK_KIND, payload: [{ outcome: 'unknown', acceptedOrderNumbers: [], baselineRows: 3, afterRows: 3, mallMessage: null }] }]);
      await expect(post(`${run.operation.id}/close`, {}).then((res) => res.status)).resolves.toBe(409);
      await harness.finish(run, { outcome: 'reconciling', result: {} }).expect(200);
      expect((await post(`${run.operation.id}/close`, {}, OTHER_ORG).expect(404)).body).toMatchObject({ code: 'OPERATION_NOT_FOUND' });
      const closed = await post(`${run.operation.id}/close`, { reason: '셀피아 대기목록에 없음' }).expect(201);
      expect(closed.body.operation).toMatchObject({ status: 'failed', errorCode: 'SELLPIA_TRANSFER_NOT_SUBMITTED', lockKeys: [] });
    });
  });

  describe('orders.sellpia_auto_invoice · orders.sellpia_post_transfer', () => {
    it('대상은 24시간 안 성공 전송의 받아들여진 번호 − 이미 발급된 번호; 못 찾은 번호는 다음 자동송장 plan에 다시 들어온다', async () => {
      const old = await submittedTransfer(['O-1'], [sellpiaNo(1)]);
      await prisma.operation.update({ where: { id: old }, data: { finishedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) } });
      await submittedTransfer(['K-1', 'K-2', 'K-3'], [sellpiaNo(2), sellpiaNo(3)]);

      const post1 = await harness.beginRun(SELLPIA_POST_TRANSFER_KIND, {});
      expect(post1.operation.lockKeys).toEqual(['resource:sellpia:login']);
      await harness.put(post1, [{ chunkKind: SELLPIA_POST_TRANSFER_CHUNK_KIND, payload: [
        { step: 'register', done: true, mallMessage: null },
        { step: 'stockmatch', done: true, mallMessage: null, unmatchedOrderNumbers: [sellpiaNo(3)] },
      ] }]);
      const posted = await harness.finish(post1).expect(200);
      expect(posted.body.operation.result).toEqual({ registered: true, stockMatched: true, unmatchedOrderNumbers: [sellpiaNo(3)], invoiceTargetCount: 2 });

      const invoice = await harness.beginRun(SELLPIA_AUTO_INVOICE_KIND, {});
      expect(invoice.operation.plan).toEqual({ targetOrderNumbers: [sellpiaNo(2), sellpiaNo(3)] });
      expect(invoice.operation.lockKeys).toEqual(['resource:sellpia:login']);
      await harness.put(invoice, [{ chunkKind: SELLPIA_AUTO_INVOICE_CHUNK_KIND, payload: [{ orderNo: sellpiaNo(2), trackingNumber: 'T-1', courier: 'CJ대한통운' }] }]);
      const issued = await harness.finish(invoice).expect(200);
      expect(issued.body.operation.result).toEqual({
        issued: [{ orderNo: sellpiaNo(2), trackingNumber: 'T-1', courier: 'CJ대한통운' }],
        selectedOrderNumbers: [sellpiaNo(2), sellpiaNo(3)],
        notFoundOrderNumbers: [sellpiaNo(3)],
      });

      const retry = await harness.beginRun(SELLPIA_AUTO_INVOICE_KIND, {});
      expect(retry.operation.plan).toEqual({ targetOrderNumbers: [sellpiaNo(3)] });
      await harness.put(retry, [{ chunkKind: SELLPIA_AUTO_INVOICE_CHUNK_KIND, payload: [{ orderNo: sellpiaNo(3), trackingNumber: 'T-3', courier: 'CJ대한통운' }] }]);
      await harness.finish(retry).expect(200);
      const none = await harness.begin(SELLPIA_AUTO_INVOICE_KIND, {}).expect(422);
      expect(none.body).toMatchObject({ code: 'ORDERS_SELLPIA_INVOICE_NO_TARGETS' });
    });

    it('대상 밖 번호를 발급했다는 finish는 거절되고, 채번 후 못 읽음은 reconciling → 운영자가 본 행으로 confirm', async () => {
      await submittedTransfer(['K-1'], [sellpiaNo(1)]);
      const outside = await harness.beginRun(SELLPIA_AUTO_INVOICE_KIND, {});
      await harness.put(outside, [{ chunkKind: SELLPIA_AUTO_INVOICE_CHUNK_KIND, payload: [{ orderNo: 'Z-9', trackingNumber: 'T-9', courier: 'CJ대한통운' }] }]);
      expect((await harness.finish(outside).expect(400)).body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'issued_outside_targets' } });
      await harness.finish(outside, { outcome: 'failed', errorCode: 'SELLPIA_SCREEN_UNREADABLE' }).expect(200);

      const run = await harness.beginRun(SELLPIA_AUTO_INVOICE_KIND, {});
      await harness.finish(run, { outcome: 'reconciling', result: {} }).expect(200);
      const confirmed = await post(`${run.operation.id}/confirm`, { result: { issued: [{ orderNo: sellpiaNo(1), trackingNumber: 'T-1', courier: 'CJ대한통운' }] } }).expect(201);
      expect(confirmed.body.operation).toMatchObject({ status: 'succeeded', result: { issued: [{ orderNo: sellpiaNo(1) }], notFoundOrderNumbers: [] } });
      await harness.begin(SELLPIA_AUTO_INVOICE_KIND, {}).expect(422);
    });

    it('reconciling 전송은 운영자가 confirm하기 전에는 송장 대상이 아니다', async () => {
      const sourceOperationId = await mallSource(['K-1']);
      const run = await harness.beginRun(SELLPIA_ORDER_TRANSFER_KIND, { sourceOperationId, shopName: '키드키즈' });
      await harness.put(run, [{ chunkKind: SELLPIA_ORDER_TRANSFER_CHUNK_KIND, payload: [{ outcome: 'unknown', acceptedOrderNumbers: [], baselineRows: 0, afterRows: 0, mallMessage: null }] }]);
      await harness.finish(run, { outcome: 'reconciling', result: {} }).expect(200);
      await post(`${run.operation.id}/close`, { reason: '미접수' }).expect(201);
      expect((await harness.begin(SELLPIA_AUTO_INVOICE_KIND, {}).expect(422)).body).toMatchObject({ code: 'ORDERS_SELLPIA_INVOICE_NO_TARGETS' });
    });
  });

  describe('orders.mall_tracking_upload', () => {
    async function trackingRun(rows: unknown[]): Promise<string> {
      const run = await harness.beginRun(SELLPIA_SHIPMENT_TRACKING_KIND, { startDate: TODAY, endDate: TODAY });
      await harness.put(run, [{ chunkKind: SELLPIA_SHIPMENT_TRACKING_CHUNK_KIND, payload: rows }]);
      await harness.finish(run).expect(200);
      return run.operation.id;
    }

    it('plan은 셀피아 송장 캡처에서 그 몰 판매처 행만 고르고 몰 계정 잠금을 쥔다; reconciling → close', async () => {
      const trackingOperationId = await trackingRun([tracking('A-1', '온채널(외부몰)'), tracking('B-1', '키드키즈'), tracking('A-2', '온채널')]);
      const run = await harness.beginRun(MALL_TRACKING_UPLOAD_KIND, { channelAccountId: onchAccount, mallKey: 'onch', trackingOperationId });
      expect(run.operation.lockKeys).toEqual([`account:${onchAccount}`]);
      expect(run.operation.plan).toEqual({
        channelAccountId: onchAccount,
        mallKey: 'onch',
        trackingOperationId,
        rows: [
          { orderNo: 'A-1', trackingNumber: 'INV-A-1', courier: '1136' },
          { orderNo: 'A-2', trackingNumber: 'INV-A-2', courier: '1136' },
        ],
      });
      await harness.put(run, [{ chunkKind: MALL_TRACKING_UPLOAD_CHUNK_KIND, payload: [{ orderNo: 'A-1', status: 'uploaded', mallMessage: null }] }]);
      await harness.finish(run, { outcome: 'reconciling', result: {} }).expect(200);
      const closed = await post(`${run.operation.id}/close`, { reason: '몰 목록에 반영 안 됨' }).expect(201);
      expect(closed.body.operation).toMatchObject({ status: 'failed', errorCode: 'ORDERS_ACTION_CLOSED_BY_OPERATOR', lockKeys: [] });
    });

    it('성공 finish는 행 상태를 합한다', async () => {
      const trackingOperationId = await trackingRun([tracking('A-1', '온채널'), tracking('A-2', '온채널')]);
      const run = await harness.beginRun(MALL_TRACKING_UPLOAD_KIND, { channelAccountId: onchAccount, mallKey: 'onch', trackingOperationId });
      await harness.put(run, [{ chunkKind: MALL_TRACKING_UPLOAD_CHUNK_KIND, payload: [
        { orderNo: 'A-1', status: 'uploaded', mallMessage: null },
        { orderNo: 'A-2', status: 'already_uploaded', mallMessage: '이미 등록' },
      ] }]);
      const finished = await harness.finish(run).expect(200);
      expect(finished.body.operation.result).toMatchObject({ uploaded: 1, alreadyUploaded: 1, notInList: 0, failed: 0 });
    });

    it('그 몰 행이 없으면 ORDERS_TRACKING_UPLOAD_NO_ROWS, 다른 계정·다른 조직 송장 실행은 거절', async () => {
      const trackingOperationId = await trackingRun([tracking('A-1', '온채널')]);
      expect((await harness.begin(MALL_TRACKING_UPLOAD_KIND, { channelAccountId: kidkidsAccount, mallKey: 'kidkids', trackingOperationId }).expect(422)).body)
        .toMatchObject({ code: 'ORDERS_TRACKING_UPLOAD_NO_ROWS' });
      expect((await harness.begin(MALL_TRACKING_UPLOAD_KIND, { channelAccountId: kidkidsAccount, mallKey: 'onch', trackingOperationId }).expect(400)).body)
        .toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'mall_account_mismatch' } });
      await harness.begin(MALL_TRACKING_UPLOAD_KIND, { channelAccountId: onchAccount, mallKey: 'onch', trackingOperationId }, OTHER_ORG).expect(400);
    });
  });

  describe('읽기 kind', () => {
    it('orders.coupang_shipment_list: 공급사 로그인 잠금, plan 쪽 상한 60, seq 중복 제거', async () => {
      const run = await harness.beginRun(COUPANG_SHIPMENT_LIST_KIND, { date: TODAY });
      expect(run.operation.lockKeys).toEqual(['resource:coupang-supplier:login']);
      expect(run.operation.plan).toEqual({ date: TODAY, maxPages: 60 });
      const row = (seq: string, center: string) => ({ seq, center, outbound: TODAY, boxes: 2, status: null });
      await harness.put(run, [
        { chunkKind: COUPANG_SHIPMENT_LIST_CHUNK_KIND, payload: [row('S-1', '안성'), row('S-2', '천안')] },
        { chunkKind: COUPANG_SHIPMENT_LIST_CHUNK_KIND, payload: [row('S-1', '안성')] },
      ]);
      const finished = await harness.finish(run, { outcome: 'succeeded', result: { scannedPages: 2, stopReason: 'past_date_block' } }).expect(200);
      expect(finished.body.operation.result).toEqual({ date: TODAY, shipments: [row('S-1', '안성'), row('S-2', '천안')], scannedPages: 2, stopReason: 'past_date_block' });
    });

    it('orders.sellpia_order_snapshot: 셀피아 잠금, 두 화면을 주문번호로 합치고 partial을 싣는다', async () => {
      const run = await harness.beginRun(SELLPIA_ORDER_SNAPSHOT_KIND, {});
      expect(run.operation.lockKeys).toEqual(['resource:sellpia:login']);
      const row = (orderNo: string, source: string) => ({ orderNo, receiver: '가', provider: '온채널', source });
      await harness.put(run, [{ chunkKind: SELLPIA_ORDER_SNAPSHOT_CHUNK_KIND, payload: [row('A-1', 'pending'), row('A-1', 'stockmatch'), row('A-2', 'stockmatch')] }]);
      const finished = await harness.finish(run, { outcome: 'succeeded', result: { partial: false } }).expect(200);
      expect(finished.body.operation.result).toEqual({ orderCount: 2, rows: [row('A-1', 'pending'), row('A-2', 'stockmatch')], partial: false });
    });
  });
});
