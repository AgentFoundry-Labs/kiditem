import { describe, expect, it } from 'vitest';
import { parseRocketSellpiaMatchingCsv } from './matching-csv.parser';

const HEADERS = [
  '번호',
  '쿠팡공급상태',
  '쿠팡공급사_상품명',
  '바코드',
  'skuId',
  'vendorItemId',
  '셀피아상품',
  '셀피아바코드',
  '매칭방식',
  '신뢰도',
  '셀피아저장매칭',
  'KidItem동기화',
  '매칭상태',
  '근거',
];

describe('parseRocketSellpiaMatchingCsv', () => {
  it('uses the Rocket skuId as the channel identity and preserves quoted product names', () => {
    const parsed = parseRocketSellpiaMatchingCsv(Buffer.from([
      `\uFEFF${HEADERS.join(',')}`,
      '1,활성,"돌고래게틀링비눗방울총(2개입) 블루,핑크",8806384883947,17616314,78399258325,6000돌고래게틀링비눗방울총,8806384885163,이름매칭,high,,,이름매칭(高),제품명 일치',
    ].join('\n')));

    expect(parsed.headers).toEqual(HEADERS);
    expect(parsed.rows).toEqual([{
      rowNumber: 2,
      externalSkuId: '17616314',
      vendorItemId: '78399258325',
      productName: '돌고래게틀링비눗방울총(2개입) 블루,핑크',
      supplierStatus: '활성',
      channelBarcode: '8806384883947',
      sellpiaProductName: '6000돌고래게틀링비눗방울총',
      sellpiaBarcode: '8806384885163',
      matchMethod: '이름매칭',
      confidence: 'high',
      sellpiaStoredMatch: false,
      kiditemSynchronized: false,
      matchStatus: '이름매칭(高)',
      evidence: '제품명 일치',
      rawJson: expect.objectContaining({ skuId: '17616314' }),
    }]);
  });

  it('rejects a file that cannot identify Rocket channel SKUs', () => {
    expect(() => parseRocketSellpiaMatchingCsv(Buffer.from([
      '쿠팡공급사_상품명,바코드,vendorItemId',
      '테스트,8806384883947,78399258325',
    ].join('\n')))).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED', details: { reason: 'MATCHING_CSV_COLUMNS_MISSING' } }));
  });
});
