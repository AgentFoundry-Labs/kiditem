import { describe, expect, it } from 'vitest';
import {
  SABANGNET_ADMIN_ORIGIN,
  SABANGNET_MALL_LISTING_LIST_PATH,
  SABANGNET_MALL_LISTING_PAGE_SIZE,
  SABANGNET_MALL_LISTINGS_PARSER_VERSION,
  SABANGNET_MALL_LISTINGS_SOURCE_TYPE,
  SABANGNET_SHOP_MALL_KEYS,
  SabangnetMallListingRowSchema,
  SabangnetMallListingsPlanSchema,
  SabangnetMallListingsScanSchema,
  sabangnetShopIdsByMallKey,
} from './sabangnet-mall-listings';

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';

function plan(overrides: Record<string, unknown> = {}) {
  return {
    sourceType: SABANGNET_MALL_LISTINGS_SOURCE_TYPE,
    parserVersion: SABANGNET_MALL_LISTINGS_PARSER_VERSION,
    sourceOrigin: SABANGNET_ADMIN_ORIGIN,
    listPath: SABANGNET_MALL_LISTING_LIST_PATH,
    pageSize: SABANGNET_MALL_LISTING_PAGE_SIZE,
    dateFrom: '20000101',
    dateTo: '20260917',
    malls: [
      { mallKey: '11st', channelAccountId: ACCOUNT_A, sabangnetShopIds: ['shop0464', 'shop0003'] },
      { mallKey: 'ssg', channelAccountId: ACCOUNT_B, sabangnetShopIds: ['shop0100'] },
    ],
    ...overrides,
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    sendSerial: '5010556535',
    sabangnetShopId: 'shop0372',
    mallProductCode: 'LO2773890829',
    sabangnetProductNo: '100105',
    modelName: '10162-1',
    ownProductCode: '8806384818536',
    productName: '할로윈 호박 바구니 (소)',
    salePrice: 3960,
    supplyStatus: '공급중',
    firstSentAt: '20260917 11:45',
    ...overrides,
  };
}

describe('SABANGNET_SHOP_MALL_KEYS', () => {
  it('두 사방넷 쇼핑몰이 한 몰로 오면 몰 키에 둘 다 모인다', () => {
    expect(sabangnetShopIdsByMallKey().get('11st')).toEqual(['shop0464', 'shop0003']);
    expect(sabangnetShopIdsByMallKey().get('ssg')).toEqual(['shop0100']);
  });

  it('쿠팡은 Wing 가져오기가 따로 있어 받지 않는다', () => {
    expect(Object.keys(SABANGNET_SHOP_MALL_KEYS)).not.toContain('shop0075');
    expect(Object.values(SABANGNET_SHOP_MALL_KEYS)).not.toContain('coupang');
  });
});

describe('SabangnetMallListingsPlanSchema', () => {
  it('받을 몰과 계정 행을 고정한 계획을 받는다', () => {
    expect(SabangnetMallListingsPlanSchema.parse(plan()).malls).toHaveLength(2);
  });

  it('한 사방넷 쇼핑몰을 두 몰이 받는 계획을 거절한다', () => {
    expect(SabangnetMallListingsPlanSchema.safeParse(plan({
      malls: [
        { mallKey: '11st', channelAccountId: ACCOUNT_A, sabangnetShopIds: ['shop0464'] },
        { mallKey: 'ssg', channelAccountId: ACCOUNT_B, sabangnetShopIds: ['shop0464'] },
      ],
    })).success).toBe(false);
  });

  it('거꾸로 된 날짜 범위를 거절한다', () => {
    expect(SabangnetMallListingsPlanSchema.safeParse(plan({ dateFrom: '20260918' })).success).toBe(false);
  });
});

describe('SabangnetMallListingRowSchema', () => {
  it('고른 칸만 받는다 — 로그인 칸이 섞인 원문은 거절한다', () => {
    expect(SabangnetMallListingRowSchema.parse(row()).mallProductCode).toBe('LO2773890829');
    expect(SabangnetMallListingRowSchema.safeParse(row({ shmaCnctnLoginId: 'seller' })).success)
      .toBe(false);
  });

  it('옵션 외부 ID 칸(60자)을 넘는 몰 상품코드를 거절한다', () => {
    expect(SabangnetMallListingRowSchema.safeParse(row({ mallProductCode: 'x'.repeat(61) })).success)
      .toBe(false);
  });

  it('모델명 · 자체상품코드 · 가격은 비어 있어도 된다', () => {
    const parsed = SabangnetMallListingRowSchema.parse(row({
      modelName: null,
      ownProductCode: null,
      salePrice: null,
      firstSentAt: null,
    }));
    expect(parsed.modelName).toBeNull();
  });
});

describe('SabangnetMallListingsScanSchema', () => {
  it('완결성 근거(읽은 쪽·기록 수·넘긴 쇼핑몰)와 조회 조건을 함께 받는다', () => {
    const parsed = SabangnetMallListingsScanSchema.parse({
      collection: {
        totalRecords: 2,
        recordsRead: 2,
        pagesRead: 1,
        totalPages: 1,
        truncated: false,
        skippedByShop: { shop0075: 1 },
        missingMallCode: 0,
      },
      proof: { dateFrom: '20000101', dateTo: '20260917', pageSize: 500, validatedList: true },
    });
    expect(parsed.collection.skippedByShop).toEqual({ shop0075: 1 });
  });

  it('행을 싣는 옛 제출 모양은 받지 않는다 — 행은 listing_rows 청크로 따로 온다', () => {
    expect(SabangnetMallListingsScanSchema.safeParse({
      collection: { totalRecords: 0, recordsRead: 0, pagesRead: 1, totalPages: 1, truncated: false, skippedByShop: {}, missingMallCode: 0 },
      rows: [],
      proof: { dateFrom: '20000101', dateTo: '20260917', pageSize: 500, validatedList: true },
    }).success).toBe(false);
  });
});
