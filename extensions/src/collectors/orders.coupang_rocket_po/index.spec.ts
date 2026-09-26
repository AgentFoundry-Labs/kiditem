import { describe, expect, it } from 'vitest';
import type { CoupangRocketPoPlan } from '@kiditem/shared/orders-operations';
import type { CollectedChunk } from '../collector';
import { ROCKET_PO_COLLECTION_INCOMPLETE, coupangRocketPoCollector, type SupplierPoSite, type SupplierTable } from './index';

// 기록한 supplier 응답(옛 order-collector-rocket-sales-contract 테스트의 목록·상세).
const plan: CoupangRocketPoPlan = {
  channelAccountId: '11111111-1111-4111-8111-111111111111',
  from: '2026-07-01',
  to: '2026-07-07',
  status: 'PA',
  dateType: 'PURCHASE_ORDER_DATE',
  requireConfirmation: true,
  vendorExpectations: { rocketVendorId: null, sharedCoupangVendorId: null },
};

function listPo(overrides: Record<string, unknown> = {}) {
  return {
    purchaseOrderSeq: 123,
    purchaseOrderStatus: 'PA',
    purchaseOrderStatusDescription: '발주확정',
    centerName: '센터',
    transportTypeDescription: '밀크런',
    vendorId: 'A00123',
    expectedDeliveryDate: '2026-07-08T00:00:00.000Z',
    createdAt: '2026-07-02T00:00:00.000Z',
    skuCount: 1,
    sumOfOrderQty: 2,
    sumOfOrderAmount: 990,
    ...overrides,
  };
}
const cell = (text: string, rowSpan = 1) => ({ text, rowSpan, header: false });
const table = (text: string, rows: Array<Array<ReturnType<typeof cell>>>): SupplierTable => ({ text, rows: rows.map((cells) => ({ section: 'tbody', cells })) });
const values = (items: string[]) => items.map((text) => cell(text));
const RETURN_TABLE = table('회송 담당자 회송지', [[], values(['담당자', '010-0000-0000', '서울'])]);
const ONE_SKU = table('상품 번호 발주금액', [values(['1', 'P-1', '12345678 상품명', '', '2', '', '1000', '900', '90', '990'])]);

function fakeSite(pages: Array<{ rows: unknown[]; lastPageNumber: unknown }>, details: (po: string, attempt: number) => SupplierTable[]) {
  const listCalls: Array<[Record<string, unknown>, number]> = [];
  const detailCalls: string[] = [];
  let closed = 0;
  const site: SupplierPoSite = {
    async purchaseOrderListPage(query, pageNumber) {
      listCalls.push([query as unknown as Record<string, unknown>, pageNumber]);
      return pages[pageNumber - 1] ?? { rows: [], lastPageNumber: pages.length };
    },
    async purchaseOrderDetail(poNumber) {
      detailCalls.push(poNumber);
      return details(poNumber, detailCalls.filter((po) => po === poNumber).length);
    },
    async close() {
      closed += 1;
    },
  };
  return { site, listCalls, detailCalls, closed: () => closed };
}

async function run(site: SupplierPoSite, input: CoupangRocketPoPlan = plan) {
  const chunks: CollectedChunk[] = [];
  for await (const chunk of coupangRocketPoCollector.collect(input, site, { signal: new AbortController().signal, tabId: 1, report: async () => undefined })) chunks.push(chunk);
  return chunks;
}

describe('orders.coupang_rocket_po 수집기(옛 rocket-po-collection.js와 같은 규칙)', () => {
  it('요청한 조건으로 목록을 읽고, 상세를 확정 정보가 붙은 SKU 행으로 만들어 발주서 항목과 목록 증거를 올린다', async () => {
    const fake = fakeSite([{ rows: [listPo()], lastPageNumber: 1 }], () => [RETURN_TABLE, ONE_SKU]);
    const chunks = await run(fake.site);
    expect(fake.listCalls).toEqual([[{ searchDateType: 'PURCHASE_ORDER_DATE', from: '2026-07-01', to: '2026-07-07', status: 'PA' }, 1]]);
    expect(chunks.map((chunk) => chunk.chunkKind)).toEqual(['po_rows', 'po_scan']);
    expect(chunks[0]!.payload).toEqual([{
      poNumber: '123',
      rows: [{
        poLineId: '123:P-1:12345678:1',
        poNumber: '123',
        vendorId: 'A00123',
        productNo: 'P-1',
        barcode: '12345678',
        productName: '상품명',
        orderQty: 2,
        plannedDeliveryDate: '2026-07-08',
        poStatusCode: 'PA',
        businessDateBasis: 'ordered_at',
        confirmation: {
          center: '센터', inboundType: '밀크런', poStatus: '발주확정', returnManager: '담당자', returnContact: '010-0000-0000', returnAddress: '서울',
          purchasePrice: 1000, supplyPrice: 900, vat: 90, totalPurchase: 990, poRegisteredAt: '2026-07-02 00:00:00', xdock: 'N',
        },
      }],
    }]);
    expect(chunks[1]!.payload).toEqual([{
      vendorId: 'A00123', listPagesRead: 1, totalListPages: 1, detailPoCount: 1,
      proof: { from: '2026-07-01', to: '2026-07-07', status: 'PA', dateType: 'PURCHASE_ORDER_DATE', validatedList: true },
    }]);
    expect(fake.closed()).toBe(1);
  });

  it('첫 칸 rowspan이 이어지는 행의 주인을 정한다(숫자로 시작하는 이어진 행을 SKU로 읽지 않는다)', async () => {
    const skuRow = (line: number, productNo: string, text: string, qty: number, total: number, rowSpan: number) =>
      [cell(String(line), rowSpan), ...values([productNo, text, '', String(qty), '', String(total), String(total - 90), '90', String(total), '', '', ''])];
    const sku = table('상품 번호 발주금액', [
      skuRow(1, 'P-1', '8801234567890 상품1', 2, 990, 2),
      values(['0', '', '0', '0', '0']),
      skuRow(2, 'P-2', '8801234567891 상품2', 3, 500, 2),
      values(['1', '', '100', '90', '10']),
      [cell('합계', 2), ...values(['', '', '', '5', '', '', '1490'])],
      values(['0', '', '0', '0']),
    ]);
    const fake = fakeSite([{ rows: [listPo({ purchaseOrderStatus: 'RP', skuCount: 2, sumOfOrderQty: 5, sumOfOrderAmount: 1490 })], lastPageNumber: 1 }], () => [sku]);
    const chunks = await run(fake.site, { ...plan, status: 'RP', dateType: 'WAREHOUSING_PLAN_DATE' });
    const rows = (chunks[0]!.payload[0] as { rows: Array<{ productNo: string; orderQty: number; businessDateBasis: string }> }).rows;
    expect(rows.map((item) => [item.productNo, item.orderQty, item.businessDateBasis])).toEqual([['P-1', 2, 'expected_inbound'], ['P-2', 3, 'expected_inbound']]);
  });

  it('칸이 모자라거나 상품번호·수량이 없는 SKU 행은 부분 행 없이 실패한다', async () => {
    for (const cells of [
      ['1', 'P-1', '8801234567890 상품명'],
      ['1', '', '8801234567890 상품명', '', '2', '', '1000', '900', '90', '990'],
      ['1', 'P-1', '8801234567890 상품명', '', '', '', '1000', '900', '90', '990'],
    ]) {
      const fake = fakeSite([{ rows: [listPo()], lastPageNumber: 1 }], () => [table('상품 번호 발주금액', [values(cells)])]);
      await expect(run(fake.site)).rejects.toMatchObject({ code: ROCKET_PO_COLLECTION_INCOMPLETE });
      expect(fake.closed()).toBe(1);
    }
  });

  it('빈 목록은 상세 없이 1쪽 증거만 올린다', async () => {
    const fake = fakeSite([{ rows: [], lastPageNumber: 1 }], () => []);
    const chunks = await run(fake.site, { ...plan, status: '' });
    expect(chunks.map((chunk) => chunk.chunkKind)).toEqual(['po_scan']);
    expect(chunks[0]!.payload[0]).toMatchObject({ vendorId: '', listPagesRead: 1, totalListPages: 1, detailPoCount: 0 });
    expect(fake.detailCalls).toEqual([]);
  });

  it('목록 합계가 없거나 공급자가 섞이거나 같은 발주서가 두 번 오거나 쪽 수가 바뀌면 상세 전에 실패한다', async () => {
    for (const pages of [
      [{ rows: [listPo({ skuCount: undefined })], lastPageNumber: 1 }],
      [{ rows: [listPo(), listPo({ purchaseOrderSeq: 124, vendorId: 'B' })], lastPageNumber: 1 }],
      [{ rows: [listPo()], lastPageNumber: 2 }, { rows: [listPo()], lastPageNumber: 2 }],
      [{ rows: [listPo()], lastPageNumber: 2 }, { rows: [listPo({ purchaseOrderSeq: 124 })], lastPageNumber: 3 }],
      [{ rows: [listPo({ purchaseOrderStatus: 'RP' })], lastPageNumber: 1 }],
    ]) {
      const fake = fakeSite(pages, () => [ONE_SKU]);
      await expect(run(fake.site)).rejects.toMatchObject({ code: ROCKET_PO_COLLECTION_INCOMPLETE });
      expect(fake.detailCalls).toEqual([]);
    }
  });

  it('상세 합계가 목록과 다르면 한 번 더 읽고, 두 번째도 다르면 실패한다', async () => {
    const wrong = table('상품 번호 발주금액', [values(['1', 'P-1', '12345678 상품명', '', '3', '', '1000', '900', '90', '990'])]);
    const recovered = fakeSite([{ rows: [listPo()], lastPageNumber: 1 }], (_po, attempt) => (attempt === 1 ? [wrong] : [ONE_SKU]));
    await expect(run(recovered.site)).resolves.toHaveLength(2);
    expect(recovered.detailCalls).toEqual(['123', '123']);
    const broken = fakeSite([{ rows: [listPo()], lastPageNumber: 1 }], () => [wrong]);
    await expect(run(broken.site)).rejects.toMatchObject({ code: ROCKET_PO_COLLECTION_INCOMPLETE });
  });

  it('모든 쪽과 모든 발주서 상세를 읽는다(옛 상한 없음), 상세는 5개씩', async () => {
    const pages = Array.from({ length: 3 }, (_, page) => ({
      rows: Array.from({ length: 4 }, (_, index) => listPo({ purchaseOrderSeq: page * 10 + index + 1 })),
      lastPageNumber: 3,
    }));
    const fake = fakeSite(pages, () => [ONE_SKU]);
    const chunks = await run(fake.site);
    expect(fake.listCalls.map(([, page]) => page)).toEqual([1, 2, 3]);
    expect(fake.detailCalls).toHaveLength(12);
    expect(chunks.at(-1)!.payload[0]).toMatchObject({ listPagesRead: 3, totalListPages: 3, detailPoCount: 12 });
  });
});
