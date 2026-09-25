import { Injectable } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { accountLockKey } from '@kiditem/shared/operation';
import {
  COUPANG_DIRECTSHIP_KIND,
  MALL_ORDERS_CHUNK_KIND,
  MALL_ORDERS_KIND,
} from '@kiditem/shared/orders-operations';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID as OTHER_ORG,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';
import { ordersOperationsApp } from '../../test-helpers/orders-operations';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { OperationOwner } from '../../common/operation/application/port/out/owner/operation-owner.decorator';
import type { OperationOwnerPort } from '../../common/operation/application/port/out/owner/operation-owner.port';
import { CHANNEL_ACCOUNT_PORT } from '../../channels/application/port/in/account/channel-account.port';
import { ChannelAccountService } from '../../channels/application/service/account/channel-account.service';
import { ChannelAccountPersistenceAdapter } from '../../channels/adapter/out/persistence/channel-account.persistence.adapter';
import { ChannelCredentialsAdapter } from '../../channels/adapter/out/credentials/channel-credentials.adapter';
import { ChannelsProductMappingGenerationAdapter } from '../../channels/adapter/out/products/product-mapping-generation.adapter';
import { ProductMappingGenerationRepositoryAdapter } from '../../products/adapter/out/persistence/product-mapping-generation.repository.adapter';
import { MallOrdersOperationOwner } from '../adapter/in/operation/mall-orders-operation-owner';
import { OrderCollectionController } from '../adapter/in/web/order-collection.controller';
import { OrderCollectionSourceController } from '../adapter/in/web/order-collection-source.controller';
import { OrderOperationCapturePersistenceAdapter } from '../adapter/out/persistence/order-operation-capture.persistence.adapter';
import { OrderMallAccountPersistenceAdapter } from '../adapter/out/persistence/order-mall-account.persistence.adapter';
import { OrderCollectionTodayOrdersAdapter } from '../adapter/out/persistence/read/order-collection-today-orders.adapter';
import { OrderCollectionSourceRepository } from '../adapter/out/repository/order-collection-source.repository';
import { ORDER_COLLECTION_SOURCE_PORT } from '../application/port/in/order-collection-source.port';
import { ORDER_COLLECTION_TODAY_ORDERS_PORT } from '../application/port/in/order-collection-today-orders.port';
import { ORDER_OPERATION_CAPTURE_PORT } from '../application/port/in/order-operation-capture.port';
import { ORDER_MALL_ACCOUNT_PORT } from '../application/port/out/persistence/order-mall-account.port';
import { MallOrdersOperationService } from '../application/service/mall-orders-operation.service';
import { OrderCollectionService } from '../application/service/order-collection.service';
import { readOrderWindowFacts } from '../adapter/out/persistence/read/order-facts.reader';

// 확장 수집기(orders.mall_orders)가 밟는 길을 서버에서 그대로: begin → order_rows 청크 → finish. 보관 캡처와
// 주문 수(result.rowCount)는 finish 트랜잭션에서만 쓰인다(ADR-0025). 변환은 실제 변환기, DB는 실제 PostgreSQL.
const TODAY = '2026-09-26';

function kidkidsOrder(om: string, items = 1) {
  return {
    om,
    ordName: '풍산초',
    orderDate: `${TODAY} 10:00:00`,
    recvName: '풍산초',
    recvAddr: '06000 서울 강남구 테헤란로 1',
    recvTel: '02-000-0000',
    recvMobile: '010-0000-0000',
    recvMsg: '',
    items: Array.from({ length: items }, (_, index) => ({ name: `상품 ${index + 1}`, qty: 1, unit: 1000, sum: 1000 })),
  };
}

/** H2가 옮길 directship kind 자리 — 오늘 주문 capability가 그 kind의 result.rowCount를 읽는지 본다. */
@OperationOwner()
@Injectable()
class DirectshipStandInOwner implements OperationOwnerPort {
  readonly kind = COUPANG_DIRECTSHIP_KIND;
  async plan(scope: Record<string, unknown>) {
    return { lockKeys: [accountLockKey(String(scope.channelAccountId))], plan: { channelAccountId: String(scope.channelAccountId) } };
  }
  async finalize() {
    return { result: { rowCount: 4 } };
  }
}

describe('orders.mall_orders owner + today-orders capability over the operation contract + disposable PG', () => {
  let prisma: PrismaClient;
  let harness: Awaited<ReturnType<typeof ordersOperationsApp>>;
  let accountFacts: ChannelAccountService;
  let kidkidsAccount: string;
  let art09Account: string;
  let domeggookAccount: string;
  let icecreamAccount: string;
  let rocketAccount: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const channelAccounts = new ChannelAccountService(
      new ChannelAccountPersistenceAdapter(prisma as never, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter())),
      new ChannelCredentialsAdapter(),
    );
    accountFacts = channelAccounts;
    harness = await ordersOperationsApp(prisma, {
      owners: [MallOrdersOperationOwner, DirectshipStandInOwner],
      controllers: [OrderCollectionController, OrderCollectionSourceController],
      providers: [
        MallOrdersOperationService,
        OrderCollectionService,
        { provide: CHANNEL_ACCOUNT_PORT, useValue: channelAccounts },
        { provide: SourceFailureAlerts, useValue: new SourceFailureAlerts(prisma as never) },
        { provide: ORDER_OPERATION_CAPTURE_PORT, useClass: OrderOperationCapturePersistenceAdapter },
        { provide: ORDER_MALL_ACCOUNT_PORT, useClass: OrderMallAccountPersistenceAdapter },
        { provide: ORDER_COLLECTION_TODAY_ORDERS_PORT, useClass: OrderCollectionTodayOrdersAdapter },
        { provide: ORDER_COLLECTION_SOURCE_PORT, useClass: OrderCollectionSourceRepository },
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
    art09Account = (await create('art09', '아트공구')).id;
    domeggookAccount = (await create('domeggook', '도매꾹')).id;
    icecreamAccount = (await create('icecream-mall', '아이스크림몰')).id;
    rocketAccount = (await create('rocket', '쿠팡 로켓')).id;
  });

  const scope = (patch: Record<string, unknown> = {}) => ({
    channelAccountId: kidkidsAccount,
    mallKey: 'kidkids',
    collectionDate: TODAY,
    collectionMode: 'browser',
    ...patch,
  });
  const convert = (path: string, operationId: string, organizationId = ORG) =>
    request(harness.httpUrl).post(`/api/orders/collection/${path}`).set('x-test-org', organizationId).send({ operationId });

  it('plan은 그 몰 계정의 잠금(account:<id>)과 옛 attempt plan의 칸을 정하고, finish가 캡처를 실행 id로 보관하고 주문 수를 적는다', async () => {
    const run = await harness.beginRun(MALL_ORDERS_KIND, scope({ selectionMode: 'automatic', seenRowKeys: ['A'] }));
    expect(run.operation.lockKeys).toEqual([`account:${kidkidsAccount}`]);
    expect(run.operation.plan).toEqual({
      channelAccountId: kidkidsAccount,
      mallKey: 'kidkids',
      mallName: '키드키즈',
      collectionDate: TODAY,
      collectionMode: 'browser',
      selectionMode: 'automatic',
      seenRowKeys: ['A'],
    });

    await harness.put(run, [
      { chunkKind: MALL_ORDERS_CHUNK_KIND, payload: [kidkidsOrder('K-1', 2)] },
      { chunkKind: MALL_ORDERS_CHUNK_KIND, payload: [kidkidsOrder('K-2')] },
    ]);
    const finished = await harness.finish(run).expect(200);
    // 주문 수 = 변환 출력 줄 − 상품 줄(주문마다 택배비 한 줄) — 사장님 2026-09-21·22 규칙.
    expect(finished.body.operation).toMatchObject({ status: 'succeeded', result: { rowCount: 2, mallKey: 'kidkids', captured: 2 } });

    const artifacts = await prisma.orderCollectionArtifact.findMany({ where: { organizationId: ORG } });
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({ operationId: run.operation.id, sourceImportRunId: null, sourceContentType: 'application/json' });
    expect(JSON.parse(Buffer.from(artifacts[0]!.sourceBytes).toString('utf8'))).toEqual({ orders: [kidkidsOrder('K-1', 2), kidkidsOrder('K-2')] });
    await expect(prisma.sourceImportRun.count({ where: { organizationId: ORG } })).resolves.toBe(0);
  });

  it('주문이 없으면 rowCount 0으로 성공하고(옛 complete-empty), 실패한 실행은 캡처를 남기지 않는다', async () => {
    const empty = await harness.beginRun(MALL_ORDERS_KIND, scope());
    const finished = await harness.finish(empty).expect(200);
    expect(finished.body.operation).toMatchObject({ status: 'succeeded', result: { rowCount: 0, mallKey: 'kidkids', captured: 0 } });

    const failed = await harness.beginRun(MALL_ORDERS_KIND, scope());
    await harness.put(failed, [{ chunkKind: MALL_ORDERS_CHUNK_KIND, payload: [kidkidsOrder('K-9')] }]);
    await harness.finish(failed, { outcome: 'failed', errorCode: 'SITE_LOGIN_REQUIRED' }).expect(200);
    const artifacts = await prisma.orderCollectionArtifact.findMany({ where: { organizationId: ORG } });
    expect(artifacts.map((artifact) => artifact.operationId)).toEqual([empty.operation.id]);
  });

  it('형식이 틀린 청크는 finalize가 VALIDATION_FAILED로 거절한다', async () => {
    for (const chunk of [
      { chunkKind: MALL_ORDERS_CHUNK_KIND, payload: ['not an order'] },
      { chunkKind: 'continuation', payload: [{}] },
      { chunkKind: 'tracking_rows', payload: [kidkidsOrder('K-1')] },
    ]) {
      const run = await harness.beginRun(MALL_ORDERS_KIND, scope());
      await harness.put(run, [chunk]);
      const refused = await harness.finish(run).expect(400);
      expect(refused.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      await harness.finish(run, { outcome: 'failed', errorCode: 'VALIDATION_FAILED' }).expect(200);
    }
    await expect(prisma.orderCollectionArtifact.count({ where: { organizationId: ORG } })).resolves.toBe(0);
  });

  it('같은 몰 계정의 두 번째 begin은 OPERATION_IN_PROGRESS, 다른 몰 계정은 막지 않는다', async () => {
    const first = await harness.beginRun(MALL_ORDERS_KIND, scope());
    const refused = await harness.begin(MALL_ORDERS_KIND, scope({ collectionDate: null })).expect(409);
    expect(refused.body).toMatchObject({ code: 'OPERATION_IN_PROGRESS', details: { operationId: first.operation.id } });
    await harness.beginRun(COUPANG_DIRECTSHIP_KIND, { channelAccountId: rocketAccount });
  });

  it('scope 검증: 옛 경로의 몰·그 몰 계정이 아닌 id·다른 조직·자동 선택에 본 행 없음은 VALIDATION_FAILED', async () => {
    const foreign = await prisma.channelAccount.create({
      data: { organizationId: OTHER_ORG, channel: 'kidkids', name: '키드키즈', externalAccountId: 'kidkids', isPrimary: true },
    });
    for (const bad of [
      scope({ mallKey: 'kidsnote' }),
      scope({ channelAccountId: art09Account }),
      scope({ channelAccountId: foreign.id }),
      scope({ selectionMode: 'automatic' }),
      scope({ extra: true }),
    ]) {
      const refused = await harness.begin(MALL_ORDERS_KIND, bad).expect(400);
      expect(refused.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  it('변환은 본문 operationId로 성공한 실행의 캡처를 다시 변환한다 — 몰 라우트·재생 라우트 모두, 옛 run은 쓰지 않는다', async () => {
    const run = await harness.beginRun(MALL_ORDERS_KIND, scope());
    await harness.put(run, [{ chunkKind: MALL_ORDERS_CHUNK_KIND, payload: [kidkidsOrder('K-1', 2)] }]);
    await harness.finish(run).expect(200);
    const artifact = await prisma.orderCollectionArtifact.findFirstOrThrow({ where: { operationId: run.operation.id } });

    for (const path of ['kidkids/convert', `attempts/${run.operation.id}/convert`]) {
      const converted = await convert(path, run.operation.id).expect(201);
      expect(converted.headers).toMatchObject({
        'x-order-collection-artifact-id': artifact.id,
        'x-order-collection-source-rows': '1',
        'x-order-collection-product-rows': '2',
        'x-order-collection-output-rows': '3',
      });
    }
    await expect(prisma.sourceImportRun.count({ where: { organizationId: ORG } })).resolves.toBe(0);

    const mismatch = await convert('art09/convert', run.operation.id).expect(400);
    expect(mismatch.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'mall_mismatch' } });
    const foreign = await convert('kidkids/convert', run.operation.id, OTHER_ORG).expect(404);
    expect(foreign.body).toMatchObject({ code: 'OPERATION_NOT_FOUND' });
    const pathMismatch = await convert(`attempts/${art09Account}/convert`, run.operation.id).expect(400);
    expect(pathMismatch.body).toMatchObject({ code: 'VALIDATION_FAILED' });

    const running = await harness.beginRun(MALL_ORDERS_KIND, scope());
    expect((await convert('kidkids/convert', running.operation.id).expect(404)).body).toMatchObject({ code: 'OPERATION_NOT_FOUND' });
  });

  it('주문이 없던 실행을 다시 변환하면 파일 없이 0건(204)이다', async () => {
    const run = await harness.beginRun(MALL_ORDERS_KIND, scope());
    await harness.finish(run).expect(200);
    await convert(`attempts/${run.operation.id}/convert`, run.operation.id)
      .expect(204)
      .expect('X-Order-Collection-Output-Rows', '0');
  });

  it('아트공구: order_rows(Cafe24 CSV 행)를 옛 변환 본문 {rows}로 보관하고 같은 셈법으로 주문 수를 적는다', async () => {
    const run = await harness.beginRun(MALL_ORDERS_KIND, scope({ channelAccountId: art09Account, mallKey: 'art09' }));
    expect(run.operation.plan).toMatchObject({ mallKey: 'art09', mallName: '아트공구' });
    const rows = [
      { orderId: '20260926-0000001', productName: '색종이', qty: '2', orderedAt: `${TODAY} 10:00:00` },
      { orderId: '20260926-0000001', productName: '크레파스', qty: '1', orderedAt: `${TODAY} 10:00:00` },
    ];
    await harness.put(run, [{ chunkKind: MALL_ORDERS_CHUNK_KIND, payload: rows }]);
    const finished = await harness.finish(run).expect(200);
    // 아트공구 CSV는 주문마다 택배비 줄이 없어 출력 줄 = 상품 줄 — 셈법(orderCollectionOrderCount)이 0을 낸다(옛 경로와 같다,
    // 파생 보고). 캡처는 있으므로(captured 2) 변환 파일은 나온다.
    expect(finished.body.operation.result).toEqual({ rowCount: 0, mallKey: 'art09', captured: 2 });
    const artifact = await prisma.orderCollectionArtifact.findFirstOrThrow({ where: { operationId: run.operation.id } });
    expect(JSON.parse(Buffer.from(artifact.sourceBytes).toString('utf8'))).toEqual({ rows });
    const converted = await convert('art09/convert', run.operation.id).expect(201);
    expect(converted.headers).toMatchObject({ 'content-type': 'text/csv;charset=utf-8', 'x-order-collection-source-rows': '1', 'x-order-collection-output-rows': '2' });
  });

  it('도매꾹: 나눠 올린 CSV 조각을 이어 파일 캡처(text/csv)로 보관하고 수집일로 거른 행 수를 적는다, 빈 날은 조각 없이 0건', async () => {
    const csv = Buffer.from('orderNo,qty\r\nD-1,1\r\nD-2,2\r\n', 'utf8').toString('base64');
    const run = await harness.beginRun(MALL_ORDERS_KIND, scope({ channelAccountId: domeggookAccount, mallKey: 'domeggook' }));
    await harness.put(run, [
      { chunkKind: MALL_ORDERS_CHUNK_KIND, payload: [{ fileName: 'ORDER_ALL.csv', part: 1, parts: 2, base64: csv.slice(20) }] },
      { chunkKind: MALL_ORDERS_CHUNK_KIND, payload: [{ fileName: 'ORDER_ALL.csv', part: 0, parts: 2, base64: csv.slice(0, 20) }] },
    ]);
    const finished = await harness.finish(run).expect(200);
    expect(finished.body.operation.result).toEqual({ rowCount: 2, mallKey: 'domeggook', captured: 1, coverage: { startDate: TODAY, endDate: TODAY } });
    const artifact = await prisma.orderCollectionArtifact.findFirstOrThrow({ where: { operationId: run.operation.id } });
    expect(artifact).toMatchObject({ sourceFileName: 'ORDER_ALL.csv', sourceContentType: 'text/csv' });
    expect(Buffer.from(artifact.sourceBytes).toString('utf8')).toBe('orderNo,qty\r\nD-1,1\r\nD-2,2\r\n');
    const converted = await convert('domeggook/convert', run.operation.id).expect(201);
    expect(converted.headers['x-order-collection-output-rows']).toBe('2');

    const empty = await harness.beginRun(MALL_ORDERS_KIND, scope({ channelAccountId: domeggookAccount, mallKey: 'domeggook' }));
    expect((await harness.finish(empty).expect(200)).body.operation.result).toEqual({ rowCount: 0, mallKey: 'domeggook', captured: 0, coverage: { startDate: TODAY, endDate: TODAY } });

    const missingPart = await harness.beginRun(MALL_ORDERS_KIND, scope({ channelAccountId: domeggookAccount, mallKey: 'domeggook' }));
    await harness.put(missingPart, [{ chunkKind: MALL_ORDERS_CHUNK_KIND, payload: [{ fileName: 'ORDER_ALL.csv', part: 1, parts: 2, base64: csv }] }]);
    expect((await harness.finish(missingPart).expect(400)).body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'incomplete_file_parts' } });
  });

  it('아이스크림몰: 배송목록 행 + continuation(머리글)을 옛 변환 본문으로 모으고, 자동 선택은 본 행을 빼고 고른 행만 센다', async () => {
    const headers = ['주문번호', '배송번호', '주문완료일시', '주문내역상태', '배송종류', '배송처리유형', '주문판매유형', '합배송여부', '상품번호', '상품명', '단품명', '출고수량', '입점사', '회원ID', '주문자', '수취인', '수취인휴대폰번호', '우편번호', '배송지'];
    const line = (orderNo: string) => [orderNo, `D-${orderNo}`, `${TODAY} 10:00`, '결제완료', '택배', '일반', '일반', 'N', 'P-1', '색종이', '빨강', '1', '키드아이템', 'member', '풍산초', '풍산초', '010-0000-0000', '06000', '서울 강남구'];
    const seen = line('20260926M0001');
    const fresh = line('20260926M0002');
    const seenKey = seen.join('\u001f');
    const run = await harness.beginRun(MALL_ORDERS_KIND, scope({
      channelAccountId: icecreamAccount, mallKey: 'icecream-mall', selectionMode: 'automatic', seenRowKeys: [seenKey],
    }));
    await harness.put(run, [
      { chunkKind: MALL_ORDERS_CHUNK_KIND, payload: [seen, fresh] },
      { chunkKind: 'continuation', payload: [{ headers }] },
    ]);
    const finished = await harness.finish(run).expect(200);
    expect(finished.body.operation.result).toEqual({ rowCount: 1, mallKey: 'icecream-mall', captured: 1 });
    const artifact = await prisma.orderCollectionArtifact.findFirstOrThrow({ where: { operationId: run.operation.id } });
    expect(JSON.parse(Buffer.from(artifact.sourceBytes).toString('utf8'))).toEqual({
      headers,
      rows: [fresh],
      sourceRows: [seen, fresh],
      originalRows: [seen, fresh],
      selectionMode: 'automatic',
      seenRowKeys: [seenKey],
      selectedRows: [fresh],
      selectedRowKeys: [fresh.join('\u001f')],
    });
    await convert('icecream-mall/convert-rows', run.operation.id).expect(201);

    const continuation = await request(harness.httpUrl)
      .get(`/api/orders/collection/attempts/${run.operation.id}/continuation?operationId=${run.operation.id}`)
      .set('x-test-org', ORG)
      .expect(200);
    expect(continuation.body).toEqual({
      mallKey: 'icecream-mall',
      headers,
      originalRows: [seen, fresh],
      selectedRows: [fresh],
      selectedRowKeys: [fresh.join('\u001f')],
      selectionMode: 'automatic',
      sourceRows: 1,
    });

    // 본 행뿐이면 고른 행이 없다 — 0건(옛 NO_NEW_ORDERS), 파일도 없다.
    const nothingNew = await harness.beginRun(MALL_ORDERS_KIND, scope({
      channelAccountId: icecreamAccount, mallKey: 'icecream-mall', selectionMode: 'automatic', seenRowKeys: [seenKey],
    }));
    await harness.put(nothingNew, [
      { chunkKind: MALL_ORDERS_CHUNK_KIND, payload: [seen] },
      { chunkKind: 'continuation', payload: [{ headers }] },
    ]);
    expect((await harness.finish(nothingNew).expect(200)).body.operation.result).toEqual({ rowCount: 0, mallKey: 'icecream-mall', captured: 0 });
  });

  it('continuation은 성공한 아이스크림몰 실행만 — 다른 몰은 VALIDATION_FAILED, 끝나지 않은·다른 조직 실행은 OPERATION_NOT_FOUND', async () => {
    const kidkids = await harness.beginRun(MALL_ORDERS_KIND, scope());
    const read = (id: string, organizationId = ORG) =>
      request(harness.httpUrl).get(`/api/orders/collection/attempts/${id}/continuation?operationId=${id}`).set('x-test-org', organizationId);
    expect((await read(kidkids.operation.id).expect(404)).body).toMatchObject({ code: 'OPERATION_NOT_FOUND' });
    await harness.finish(kidkids).expect(200);
    expect((await read(kidkids.operation.id).expect(400)).body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'continuation_unsupported' } });
    expect((await read(kidkids.operation.id, OTHER_ORG).expect(404)).body).toMatchObject({ code: 'OPERATION_NOT_FOUND' });
  });

  it('도매꾹 확인 범위: 수집일이 있는 성공 실행(빈 날 포함)은 주문 사실 리더의 몰 적용 범위가 된다 — 실패·다른 몰은 아니다', async () => {
    const day = '2026-09-20';
    const empty = await harness.beginRun(MALL_ORDERS_KIND, scope({ channelAccountId: domeggookAccount, mallKey: 'domeggook', collectionDate: day }));
    await harness.finish(empty).expect(200);
    const failed = await harness.beginRun(MALL_ORDERS_KIND, scope({ channelAccountId: domeggookAccount, mallKey: 'domeggook', collectionDate: '2026-09-21' }));
    await harness.finish(failed, { outcome: 'failed', errorCode: 'SITE_LOGIN_REQUIRED' }).expect(200);
    const kidkids = await harness.beginRun(MALL_ORDERS_KIND, scope({ collectionDate: '2026-09-21' }));
    await harness.finish(kidkids).expect(200);

    const facts = await prisma.$transaction((tx) => readOrderWindowFacts(tx, {
      organizationId: ORG,
      from: new Date('2026-09-19T15:00:00.000Z'),
      to: new Date('2026-09-21T15:00:00.000Z'),
    }, accountFacts));
    expect(facts.sourceCoverage).toEqual([expect.objectContaining({
      sourceType: 'order_collection_mall',
      channelAccountId: domeggookAccount,
      mallKey: 'domeggook',
      includedDates: [day],
      missingDates: ['2026-09-21'],
    })]);
    expect(facts.includedDates).toEqual([day]);
  });

  it('오늘 주문 capability는 실행 표(몰 주문·directship의 최신 성공 rowCount)와 옛 run(2차 몰·옛 directship)을 한 수로 센다', async () => {
    // 옛 경로: 2차 몰(onch) 두 번 — 최신 하나만, 옮긴 몰(kidkids)의 옛 run은 실행이 있으면 실행이 이긴다, 옛 directship.
    const oldRun = (mallKey: string | null, sourceType: string, rowCount: number, createdAt: Date) =>
      prisma.sourceImportRun.create({
        data: {
          organizationId: ORG,
          sourceType,
          status: 'completed',
          rowCount,
          createdAt,
          importedAt: createdAt,
          plan: mallKey ? { mallKey } : {},
        },
      });
    const now = Date.now();
    await oldRun('onch', 'order_collection_mall', 9, new Date(now - 60_000 * 30));
    await oldRun('onch', 'order_collection_mall', 5, new Date(now - 60_000 * 10));
    await oldRun('kidkids', 'order_collection_mall', 7, new Date(now - 60_000 * 20));
    await oldRun(null, 'coupang_direct_order_capture', 3, new Date(now - 60_000 * 5));
    await oldRun('onch', 'order_collection_mall', 11, new Date(now - 36 * 60 * 60_000)); // 어제

    const first = await harness.beginRun(MALL_ORDERS_KIND, scope());
    await harness.put(first, [{ chunkKind: MALL_ORDERS_CHUNK_KIND, payload: [kidkidsOrder('K-1')] }]);
    await harness.finish(first).expect(200);
    const latest = await harness.beginRun(MALL_ORDERS_KIND, scope());
    await harness.put(latest, [{ chunkKind: MALL_ORDERS_CHUNK_KIND, payload: [kidkidsOrder('K-1'), kidkidsOrder('K-2')] }]);
    await harness.finish(latest).expect(200);
    const directship = await harness.beginRun(COUPANG_DIRECTSHIP_KIND, { channelAccountId: rocketAccount });
    await harness.finish(directship).expect(200);

    const today = await request(harness.httpUrl).get('/api/orders/collection/today-orders').set('x-test-org', ORG).expect(200);
    // 몰 칸마다 오늘 실행 기록이 있으면 실행이, 없으면 옛 run이 그 몰의 수다(옮긴 날 앞서 옛 경로로 걷은 것을 두 번 세지
    // 않는다). kidkids 7(옛 run)·coupang-direct 3(옛 run)은 실행에 밀린다.
    expect(today.body).toEqual({ total: 2 + 5 + 4, byMall: { kidkids: 2, onch: 5, 'coupang-direct': 4 } });

    const other = await request(harness.httpUrl).get('/api/orders/collection/today-orders').set('x-test-org', OTHER_ORG).expect(200);
    expect(other.body).toEqual({ total: null, byMall: {} });
  });
});
