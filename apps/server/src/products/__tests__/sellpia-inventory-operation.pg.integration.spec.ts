import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { operationFailureAlerts } from '../../test-helpers/operation-failure-alerts';
import { SELLPIA_SHIPMENT_TRACKING_KIND } from '@kiditem/shared/orders-operations';
import { SELLPIA_INVENTORY_CHUNK_KIND, SELLPIA_INVENTORY_KIND } from '@kiditem/shared/sellpia-operations';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID as OTHER_ORG,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';
import { ordersOperationsApp } from '../../test-helpers/orders-operations';
import { SellpiaShipmentTrackingOperationOwner } from '../../orders/adapter/in/operation/sellpia-shipment-tracking-operation-owner';
import { OrderOperationCapturePersistenceAdapter } from '../../orders/adapter/out/persistence/order-operation-capture.persistence.adapter';
import { ORDER_OPERATION_CAPTURE_PORT } from '../../orders/application/port/in/order-operation-capture.port';
import { sellpiaInventoryOperationProviders } from '../product-source.module';
import { SellpiaInventoryOperationOwner } from '../adapter/in/operation/sellpia-inventory-operation-owner';

// 확장 수집기(products.sellpia_inventory)가 밟는 길을 서버에서 그대로: begin → inventory_rows 청크 → finish.
// MasterProduct 발행과 SellpiaInventoryState(lastCompletedOperationId·세대)는 finish 트랜잭션에서만 쓰인다(ADR-0025).

type Row = {
  productCode: string;
  optionCode: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number;
  purchasePrice: number | null;
  salePrice: number | null;
};

function row(productCode: string, optionCode: string, overrides: Partial<Row> = {}): Row {
  return {
    productCode,
    optionCode,
    name: `상품 ${productCode}`,
    optionName: optionCode ? `옵션 ${optionCode}` : null,
    barcode: `88${productCode.replace(/\D/g, '').padStart(11, '0')}`,
    currentStock: 5,
    purchasePrice: 1_000,
    salePrice: 2_000,
    ...overrides,
  };
}

const header = (rowCount: number) => ({ source: 'sellpia_product_search', version: 1, rowCount });

describe('products.sellpia_inventory owner over the operation contract + disposable PG', () => {
  let prisma: PrismaClient;
  let harness: Awaited<ReturnType<typeof ordersOperationsApp>>;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    harness = await ordersOperationsApp(prisma, {
      owners: [SellpiaInventoryOperationOwner, SellpiaShipmentTrackingOperationOwner],
      providers: [
        ...sellpiaInventoryOperationProviders,
        { provide: ORDER_OPERATION_CAPTURE_PORT, useClass: OrderOperationCapturePersistenceAdapter },
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
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: ORG,
        sourceOrigin: 'https://kiditem.sellpia.com',
        sourceAccountKey: 'kiditem',
        freshnessFence: randomUUID(),
      },
    });
  });

  const products = () => prisma.masterProduct.findMany({
    where: { organizationId: ORG },
    orderBy: [{ sourceProductCode: 'asc' }, { sourceOptionCode: 'asc' }],
    select: { code: true, sourceProductCode: true, sourceOptionCode: true, name: true, currentStock: true, purchasePrice: true },
  });
  const state = () => prisma.sellpiaInventoryState.findUniqueOrThrow({ where: { organizationId: ORG } });

  async function collect(rows: Row[], chunkSize = 2) {
    const run = await harness.beginRun(SELLPIA_INVENTORY_KIND, {});
    const items: unknown[] = [header(rows.length), ...rows];
    const chunks = [];
    for (let index = 0; index < items.length; index += chunkSize) {
      chunks.push({ chunkKind: SELLPIA_INVENTORY_CHUNK_KIND, payload: items.slice(index, index + chunkSize) });
    }
    await harness.put(run, chunks);
    return { run, finished: await harness.finish(run) };
  }

  it('plan은 셀피아 로그인 잠금을 잡고, finish가 청크를 이어 MasterProduct를 한 번 발행하고 상태에 실행 id·세대를 적는다', async () => {
    const { run, finished } = await collect([row('P-1', 'RED'), row('P-2', 'BLUE', { purchasePrice: null }), row('P-3', '')]);
    expect(run.operation.lockKeys).toEqual(['resource:sellpia:login']);
    expect(run.operation.plan).toEqual({
      parserVersion: 'sellpia-inventory-v1',
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem',
      trigger: null,
    });
    expect(finished.status).toBe(200);
    expect(finished.body.operation).toMatchObject({ status: 'succeeded', result: { rows: 3, products: 3 } });

    await expect(products()).resolves.toEqual([
      expect.objectContaining({ code: expect.stringMatching(/^KID\d{8}$/), sourceProductCode: 'P-1', sourceOptionCode: 'RED', currentStock: 5, purchasePrice: 1_000 }),
      expect.objectContaining({ sourceProductCode: 'P-2', sourceOptionCode: 'BLUE', purchasePrice: null }),
      expect.objectContaining({ sourceProductCode: 'P-3', sourceOptionCode: '' }),
    ]);
    await expect(state()).resolves.toMatchObject({
      lastCompletedOperationId: run.operation.id,
      lastCompletedImportRunId: null,
      verifiedGeneration: 1n,
      requestedGeneration: 1n,
      activeGeneration: null,
      failedGeneration: null,
      activeSyncToken: null,
      lastVerifiedAt: expect.any(Date),
    });
    await expect(prisma.sourceImportRun.count({ where: { organizationId: ORG } })).resolves.toBe(0);
  });

  it('다음 수집은 빠진 상품의 재고를 0으로 두고(상품은 남는다) 세대를 하나 올린다', async () => {
    const first = await collect([row('P-1', 'RED'), row('P-2', 'BLUE')]);
    const before = await products();
    const second = await collect([row('P-2', 'BLUE', { name: '바뀐 이름', currentStock: 9 })]);
    expect(second.finished.body.operation).toMatchObject({ status: 'succeeded', result: { rows: 1, products: 2 } });

    const after = await products();
    expect(after).toEqual([
      expect.objectContaining({ sourceProductCode: 'P-1', currentStock: 0, code: before[0]!.code }),
      expect.objectContaining({ sourceProductCode: 'P-2', name: '바뀐 이름', currentStock: 9, code: before[1]!.code }),
    ]);
    await expect(state()).resolves.toMatchObject({
      lastCompletedOperationId: second.run.operation.id,
      verifiedGeneration: 2n,
      requestedGeneration: 2n,
    });
    expect(second.run.operation.id).not.toBe(first.run.operation.id);
  });

  it('옛 attempt가 남긴 요청 세대는 이 실행이 완료하고, 옛 실행·실패 세대와 임대는 지운다', async () => {
    await prisma.sellpiaInventoryState.update({
      where: { organizationId: ORG },
      data: { requestedGeneration: 4n, verifiedGeneration: 2n, activeGeneration: 4n, failedGeneration: 3n, activeSyncToken: randomUUID() },
    });
    await collect([row('P-1', 'RED')]);
    await expect(state()).resolves.toMatchObject({
      verifiedGeneration: 4n,
      requestedGeneration: 4n,
      activeGeneration: null,
      failedGeneration: null,
      activeSyncToken: null,
    });
  });

  it('실패로 끝난 실행은 상품·상태를 바꾸지 않고 잠금을 놓는다 — 실패는 실행 표에만 남아 알림 reader가 보인다', async () => {
    await collect([row('P-1', 'RED')]);
    const before = await state();
    const run = await harness.beginRun(SELLPIA_INVENTORY_KIND, {});
    await harness.put(run, [{ chunkKind: SELLPIA_INVENTORY_CHUNK_KIND, payload: [header(1), row('P-1', 'RED', { currentStock: 99 })] }]);
    const failed = await harness.finish(run, { outcome: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '셀피아 로그인이 필요합니다.' }).expect(200);
    expect(failed.body.operation).toMatchObject({ status: 'failed', lockKeys: [] });
    await expect(products()).resolves.toEqual([expect.objectContaining({ currentStock: 5 })]);
    await expect(state()).resolves.toMatchObject({ lastCompletedOperationId: before.lastCompletedOperationId, verifiedGeneration: 1n });
    await expect(operationFailureAlerts(prisma, ORG)).resolves.toMatchObject({
      rows: 0,
      items: [{ type: 'operation_failure', attemptId: run.operation.id, status: 'OPEN', sourceType: SELLPIA_INVENTORY_KIND, href: '/product-hub' }],
    });
    await harness.beginRun(SELLPIA_INVENTORY_KIND, {});
  });

  it('머리 없음·줄 수 불일치·틀린 줄·중복 줄·모르는 청크는 VALIDATION_FAILED이고 원장에 아무것도 없다', async () => {
    const cases: Array<{ payload: unknown[]; chunkKind?: string; reason: string }> = [
      { payload: [row('P-1', 'RED')], reason: 'missing_header' },
      { payload: [header(2), row('P-1', 'RED')], reason: 'row_count_mismatch' },
      { payload: [header(1), { ...row('P-1', 'RED'), currentStock: -1 }], reason: 'invalid_inventory_rows' },
      { payload: [header(2), row('P-1', 'RED'), row('P-1', 'RED')], reason: 'invalid_snapshot' },
      { payload: [header(1), row('P-1', 'RED')], chunkKind: 'sales_rows', reason: 'unexpected_chunk_kind' },
    ];
    for (const { payload, chunkKind, reason } of cases) {
      const run = await harness.beginRun(SELLPIA_INVENTORY_KIND, {});
      await harness.put(run, [{ chunkKind: chunkKind ?? SELLPIA_INVENTORY_CHUNK_KIND, payload }]);
      const refused = await harness.finish(run).expect(400);
      expect(refused.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason } });
      await harness.finish(run, { outcome: 'failed', errorCode: 'VALIDATION_FAILED' }).expect(200);
    }
    await expect(prisma.masterProduct.count({ where: { organizationId: ORG } })).resolves.toBe(0);
    await expect(state()).resolves.toMatchObject({ lastCompletedOperationId: null, verifiedGeneration: 0n });
  });

  it('셀피아 로그인 잠금은 하나다 — 재고가 도는 동안 두 번째 재고·셀피아 송장 begin은 OPERATION_IN_PROGRESS', async () => {
    const first = await harness.beginRun(SELLPIA_INVENTORY_KIND, {});
    const again = await harness.begin(SELLPIA_INVENTORY_KIND, {}).expect(409);
    expect(again.body).toMatchObject({ code: 'OPERATION_IN_PROGRESS', details: { operationId: first.operation.id } });
    const tracking = await harness.begin(SELLPIA_SHIPMENT_TRACKING_KIND, { startDate: '2026-09-07', endDate: '2026-09-07' }).expect(409);
    expect(tracking.body).toMatchObject({ code: 'OPERATION_IN_PROGRESS', details: { operationId: first.operation.id } });
  });

  it('셀피아 계정 연결을 확인하지 않은 조직은 시작하지 못한다(실행을 만들지 않는다)', async () => {
    await prisma.sellpiaInventoryState.update({ where: { organizationId: ORG }, data: { sourceAccountKey: null } });
    const refused = await harness.begin(SELLPIA_INVENTORY_KIND, {}).expect(422);
    expect(refused.body).toMatchObject({ code: 'PRODUCTS_SELLPIA_BINDING_REQUIRED' });
    const other = await harness.begin(SELLPIA_INVENTORY_KIND, {}, OTHER_ORG).expect(422);
    expect(other.body).toMatchObject({ code: 'PRODUCTS_SELLPIA_BINDING_REQUIRED' });
    await expect(prisma.operation.count()).resolves.toBe(0);
  });

  it('scope 검증: 모르는 필드·모르는 계기는 VALIDATION_FAILED, 계기는 plan에 남는다', async () => {
    for (const bad of [{ scope: 'inventory' }, { trigger: 'ttl_expired' }]) {
      const refused = await harness.begin(SELLPIA_INVENTORY_KIND, bad).expect(400);
      expect(refused.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    const run = await harness.beginRun(SELLPIA_INVENTORY_KIND, { trigger: 'retry' });
    expect(run.operation.plan).toMatchObject({ trigger: 'retry' });
  });
});
