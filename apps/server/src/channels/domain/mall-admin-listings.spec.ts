import { describe, expect, it } from 'vitest';
import type {
  MallAdminListingRow,
  MallAdminListingsPlan,
  MallAdminListingsSubmission,
} from '@kiditem/shared/mall-admin-listings';
import {
  mallAdminListingProducts,
  mallAdminListingStatus,
  mallAdminStatusCounts,
  mallAdminSubmissionProblem,
} from './mall-admin-listings';

const RUN = '99999999-9999-4999-8999-999999999999';
const ACCOUNT = '11111111-1111-4111-8111-111111111111';

const kidkids: MallAdminListingsPlan = {
  sourceType: 'mall_admin_listings',
  parserVersion: 'mall-admin-listings-v1',
  mallKey: 'kidkids',
  channelAccountId: ACCOUNT,
  sourceOrigin: 'https://partner.kidkids.net',
  pageSize: 20000,
};

const icecream: MallAdminListingsPlan = {
  ...kidkids,
  mallKey: 'icecream-mall',
  sourceOrigin: 'https://po.i-screammall.co.kr',
  pageSize: 10000,
};

function row(overrides: Partial<MallAdminListingRow> = {}): MallAdminListingRow {
  return {
    mallProductCode: '176227',
    productName: '[키드아이템] 스크림 가면 [12개] 할로윈가면',
    sellpiaName: '스크림가면',
    sellerCode: null,
    salePrice: 7260,
    statusWords: ['정상'],
    registeredOn: null,
    ...overrides,
  };
}

function submission(
  rows: MallAdminListingRow[],
  collection: Partial<MallAdminListingsSubmission['collection']> = {},
  proof: Partial<MallAdminListingsSubmission['proof']> = {},
): MallAdminListingsSubmission {
  return {
    collection: {
      collectionRunId: RUN,
      totalRecords: rows.length,
      recordsRead: rows.length,
      pagesRead: 1,
      totalPages: 1,
      detailsRead: 0,
      detailsMissing: 0,
      ...collection,
    },
    rows,
    proof: { mallKey: 'kidkids', pageSize: 20000, validatedList: true, ...proof },
  };
}

describe('mallAdminListingStatus', () => {
  it('키드키즈 — 품절여부 한 칸이 상태를 담는다', () => {
    expect(mallAdminListingStatus('kidkids', ['정상'])).toBe('판매중');
    expect(mallAdminListingStatus('kidkids', ['일시품절'])).toBe('품절');
    expect(mallAdminListingStatus('kidkids', ['영구품절'])).toBe('판매종료');
    expect(mallAdminListingStatus('kidkids', ['보류'])).toBe('보류');
  });

  it('아이스크림몰 — 판매종료는 전시여부와 관계없이 판매종료다', () => {
    expect(mallAdminListingStatus('icecream-mall', ['판매중', '전시'])).toBe('판매중');
    expect(mallAdminListingStatus('icecream-mall', ['판매중', '전시안함'])).toBe('미노출');
    expect(mallAdminListingStatus('icecream-mall', ['품절', '전시'])).toBe('품절');
    expect(mallAdminListingStatus('icecream-mall', ['판매종료', '전시'])).toBe('판매종료');
  });

  it('모르는 글자는 짐작하지 않고 몰 글자를 그대로 둔다', () => {
    expect(mallAdminListingStatus('icecream-mall', ['임시저장', '전시'])).toBe('임시저장 · 전시');
    expect(mallAdminListingStatus('kidkids', ['미인증'])).toBe('미인증');
  });
});

describe('mallAdminSubmissionProblem', () => {
  it('목록 전체를 읽은 제출은 통과한다', () => {
    expect(mallAdminSubmissionProblem(kidkids, RUN, submission([row()]))).toBeNull();
  });

  it('다른 시도 · 다른 몰 · 다른 쪽 크기의 제출은 계획이 아니다', () => {
    expect(mallAdminSubmissionProblem(kidkids, RUN, submission([row()], {
      collectionRunId: ACCOUNT,
    }))).toBe('plan_fence_lost');
    expect(mallAdminSubmissionProblem(kidkids, RUN, submission([row()], {}, {
      mallKey: 'icecream-mall',
    }))).toBe('plan_fence_lost');
    expect(mallAdminSubmissionProblem(kidkids, RUN, submission([row()], {}, {
      pageSize: 20,
    }))).toBe('plan_fence_lost');
  });

  it('⭐ 한 줄이라도 빠지면 저장하지 않는다 — 그 상품이 내려간 것으로 보인다', () => {
    const rows = Array.from({ length: 41 }, (_, index) => row({ mallProductCode: String(index + 1) }));
    expect(mallAdminSubmissionProblem(kidkids, RUN, submission(rows))).toBeNull();
    // 다운로드가 전체를 담지 못해 목록 건수보다 적으면 멈춘다.
    expect(mallAdminSubmissionProblem(kidkids, RUN, submission(rows.slice(0, 40), {
      totalRecords: 41,
      recordsRead: 40,
    }))).toBe('incomplete_records');
    // 쪽을 둘로 나눠 보내면(이 원천은 한 요청이다) 쪽 수 검사에 걸린다.
    expect(mallAdminSubmissionProblem(kidkids, RUN, submission(rows, {
      totalPages: 2,
      pagesRead: 2,
    }))).toBe('incomplete_pages');
  });

  it('빈 목록은 한 쪽을 읽은 것이다', () => {
    expect(mallAdminSubmissionProblem(kidkids, RUN, submission([], {
      totalPages: 1,
      pagesRead: 1,
    }))).toBeNull();
  });

  it('읽었다는 수와 넘긴 줄 수가 다르거나 상품코드가 겹치면 거절한다', () => {
    expect(mallAdminSubmissionProblem(kidkids, RUN, submission([row()], {
      totalRecords: 2,
      recordsRead: 2,
    }))).toBe('row_count_mismatch');
    expect(mallAdminSubmissionProblem(kidkids, RUN, submission([row(), row()]))).toBe('duplicate_code');
  });

  it('상세에서 이름을 읽는 몰은 상품마다 상세를 열었어야 한다', () => {
    const rows = [row({ mallProductCode: '11218365' }), row({ mallProductCode: '985846' })];
    const icecreamProof = { mallKey: 'icecream-mall' as const, pageSize: 10000 };
    expect(mallAdminSubmissionProblem(icecream, RUN, submission(rows, {
      detailsRead: 1,
      detailsMissing: 1,
    }, icecreamProof))).toBeNull();
    expect(mallAdminSubmissionProblem(icecream, RUN, submission(rows, {
      detailsRead: 1,
    }, icecreamProof))).toBe('detail_count_mismatch');
    expect(mallAdminSubmissionProblem(kidkids, RUN, submission([row()], {
      detailsRead: 1,
    }))).toBe('detail_count_mismatch');
  });
});

describe('mallAdminListingProducts', () => {
  it('⭐ 몰에 적어 둔 셀피아 이름을 옵션 이름에 두고, 상품코드 순서로 발행한다', () => {
    const products = mallAdminListingProducts(kidkids, [
      row({ mallProductCode: '997615', sellpiaName: '할로윈선물호박바구니' }),
      row(),
    ]);
    expect(products.map((product) => product.externalProductId)).toEqual(['176227', '997615']);
    expect(products[0]).toEqual({
      externalProductId: '176227',
      registeredName: '[키드아이템] 스크림 가면 [12개] 할로윈가면',
      displayName: '[키드아이템] 스크림 가면 [12개] 할로윈가면',
      category: null,
      manufacturer: null,
      brand: null,
      productStatus: '판매중',
      raw: {
        source: 'mall_admin_listings',
        mallKey: 'kidkids',
        statusWords: ['정상'],
        sellpiaName: '스크림가면',
        sellerCode: null,
        registeredOn: null,
      },
      options: [{
        externalOptionId: '176227',
        optionName: '스크림가면',
        salePrice: 7260,
        sellerSku: null,
        barcode: null,
        modelNumber: null,
        skuStatus: '판매중',
        attributes: {},
        raw: {
          mallKey: 'kidkids',
          statusWords: ['정상'],
          sellpiaName: '스크림가면',
          sellerCode: null,
          registeredOn: null,
        },
      }],
    });
  });

  it('⭐ 몰에 심어 둔 셀피아 코드는 옵션 sellerSku 로 간다 — 이름 대신 코드로 이어진다', () => {
    const [product] = mallAdminListingProducts(kidkids, [row({ sellerCode: '792-1' })]);
    expect(product!.options[0]!.sellerSku).toBe('792-1');
    expect(product!.options[0]!.raw).toMatchObject({ sellerCode: '792-1' });
    // 안 심은 상품은 비어 있고, 이름 매칭에 맡긴다.
    const [plain] = mallAdminListingProducts(kidkids, [row()]);
    expect(plain!.options[0]!.sellerSku).toBeNull();
  });

  it('상태 글자별로 센다', () => {
    const products = mallAdminListingProducts(kidkids, [
      row({ mallProductCode: '1' }),
      row({ mallProductCode: '2', statusWords: ['일시품절'] }),
      row({ mallProductCode: '3', statusWords: ['영구품절'] }),
    ]);
    expect(mallAdminStatusCounts(products)).toEqual({ 판매중: 1, 품절: 1, 판매종료: 1 });
  });
});
