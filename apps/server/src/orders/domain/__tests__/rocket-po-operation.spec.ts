import { describe, expect, it } from 'vitest';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import type { CoupangRocketPoPlan, CoupangRocketPoScan } from '@kiditem/shared/orders-operations';
import type { RocketPoCatalogRow } from '@kiditem/shared/rocket-purchase-preview';
import { assertRocketPoVendor, completeRocketPoCollection, readRocketPoChunks } from '../rocket-po-operation';

const OPERATION_ID = 'a1111111-1111-4111-8111-111111111111';
const plan: CoupangRocketPoPlan = {
  channelAccountId: 'c1111111-1111-4111-8111-111111111111',
  from: '2026-09-01',
  to: '2026-09-30',
  status: '',
  dateType: 'WAREHOUSING_PLAN_DATE',
  requireConfirmation: true,
  vendorExpectations: { rocketVendorId: null, sharedCoupangVendorId: null },
};

function row(poNumber: string, line = '1', overrides: Partial<RocketPoCatalogRow> = {}): RocketPoCatalogRow {
  return {
    poLineId: `${poNumber}:P${line}:880000000000${line}:${line}`,
    poNumber,
    vendorId: 'A00123',
    productNo: `P${line}`,
    barcode: `880000000000${line}`,
    productName: '상품',
    orderQty: 2,
    plannedDeliveryDate: '2026-09-10',
    confirmation: {
      center: '동탄1', inboundType: '쉽먼트', poStatus: '발주확정', returnManager: '담당', returnContact: '010', returnAddress: '주소',
      purchasePrice: 900, supplyPrice: 900, vat: 90, totalPurchase: 990, poRegisteredAt: '2026-09-01 10:00:00', xdock: 'N',
    },
    ...overrides,
  };
}

function scan(overrides: Partial<CoupangRocketPoScan> = {}): CoupangRocketPoScan {
  return {
    vendorId: 'A00123',
    listPagesRead: 1,
    totalListPages: 1,
    detailPoCount: 2,
    proof: { from: plan.from, to: plan.to, status: '', dateType: 'WAREHOUSING_PLAN_DATE', validatedList: true },
    ...overrides,
  };
}

const chunk = (chunkKind: string, payload: unknown[]) => ({ chunkKind, sequence: 1, payload, checksum: 'x', itemCount: payload.length }) as OperationStagedChunk;
const refusal = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error as { code: string; details: { reason: string } };
  }
  throw new Error('expected a refusal');
};

describe('로켓 PO finalize 규칙(옛 완료 검증과 같다)', () => {
  it('발주서 항목을 행으로 펴고, 증거는 실행 ID를 수집 ID로 삼아 행 ID 순으로 돌려준다', () => {
    const { rows, scan: evidence } = readRocketPoChunks([
      chunk('po_rows', [{ poNumber: '200', rows: [row('200')] }, { poNumber: '100', rows: [row('100', '1'), row('100', '2')] }]),
      chunk('po_scan', [scan()]),
    ]);
    const complete = completeRocketPoCollection({ plan, rows, scan: evidence, operationId: OPERATION_ID });
    expect(complete.rows.map((item) => item.poLineId)).toEqual([row('100', '1').poLineId, row('100', '2').poLineId, row('200').poLineId]);
    expect(complete.collection).toEqual({
      collectionRunId: OPERATION_ID, vendorId: 'A00123', listPagesRead: 1, totalListPages: 1, truncated: false, detailPoCount: 2, failedPoNumbers: [],
    });
  });

  it('빈 발주 목록은 목록 1쪽을 읽었다는 증거로 완결이다', () => {
    const complete = completeRocketPoCollection({ plan, rows: [], scan: scan({ vendorId: '', detailPoCount: 0 }), operationId: OPERATION_ID });
    expect(complete.rows).toEqual([]);
  });

  it('목록을 다 읽지 않았거나 상세 수·공급자·확정 정보가 맞지 않으면 rocket_po_collection_incomplete', () => {
    const rows = [row('100'), row('200')];
    for (const [evidence, candidateRows] of [
      [scan({ listPagesRead: 1, totalListPages: 2 }), rows],
      [scan({ listPagesRead: 0, totalListPages: 0 }), rows],
      [scan({ detailPoCount: 3 }), rows],
      [scan(), [row('100'), row('200', '1', { vendorId: 'OTHER' })]],
      [scan({ vendorId: '' }), rows],
      [scan(), [row('100'), row('200', '1', { barcode: '' })]],
      [scan(), [row('100'), row('200', '1', { confirmation: undefined })]],
      [scan({ detailPoCount: 1 }), [row('100'), row('100')]],
    ] as const) {
      expect(refusal(() => completeRocketPoCollection({ plan, rows: candidateRows, scan: evidence, operationId: OPERATION_ID })))
        .toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'rocket_po_collection_incomplete' } });
    }
    expect(completeRocketPoCollection({ plan: { ...plan, requireConfirmation: false }, rows: [row('100'), row('200', '1', { confirmation: undefined })], scan: scan(), operationId: OPERATION_ID }).rows).toHaveLength(2);
  });

  it('증거의 기간·상태·날짜 기준이 plan과 다르면 rocket_po_plan_mismatch', () => {
    expect(refusal(() => completeRocketPoCollection({ plan, rows: [], scan: scan({ proof: { ...scan().proof, to: '2026-10-01' }, detailPoCount: 0 }), operationId: OPERATION_ID })))
      .toMatchObject({ details: { reason: 'rocket_po_plan_mismatch' } });
  });

  it('청크: 모르는 종류·증거 없음·같은 발주서 두 번·발주서 번호가 다른 행은 거절', () => {
    expect(refusal(() => readRocketPoChunks([chunk('shipment_dates', [])]))).toMatchObject({ details: { reason: 'unknown_chunk_kind' } });
    expect(refusal(() => readRocketPoChunks([chunk('po_rows', [{ poNumber: '100', rows: [row('100')] }])]))).toMatchObject({ details: { reason: 'rocket_po_collection_incomplete' } });
    expect(refusal(() => readRocketPoChunks([
      chunk('po_rows', [{ poNumber: '100', rows: [row('100')] }, { poNumber: '100', rows: [row('100', '2')] }]),
      chunk('po_scan', [scan()]),
    ]))).toMatchObject({ details: { reason: 'rocket_po_collection_incomplete' } });
    expect(refusal(() => readRocketPoChunks([chunk('po_rows', [{ poNumber: '100', rows: [row('200')] }]), chunk('po_scan', [scan()])])))
      .toMatchObject({ details: { reason: 'rocket_po_collection_incomplete' } });
    expect(refusal(() => readRocketPoChunks([chunk('po_rows', [{ poNumber: '100', rows: [] }]), chunk('po_scan', [scan()])])))
      .toMatchObject({ details: { reason: 'invalid_chunk_item' } });
  });

  it('고정한 공급자 기대값이 계정·수집 공급자와 다르면 rocket_po_vendor_mismatch', () => {
    const base = { expectations: { rocketVendorId: 'A00123', sharedCoupangVendorId: null }, account: { vendorId: 'A00123', sharedVendorId: null }, collectedVendorId: 'A00123', rowCount: 1 };
    expect(() => assertRocketPoVendor(base)).not.toThrow();
    expect(refusal(() => assertRocketPoVendor({ ...base, account: { vendorId: 'B', sharedVendorId: null } }))).toMatchObject({ details: { reason: 'rocket_po_vendor_mismatch' } });
    expect(refusal(() => assertRocketPoVendor({ ...base, collectedVendorId: 'B' }))).toMatchObject({ details: { reason: 'rocket_po_vendor_mismatch' } });
    expect(() => assertRocketPoVendor({ ...base, collectedVendorId: '', rowCount: 0 })).not.toThrow();
  });
});
