import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OPERATION_TOKEN_HEADER, OperationBeginResponseSchema, type OperationBeginResponse } from '@kiditem/shared/operation';
import {
  COUPANG_SHIPMENT_SUMMARY_CHUNK_KIND,
  COUPANG_SHIPMENT_SUMMARY_KIND,
  COUPANG_SHIPMENT_SUMMARY_SCAN_CHUNK_KIND,
  type CoupangShipmentDateItem,
  type CoupangShipmentScan,
} from '@kiditem/shared/orders-operations';
import { makeTestPrisma, OTHER_ORGANIZATION_ID, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG, TEST_USER_ID as USER } from '../../test-helpers/real-prisma';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { OperationsController } from '../../common/operation/adapter/in/web/operations.controller';
import { OperationRepositoryAdapter } from '../../common/operation/adapter/out/repository/operation.repository.adapter';
import { OPERATION_PORT } from '../../common/operation/application/port/in/operation.port';
import { OPERATION_REPOSITORY } from '../../common/operation/application/port/out/repository/operation.repository.port';
import { OperationOwnerRegistry } from '../../common/operation/application/service/operation-owner.registry';
import { OperationService } from '../../common/operation/application/service/operation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ShipmentsModule } from '../shipments.module';

// 확장 수집기(orders.coupang_shipment_summary)가 밟는 길을 서버에서 그대로: begin → shipment_dates 청크 →
// shipment_scan 증거 → finish. 발송일 원장은 finish 트랜잭션에서만 쓰인다(ADR-0025).
const checksum = (payload: unknown[]) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');
const row = (date: string, count: number, boxes = count): CoupangShipmentDateItem => ({ date, count, boxes });

/** 한 쪽(10행 미만)에서 멈춘 수집의 증거. */
function shortScan(totalRows: number, maxPages = 40): CoupangShipmentScan {
  return { maxPages, scannedPages: 1, totalRows, stopReason: 'short_page', lastPageRowCount: totalRows, pageRowCounts: [totalRows], validatedTable: true };
}
const EMPTY_SCAN: CoupangShipmentScan = { maxPages: 40, scannedPages: 1, totalRows: 0, stopReason: 'empty_page', lastPageRowCount: 0, pageRowCounts: [0], validatedTable: true };

describe('orders.coupang_shipment_summary owner over the operation contract + disposable PG', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule, ShipmentsModule],
      controllers: [OperationsController],
      providers: [
        OperationOwnerRegistry,
        OperationService,
        { provide: OPERATION_PORT, useExisting: OperationService },
        { provide: OPERATION_REPOSITORY, useValue: new OperationRepositoryAdapter(prisma as never) },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use((req: { headers: Record<string, string>; authUser?: unknown }, _res: unknown, next: () => void) => {
      req.authUser = { id: USER, organizationId: req.headers['x-test-organization'] ?? ORG };
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
  });

  async function beginRun(scope: Record<string, unknown> = {}): Promise<OperationBeginResponse> {
    const response = await request(httpUrl).post('/api/operations').send({ kind: COUPANG_SHIPMENT_SUMMARY_KIND, scope }).expect(201);
    return OperationBeginResponseSchema.parse(response.body);
  }

  async function put(run: OperationBeginResponse, chunkKind: string, sequence: number, payload: unknown[]) {
    await request(httpUrl)
      .put(`/api/operations/${run.operation.id}/chunks/${chunkKind}/${sequence}`)
      .set(OPERATION_TOKEN_HEADER, run.token)
      .send({ checksum: checksum(payload), payload })
      .expect(200);
  }

  function finish(run: OperationBeginResponse, body: Record<string, unknown> = { outcome: 'succeeded' }) {
    return request(httpUrl).post(`/api/operations/${run.operation.id}/finish`).set(OPERATION_TOKEN_HEADER, run.token).send(body);
  }

  /** 확장 수집기의 순서: 발송일 항목 청크 → 증거 하나 → finish. */
  async function collect(dates: CoupangShipmentDateItem[], scan: CoupangShipmentScan, scope: Record<string, unknown> = {}) {
    const run = await beginRun(scope);
    if (dates.length > 0) await put(run, COUPANG_SHIPMENT_SUMMARY_CHUNK_KIND, 1, dates);
    await put(run, COUPANG_SHIPMENT_SUMMARY_SCAN_CHUNK_KIND, 1, [scan]);
    return run;
  }

  const calendar = async (organizationId = ORG) =>
    (await request(httpUrl).get('/api/coupang-shipments/date-summary').set('x-test-organization', organizationId).expect(200)).body.items;

  it('plan은 조직 잠금과 쪽 상한(기본 40)을 정하고, finish가 그 실행의 발송일 행을 쓴다 — 달력은 발송일마다 최근 성공 실행 값, 기준 행은 미검증', async () => {
    await prisma.coupangShipmentDateSummary.create({
      data: { organizationId: ORG, shipmentDate: '2026-08-01', count: 8, boxes: 9, capturedAt: new Date('2026-08-02T00:00:00Z') },
    });
    const first = await collect([row('2026-09-01', 5), row('2026-09-02', 3)], shortScan(8));
    expect(first.operation).toMatchObject({ lockKeys: ['org'], plan: { maxPages: 40 } });
    const done = await finish(first).expect(200);
    expect(done.body.operation).toMatchObject({ status: 'succeeded', lockKeys: [], result: { dates: 2, rows: 8 } });

    const second = await collect([row('2026-09-02', 2)], shortScan(2));
    await finish(second).expect(200);

    const rows = await prisma.coupangShipmentDateSummary.findMany({ where: { organizationId: ORG, operationId: { not: null } } });
    expect(rows).toHaveLength(3);
    expect(rows.every((item) => item.sourceImportRunId === null)).toBe(true);
    expect(await calendar()).toMatchObject([
      { date: '2026-09-02', count: 2, boxes: 2, verified: true },
      { date: '2026-09-01', count: 5, boxes: 5, verified: true },
      { date: '2026-08-01', count: null, boxes: null, verified: false },
    ]);
    await expect(prisma.sourceImportRun.count({ where: { organizationId: ORG } })).resolves.toBe(0);
  });

  it('쪽 상한 scope를 plan에 싣고, 증거가 plan과 어긋나면 finalize가 VALIDATION_FAILED — failed로 끝난 실행은 원장에 아무것도 남기지 않는다', async () => {
    const run = await collect([row('2026-09-01', 3)], shortScan(3, 40), { maxPages: 5 });
    expect(run.operation.plan).toEqual({ maxPages: 5 });
    const refused = await finish(run).expect(400);
    expect(refused.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'shipment_summary_evidence_invalid' } });
    const failed = await finish(run, { outcome: 'failed', errorCode: 'VALIDATION_FAILED' }).expect(200);
    expect(failed.body.operation).toMatchObject({ status: 'failed', lockKeys: [] });
    await expect(prisma.coupangShipmentDateSummary.count({ where: { organizationId: ORG } })).resolves.toBe(0);

    await request(httpUrl).post('/api/operations').send({ kind: COUPANG_SHIPMENT_SUMMARY_KIND, scope: { maxPages: 61 } }).expect(400);
  });

  it('조회가 도는 동안 같은 조직의 새 조회는 OPERATION_IN_PROGRESS로 거절되고, 끝나면 곧바로 다시 받는다', async () => {
    const running = await beginRun();
    const refused = await request(httpUrl).post('/api/operations').send({ kind: COUPANG_SHIPMENT_SUMMARY_KIND, scope: {} }).expect(409);
    expect(refused.body).toMatchObject({ code: 'OPERATION_IN_PROGRESS', details: { operationId: running.operation.id } });
    await request(httpUrl).post(`/api/operations/${running.operation.id}/cancel`).expect(200);
    await beginRun();
  });

  it('첫 쪽이 빈 조회는 성공이지만 발송일을 쓰지 않고 달력은 그대로다; 다른 조직의 달력과 섞이지 않는다', async () => {
    const first = await collect([row('2026-09-01', 5)], shortScan(5));
    await finish(first).expect(200);
    const before = await calendar();
    const empty = await collect([], EMPTY_SCAN);
    const done = await finish(empty).expect(200);
    expect(done.body.operation.result).toEqual({ dates: 0, rows: 0 });
    expect(await calendar()).toEqual(before);
    expect(await calendar(OTHER_ORGANIZATION_ID)).toEqual([]);
  });

  it('옛 attempt run 행은 달력이 읽지 않는다(옛 행은 옮기지 않는다)', async () => {
    const run = await prisma.sourceImportRun.create({
      data: { organizationId: ORG, sourceType: 'coupang_shipment_summary', status: 'completed', parserVersion: 'shipment-summary-v1', freshnessGeneration: 1n },
    });
    await prisma.coupangShipmentDateSummary.create({
      data: { organizationId: ORG, sourceImportRunId: run.id, shipmentDate: '2026-07-01', count: 4, boxes: 4 },
    });
    expect(await calendar()).toEqual([]);
  });
});
