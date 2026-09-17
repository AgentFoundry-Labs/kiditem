import { describe, expect, it } from 'vitest';
import type {
  SabangnetMallListingRow,
  SabangnetMallListingsPlan,
  SabangnetMallListingsSubmission,
} from '@kiditem/shared/sabangnet-mall-listings';
import {
  barcodeFromOwnCode,
  sabangnetListingsByAccount,
  sabangnetSubmissionProblem,
} from './sabangnet-mall-listings';

const RUN = '99999999-9999-4999-8999-999999999999';
const KIDSNOTE = '11111111-1111-4111-8111-111111111111';
const ELEVENST = '22222222-2222-4222-8222-222222222222';

const plan: SabangnetMallListingsPlan = {
  sourceType: 'sabangnet_mall_listings',
  parserVersion: 'sabangnet-mall-listings-v1',
  sourceOrigin: 'https://sbadmin08.sabangnet.co.kr',
  listPath: '/prod-api/customer/mall/MallProductUpdate/getMallProductUpdateLists',
  pageSize: 500,
  dateFrom: '20000101',
  dateTo: '20260917',
  malls: [
    { mallKey: 'kidsnote', channelAccountId: KIDSNOTE, sabangnetShopIds: ['shop0472'] },
    { mallKey: '11st', channelAccountId: ELEVENST, sabangnetShopIds: ['shop0464', 'shop0003'] },
  ],
};

function row(overrides: Partial<SabangnetMallListingRow> = {}): SabangnetMallListingRow {
  return {
    sendSerial: '1',
    sabangnetShopId: 'shop0472',
    mallProductCode: 'KN-1',
    sabangnetProductNo: '103177',
    modelName: '10162-1',
    ownProductCode: null,
    productName: '네일팁',
    salePrice: 1950,
    supplyStatus: '공급중',
    firstSentAt: '20260914 13:47',
    ...overrides,
  };
}

function submission(
  rows: SabangnetMallListingRow[],
  collection: Partial<SabangnetMallListingsSubmission['collection']> = {},
): SabangnetMallListingsSubmission {
  return {
    collection: {
      collectionRunId: RUN,
      totalRecords: rows.length,
      recordsRead: rows.length,
      pagesRead: 1,
      totalPages: 1,
      truncated: false,
      skippedByShop: {},
      missingMallCode: 0,
      ...collection,
    },
    rows,
    proof: { dateFrom: '20000101', dateTo: '20260917', pageSize: 500, validatedList: true },
  };
}

describe('sabangnetSubmissionProblem', () => {
  it('끝까지 읽은 목록은 문제가 없다 — 빈 목록도 한 페이지를 읽은 것이다', () => {
    expect(sabangnetSubmissionProblem(plan, RUN, submission([row()]))).toBeNull();
    expect(sabangnetSubmissionProblem(plan, RUN, submission([]))).toBeNull();
  });

  it('다른 시도나 다른 검색 범위의 근거는 펜스를 잃은 것이다', () => {
    expect(sabangnetSubmissionProblem(plan, 'other', submission([row()]))).toBe('plan_fence_lost');
    const shifted = submission([row()]);
    shifted.proof.dateTo = '20260918';
    expect(sabangnetSubmissionProblem(plan, RUN, shifted)).toBe('plan_fence_lost');
  });

  it('페이지를 덜 읽었거나 잘랐으면 완전한 스냅샷이 아니다', () => {
    expect(sabangnetSubmissionProblem(plan, RUN, submission([row()], {
      totalRecords: 501, recordsRead: 501, totalPages: 2, pagesRead: 1,
      skippedByShop: { shop0075: 500 },
    }))).toBe('incomplete_pages');
    expect(sabangnetSubmissionProblem(plan, RUN, submission([row()], { truncated: true })))
      .toBe('incomplete_pages');
    // 전체 건수로 계산한 페이지 수와 알린 페이지 수가 다르면 믿지 않는다.
    expect(sabangnetSubmissionProblem(plan, RUN, submission([row()], { totalPages: 2, pagesRead: 2 })))
      .toBe('incomplete_pages');
  });

  it('알린 전체 건수만큼 읽지 않았으면 거절한다', () => {
    expect(sabangnetSubmissionProblem(plan, RUN, submission([row()], { totalRecords: 2 })))
      .toBe('incomplete_records');
  });

  it('넘긴 줄 · 건너뛴 줄 · 코드 없는 줄의 합이 읽은 수와 같아야 한다', () => {
    expect(sabangnetSubmissionProblem(plan, RUN, submission([row()], {
      totalRecords: 3, recordsRead: 3, skippedByShop: { shop0075: 1 },
    }))).toBe('row_count_mismatch');
    expect(sabangnetSubmissionProblem(plan, RUN, submission([row()], {
      totalRecords: 3, recordsRead: 3, skippedByShop: { shop0075: 1 }, missingMallCode: 1,
    }))).toBeNull();
  });

  it('계획에 없는 쇼핑몰 줄, 계획에 있는데 건너뛴 쇼핑몰, 같은 송신번호 두 줄을 거절한다', () => {
    expect(sabangnetSubmissionProblem(plan, RUN, submission([row({ sabangnetShopId: 'shop0100' })])))
      .toBe('unplanned_shop');
    expect(sabangnetSubmissionProblem(plan, RUN, submission([row()], {
      totalRecords: 2, recordsRead: 2, skippedByShop: { shop0472: 1 },
    }))).toBe('planned_shop_skipped');
    expect(sabangnetSubmissionProblem(plan, RUN, submission([
      row(),
      row({ mallProductCode: 'KN-2' }),
    ]))).toBe('duplicate_send');
  });
});

describe('sabangnetListingsByAccount', () => {
  it('몰 계정 행마다 몰 상품코드 순으로 리스팅을 만든다 — 줄이 없는 몰도 빈 목록으로 선다', () => {
    const byAccount = sabangnetListingsByAccount(plan, [
      row({ sendSerial: '2', mallProductCode: 'KN-2' }),
      row({ sendSerial: '1', mallProductCode: 'KN-1' }),
    ]);
    expect(byAccount.get(KIDSNOTE)?.map((listing) => listing.externalProductId)).toEqual(['KN-1', 'KN-2']);
    expect(byAccount.get(ELEVENST)).toEqual([]);
  });

  it('한 몰에 같은 몰 상품코드가 두 번 오면 최근에 보낸 기록을 쓴다', () => {
    const byAccount = sabangnetListingsByAccount(plan, [
      row({ sendSerial: '3', sabangnetShopId: 'shop0003', mallProductCode: '8123', supplyStatus: '공급중', firstSentAt: '20210306 10:00' }),
      row({ sendSerial: '4', sabangnetShopId: 'shop0464', mallProductCode: '8123', supplyStatus: '일시중지', firstSentAt: '20260101 09:00' }),
    ]);
    const [listing] = byAccount.get(ELEVENST) ?? [];
    expect(listing).toMatchObject({ productStatus: '사방넷 일시중지', raw: { sendSerial: '4' } });
  });

  it('모델명은 옵션의 자체코드로, 사방넷 공급상태는 표시를 붙여 상태로 둔다', () => {
    const [listing] = sabangnetListingsByAccount(plan, [row({ ownProductCode: '8806381806625' })])
      .get(KIDSNOTE) ?? [];
    expect(listing).toMatchObject({
      externalProductId: 'KN-1',
      productStatus: '사방넷 공급중',
      raw: { source: 'sabangnet_mall_listings' },
      options: [{
        externalOptionId: 'KN-1',
        sellerSku: '10162-1',
        barcode: '8806381806625',
        modelNumber: null,
        salePrice: 1950,
        skuStatus: '사방넷 공급중',
      }],
    });
    // 옵션 원문에는 로그인 칸이 없고, 원천 표지는 저장소가 붙인다.
    expect(listing!.options[0]!.raw).not.toHaveProperty('source');
  });
});

describe('barcodeFromOwnCode', () => {
  it('8~14자리 숫자만 바코드로 쓴다', () => {
    expect(barcodeFromOwnCode('8806381806625')).toBe('8806381806625');
    expect(barcodeFromOwnCode('8806384825817XE2001')).toBeNull();
    expect(barcodeFromOwnCode('1234567')).toBeNull();
    expect(barcodeFromOwnCode(null)).toBeNull();
  });
});
