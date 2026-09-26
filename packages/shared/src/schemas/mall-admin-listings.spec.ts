import { describe, expect, it } from 'vitest';
import { isChannelKey } from '../channel-registry';
import {
  isMallAdminListingMallKey,
  MALL_ADMIN_LISTING_MALL_KEYS,
  MALL_ADMIN_LISTING_READERS,
  MALL_ADMIN_LISTINGS_PARSER_VERSION,
  MALL_ADMIN_LISTINGS_SOURCE_TYPE,
  MallAdminListingRowSchema,
  MallAdminListingsPlanSchema,
  MallAdminListingsPublicationSchema,
  MallAdminListingsScanSchema,
  MallAdminListingsSourceMallSchema,
} from './mall-admin-listings';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

function plan(overrides: Record<string, unknown> = {}) {
  return {
    sourceType: MALL_ADMIN_LISTINGS_SOURCE_TYPE,
    parserVersion: MALL_ADMIN_LISTINGS_PARSER_VERSION,
    mallKey: 'kidkids',
    channelAccountId: ACCOUNT,
    sourceOrigin: 'https://partner.kidkids.net',
    pageSize: 20000,
    ...overrides,
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    mallProductCode: '1098464',
    productName: '[키드아이템] 왁스팝 말랑이 1p 왁뿌',
    sellpiaName: '3000왁스팝 말랑이',
    sellerCode: null,
    salePrice: 1900,
    statusWords: ['정상'],
    registeredOn: null,
    ...overrides,
  };
}

describe('MALL_ADMIN_LISTING_READERS', () => {
  it('직접 읽는 몰은 몰 계정 행의 키로 부른다', () => {
    // 읽기기 키는 몰 계정 행의 channel 값이다 — 채널 레지스트리에 없는 키는 계정 행을 찾지 못한다.
    expect(MALL_ADMIN_LISTING_MALL_KEYS).toEqual(Object.keys(MALL_ADMIN_LISTING_READERS));
    expect(MALL_ADMIN_LISTING_MALL_KEYS.filter((key) => !isChannelKey(key))).toEqual([]);
    expect(isMallAdminListingMallKey('kidkids')).toBe(true);
    expect(isMallAdminListingMallKey('icecream-mall')).toBe(true);
    expect(isMallAdminListingMallKey('always')).toBe(true);
    expect(isMallAdminListingMallKey('art09')).toBe(true);
    expect(isMallAdminListingMallKey('thirtymall')).toBe(true);
    expect(isMallAdminListingMallKey('boribori')).toBe(false);
    expect(isMallAdminListingMallKey('toString')).toBe(false);
  });

  it('아이스크림몰만 셀피아 이름을 상품 상세에서 읽는다', () => {
    expect(MALL_ADMIN_LISTING_READERS.kidkids.detailNames).toBe(false);
    expect(MALL_ADMIN_LISTING_READERS['icecream-mall'].detailNames).toBe(true);
  });
});

describe('MallAdminListingsPlanSchema', () => {
  it('몰의 관리자 주소와 쪽 크기가 몰 표와 같아야 한다', () => {
    expect(MallAdminListingsPlanSchema.safeParse(plan()).success).toBe(true);
    expect(MallAdminListingsPlanSchema.safeParse(plan({
      mallKey: 'icecream-mall',
      sourceOrigin: 'https://po.i-screammall.co.kr',
      pageSize: 10000,
    })).success).toBe(true);
    expect(MallAdminListingsPlanSchema.safeParse(plan({ sourceOrigin: 'https://evil.example' })).success)
      .toBe(false);
    expect(MallAdminListingsPlanSchema.safeParse(plan({ pageSize: 1000 })).success).toBe(false);
    expect(MallAdminListingsPlanSchema.safeParse(plan({ mallKey: 'icecream-mall' })).success).toBe(false);
  });
});

describe('MallAdminListingRowSchema', () => {
  it('셀피아 이름이 없는 상품도 받는다', () => {
    expect(MallAdminListingRowSchema.safeParse(row({ sellpiaName: null })).success).toBe(true);
  });

  it('몰에 심어 둔 셀피아 코드를 받는다 — 아직 안 심은 상품은 비어 있다', () => {
    expect(MallAdminListingRowSchema.parse(row({ sellerCode: '10271-1' })).sellerCode).toBe('10271-1');
    expect(MallAdminListingRowSchema.safeParse(row({ sellerCode: null })).success).toBe(true);
    expect(MallAdminListingRowSchema.safeParse(row({ sellerCode: 'x'.repeat(61) })).success).toBe(false);
  });

  it('상태 글자가 하나도 없거나 목록 원문 칸이 섞이면 거절한다', () => {
    expect(MallAdminListingRowSchema.safeParse(row({ statusWords: [] })).success).toBe(false);
    expect(MallAdminListingRowSchema.safeParse(row({ supplierName: '거영아이앤디' })).success).toBe(false);
    expect(MallAdminListingRowSchema.safeParse(row({ mallProductCode: 'x'.repeat(61) })).success).toBe(false);
    expect(MallAdminListingRowSchema.safeParse(row({ registeredOn: '26-01-21' })).success).toBe(false);
  });
});

describe('MallAdminListingsScanSchema', () => {
  it('목록을 끝까지 읽었다는 근거를 받는다 — 끝까지 읽지 않았다는 근거는 거절한다', () => {
    const scan = {
      collection: { totalRecords: 1, recordsRead: 1, pagesRead: 1, totalPages: 1, detailsRead: 0, detailsMissing: 0 },
      proof: { mallKey: 'kidkids', pageSize: 20000, validatedList: true },
    };
    expect(MallAdminListingsScanSchema.safeParse(scan).success).toBe(true);
    expect(MallAdminListingsScanSchema.safeParse({ ...scan, proof: { ...scan.proof, validatedList: false } }).success).toBe(false);
    // 옛 시도 제출의 시도 id 칸은 이제 없다(KID-381).
    expect(MallAdminListingsScanSchema.safeParse({ ...scan, collection: { ...scan.collection, collectionRunId: ACCOUNT } }).success).toBe(false);
  });
});

describe('MallAdminListingsSourceMallSchema', () => {
  it('몰마다 계정 행과 그 몰의 최근 실행 · 최근 성공 실행만 싣는다 — 옛 시도 칸은 없다(KID-381)', () => {
    const mall = { mallKey: 'onch', mallName: '온채널', channelAccountId: ACCOUNT, latestPublication: null, latestOperation: null, latestSucceeded: null };
    expect(MallAdminListingsSourceMallSchema.safeParse(mall).success).toBe(true);
    expect(MallAdminListingsSourceMallSchema.safeParse({ ...mall, latestAttempt: null, latestComplete: null }).success).toBe(false);
  });
});

describe('MallAdminListingsPublicationSchema', () => {
  it('⭐ 새 칸이 생기기 전에 저장된 발행 결과도 읽는다 — 0개라고 거짓말하지 않는다', () => {
    const old = { listings: 3478, deactivated: 0, missingNames: 1484, statuses: { 판매중: 555 } };
    expect(MallAdminListingsPublicationSchema.parse(old)).toEqual({ ...old, codedListings: 0 });
  });
});
