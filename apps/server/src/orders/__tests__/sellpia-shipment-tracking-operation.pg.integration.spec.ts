import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
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
import { SellpiaShipmentTrackingOperationOwner } from '../adapter/in/operation/sellpia-shipment-tracking-operation-owner';
import { SellpiaShipmentTrackingController } from '../adapter/in/web/sellpia-shipment-tracking.controller';
import { OrderOperationCapturePersistenceAdapter } from '../adapter/out/persistence/order-operation-capture.persistence.adapter';
import { ORDER_OPERATION_CAPTURE_PORT } from '../application/port/in/order-operation-capture.port';

// 확장 수집기(orders.sellpia_shipment_tracking)가 밟는 길을 서버에서 그대로: begin → tracking_rows 청크 → finish.
// 보관 캡처(OrderCollectionArtifact.operationId)는 finish 트랜잭션에서만 쓰인다(ADR-0025).
const DATE = '2026-09-07';

function row(ordNo: string, invNo = `INV-${ordNo}`) {
  return { ordNo, itemNo: '', invNo, courier: '1136', provider: '키드키즈', receiver: '홍길동', post: '06000', addr: '서울 강남구' };
}

describe('orders.sellpia_shipment_tracking owner over the operation contract + disposable PG', () => {
  let prisma: PrismaClient;
  let harness: Awaited<ReturnType<typeof ordersOperationsApp>>;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    harness = await ordersOperationsApp(prisma, {
      owners: [SellpiaShipmentTrackingOperationOwner],
      controllers: [SellpiaShipmentTrackingController],
      providers: [{ provide: ORDER_OPERATION_CAPTURE_PORT, useClass: OrderOperationCapturePersistenceAdapter }],
    });
  });

  afterAll(async () => {
    await harness?.app.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  const scope = (startDate = DATE, endDate = DATE) => ({ startDate, endDate });
  const readSource = (operationId: string, organizationId = ORG) =>
    request(harness.httpUrl).get(`/api/orders/sellpia-shipment-tracking/${operationId}/source`).set('x-test-org', organizationId);

  it('plan은 셀피아 로그인 잠금(resource:sellpia:login)과 조회 기간을 정하고, finish가 캡처를 실행 id로 한 번 보관한다', async () => {
    const run = await harness.beginRun(SELLPIA_SHIPMENT_TRACKING_KIND, scope());
    expect(run.operation.lockKeys).toEqual(['resource:sellpia:login']);
    expect(run.operation.plan).toEqual({ startDate: DATE, endDate: DATE });
    expect(run.operation.window).toEqual({ start: DATE, end: DATE });

    await harness.put(run, [
      { chunkKind: SELLPIA_SHIPMENT_TRACKING_CHUNK_KIND, payload: [row('A-1'), row('A-2')] },
      { chunkKind: SELLPIA_SHIPMENT_TRACKING_CHUNK_KIND, payload: [row('A-3')] },
    ]);
    const finished = await harness.finish(run).expect(200);
    expect(finished.body.operation).toMatchObject({ status: 'succeeded', result: { rowCount: 3 } });

    const artifacts = await prisma.orderCollectionArtifact.findMany({ where: { organizationId: ORG } });
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({ operationId: run.operation.id, sourceImportRunId: null, sourceContentType: 'application/json' });
    expect(JSON.parse(Buffer.from(artifacts[0]!.sourceBytes).toString('utf8'))).toEqual({
      rows: [row('A-1'), row('A-2'), row('A-3')],
      total: 3,
      range: { start: DATE, end: DATE },
      confirmedRange: null,
    });
    await expect(prisma.sourceImportRun.count({ where: { organizationId: ORG } })).resolves.toBe(0);
  });

  it('보관 캡처는 실행 id로 내려받는다 — 다른 조직·끝나지 않은 실행은 OPERATION_NOT_FOUND', async () => {
    const run = await harness.beginRun(SELLPIA_SHIPMENT_TRACKING_KIND, scope());
    await harness.put(run, [{ chunkKind: SELLPIA_SHIPMENT_TRACKING_CHUNK_KIND, payload: [row('B-1')] }]);
    const executing = await readSource(run.operation.id).expect(404);
    expect(executing.body).toMatchObject({ code: 'OPERATION_NOT_FOUND' });
    await harness.finish(run).expect(200);

    const downloaded = await readSource(run.operation.id).expect(200);
    expect(downloaded.headers['cache-control']).toBe('private, no-store');
    expect(downloaded.body).toMatchObject({ rows: [row('B-1')], total: 1, range: { start: DATE, end: DATE } });
    const foreign = await readSource(run.operation.id, OTHER_ORG).expect(404);
    expect(foreign.body).toMatchObject({ code: 'OPERATION_NOT_FOUND' });
  });

  it('빈 조회도 성공이다 — rowCount 0과 빈 캡처를 남긴다', async () => {
    const run = await harness.beginRun(SELLPIA_SHIPMENT_TRACKING_KIND, scope());
    const finished = await harness.finish(run).expect(200);
    expect(finished.body.operation).toMatchObject({ status: 'succeeded', result: { rowCount: 0 } });
    const downloaded = await readSource(run.operation.id).expect(200);
    expect(downloaded.body).toEqual({ rows: [], total: 0, range: { start: DATE, end: DATE }, confirmedRange: null });
  });

  it('실패로 끝난 실행은 캡처를 남기지 않고 잠금을 놓는다', async () => {
    const run = await harness.beginRun(SELLPIA_SHIPMENT_TRACKING_KIND, scope());
    await harness.put(run, [{ chunkKind: SELLPIA_SHIPMENT_TRACKING_CHUNK_KIND, payload: [row('C-1')] }]);
    const failed = await harness.finish(run, { outcome: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '셀피아 로그인이 필요합니다.' }).expect(200);
    expect(failed.body.operation).toMatchObject({ status: 'failed', lockKeys: [] });
    await expect(prisma.orderCollectionArtifact.count({ where: { organizationId: ORG } })).resolves.toBe(0);
    await harness.beginRun(SELLPIA_SHIPMENT_TRACKING_KIND, scope());
  });

  it('형식이 틀린 행·계획 밖 창·모르는 청크는 finalize가 VALIDATION_FAILED로 거절하고 원장에 아무것도 없다', async () => {
    const cases: Array<{ chunks: Array<{ chunkKind: string; payload: unknown[] }>; window?: { start: string; end: string }; reason: string }> = [
      { chunks: [{ chunkKind: SELLPIA_SHIPMENT_TRACKING_CHUNK_KIND, payload: [{ ...row('D-1'), invNo: '' }] }], reason: 'invalid_tracking_rows' },
      { chunks: [{ chunkKind: SELLPIA_SHIPMENT_TRACKING_CHUNK_KIND, payload: [{ ...row('D-1'), extra: 1 }] }], reason: 'invalid_tracking_rows' },
      { chunks: [{ chunkKind: 'order_rows', payload: [row('D-1')] }], reason: 'unexpected_chunk_kind' },
      { chunks: [], window: { start: '2026-09-06', end: DATE }, reason: 'window_outside_plan' },
    ];
    for (const { chunks, window, reason } of cases) {
      const run = await harness.beginRun(SELLPIA_SHIPMENT_TRACKING_KIND, scope());
      await harness.put(run, chunks);
      const refused = await harness.finish(run, { outcome: 'succeeded', ...(window ? { window } : {}) }).expect(400);
      expect(refused.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason } });
      await harness.finish(run, { outcome: 'failed', errorCode: 'VALIDATION_FAILED' }).expect(200);
    }
    await expect(prisma.orderCollectionArtifact.count({ where: { organizationId: ORG } })).resolves.toBe(0);
  });

  it('셀피아 로그인 잠금은 하나다 — 두 번째 셀피아 송장 begin은 OPERATION_IN_PROGRESS', async () => {
    const first = await harness.beginRun(SELLPIA_SHIPMENT_TRACKING_KIND, scope());
    const refused = await harness.begin(SELLPIA_SHIPMENT_TRACKING_KIND, scope('2026-09-01', DATE)).expect(409);
    expect(refused.body).toMatchObject({ code: 'OPERATION_IN_PROGRESS', details: { operationId: first.operation.id } });
  });

  it('scope 검증: 31일을 넘는 기간·뒤집힌 기간·모르는 필드는 VALIDATION_FAILED이고 실행을 만들지 않는다', async () => {
    for (const bad of [
      scope('2026-08-01', '2026-09-01'),
      scope('2026-09-08', DATE),
      { ...scope(), extra: true },
      { startDate: '2026-02-30', endDate: '2026-03-01' },
    ]) {
      const refused = await harness.begin(SELLPIA_SHIPMENT_TRACKING_KIND, bad).expect(400);
      expect(refused.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    await harness.beginRun(SELLPIA_SHIPMENT_TRACKING_KIND, scope('2026-08-02', '2026-09-01'));
  });
});
