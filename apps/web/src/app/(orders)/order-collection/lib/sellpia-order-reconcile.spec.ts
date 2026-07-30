import { describe, expect, it } from 'vitest';
import { reconcileCollectedOrdersWithSellpia } from './sellpia-order-reconcile';
import type { StoredOrderCollectionFile } from './order-generated-file-store';

function file(
  overrides: Partial<StoredOrderCollectionFile> & { orderNumbers: string[] },
): StoredOrderCollectionFile {
  return {
    id: overrides.id ?? 'file-1',
    fileName: overrides.fileName ?? 'orders.xls',
    sourceName: overrides.sourceName ?? 'orders.xls',
    blob: new Blob(['x']),
    previewRows: [],
    sourceRows: overrides.orderNumbers.length,
    productRows: null,
    outputRows: overrides.orderNumbers.length,
    skippedRows: 0,
    convertedAt: overrides.convertedAt ?? Date.UTC(2026, 6, 30, 1, 0),
    collectionDate: overrides.collectionDate ?? '2026-07-30',
    collectionMode: 'browser',
    fileKind: 'order',
    mallKey: overrides.mallKey,
    mallName: overrides.mallName,
    orderNumbers: overrides.orderNumbers,
  } as StoredOrderCollectionFile;
}

describe('reconcileCollectedOrdersWithSellpia', () => {
  it('flags collected orders that are not in Sellpia yet, matching by provider and order number', () => {
    const result = reconcileCollectedOrdersWithSellpia({
      history: [
        file({ id: 'a', mallKey: 'kidkids', mallName: '키드키즈', orderNumbers: ['A-1', 'A-2', 'A-3'] }),
        file({ id: 'b', mallKey: 'onch', mallName: '온채널', orderNumbers: ['B-1'] }),
      ],
      sellpiaRows: [
        // 라이브 형태: 판매처에 경로가 덧붙고, 주문번호 앞에 판매처 코드가 붙는다.
        { orderNo: '66_A-1', receiver: '이민정(키드키즈)', provider: '키드키즈(외부몰)' },
        { orderNo: '66_A-2', receiver: '김영주(키드키즈)', provider: '키드키즈(외부몰)' },
      ],
      collectionDate: '2026-07-30',
      checkedAt: 1,
    });

    // 키드키즈 A-3 과 온채널 B-1 은 아직 셀피아에 없다.
    expect(result.missingCountByMallKey.get('kidkids')).toBe(1);
    expect(result.missingCountByMallKey.get('onch')).toBe(1);
    expect(result.byMall.find((m) => m.mallKey === 'kidkids')?.missingOrderNumbers).toEqual(['A-3']);
    expect(result.byMall.find((m) => m.mallKey === 'kidkids')?.presentCount).toBe(2);
    expect(result.sellpiaOrderCount).toBeGreaterThan(0);
  });

  it('ignores collections from other dates', () => {
    const result = reconcileCollectedOrdersWithSellpia({
      history: [
        file({ id: 'old', mallKey: 'kidkids', collectionDate: '2026-07-29', orderNumbers: ['OLD-1'] }),
      ],
      sellpiaRows: [],
      collectionDate: '2026-07-30',
      checkedAt: 1,
    });

    expect(result.missingCountByMallKey.size).toBe(0);
  });

  it('treats an order found under an unmapped provider as uploaded', () => {
    const result = reconcileCollectedOrdersWithSellpia({
      history: [file({ mallKey: 'kidkids', orderNumbers: ['A-1'] })],
      // 판매처명이 바뀌어 몰로 매핑되지 않아도 주문번호가 있으면 올라간 것으로 본다.
      sellpiaRows: [{ orderNo: 'A-1', receiver: '홍길동(알수없음)', provider: '알수없는판매처' }],
      collectionDate: '2026-07-30',
      checkedAt: 1,
    });

    expect(result.missingCountByMallKey.get('kidkids')).toBe(0);
  });
});
