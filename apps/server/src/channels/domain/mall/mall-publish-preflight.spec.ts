import { describe, expect, it } from 'vitest';
import { getMallAdapterManifest } from './mall-adapter-manifest';
import {
  evaluateMallPreflight,
  isKcReady,
  type PreflightAccount,
  type PreflightProduct,
} from './mall-publish-preflight';

function product(overrides: Partial<PreflightProduct> = {}): PreflightProduct {
  return {
    masterProductId: 'mp-1',
    name: '유아 원목 블록 30P',
    salePrice: 24900,
    imageCount: 5,
    optionNames: ['기본'],
    hasMallCategory: true,
    kc: { status: 'exists', number: 'CB061R1234-1001' },
    ...overrides,
  };
}

const ACCOUNT: PreflightAccount = {
  listingProfileFields: ['shipping', 'releaseAddress', 'returnAddress', 'returnPolicy', 'asPhone'],
};

const KIDSNOTE = getMallAdapterManifest('kidsnote')!;

function evaluate(overrides: Partial<PreflightProduct> = {}, account: PreflightAccount | null = ACCOUNT) {
  return evaluateMallPreflight({ manifest: KIDSNOTE, product: product(overrides), account });
}

describe('evaluateMallPreflight', () => {
  it('passes a complete product', () => {
    expect(evaluate()).toMatchObject({ ok: true, violations: [] });
  });

  it('passes when the operator explicitly chose 해당 없음', () => {
    expect(evaluate({ kc: { status: 'none', number: null } }).ok).toBe(true);
  });

  it('blocks when KC was never entered — 해당 없음도 명시적으로 골라야 한다', () => {
    for (const kc of [{ status: null, number: null }, { status: 'unknown', number: null }]) {
      const result = evaluate({ kc });
      expect(result.violations.map((violation) => violation.rule)).toContain('kc_certification');
    }
  });

  it('blocks a KC status of 있음 without a certificate number', () => {
    const violation = evaluate({ kc: { status: 'exists', number: null } }).violations
      .find((entry) => entry.rule === 'kc_certification');
    expect(violation?.message).toContain('인증번호');
  });

  /** 수집상품이 이어지지 않은 정본 상품은 KC 를 입력할 곳이 없었다. 통과로 치지 않는다. */
  it('⭐ blocks a product with no linked sourcing candidate', () => {
    const violation = evaluate({ kc: null }).violations.find((entry) => entry.rule === 'kc_certification');
    expect(violation?.message).toContain('수집상품');
  });

  it("blocks the '단품' option name that malls silently reject", () => {
    const result = evaluate({ optionNames: ['단품', '2개세트'] });
    const violation = result.violations.find((entry) => entry.rule === 'option_name_forbids_danpum');
    expect(violation?.message).toContain('단품');
  });

  it('blocks characters that cause encoding failures and names them', () => {
    const result = evaluate({ name: '유아 블록 ★한정★ 🎁' });
    const violation = result.violations.find((entry) => entry.rule === 'charset_korean_english_only');
    expect(violation?.message).toContain('★');
    expect(violation?.message).toContain('🎁');
  });

  it('allows ordinary product-name punctuation', () => {
    expect(evaluate({ name: '유아 원목블록 (30P) 1+1 / 100% 국산' }).ok).toBe(true);
  });

  it('names the missing listing profile fields rather than just failing', () => {
    const result = evaluate({}, { listingProfileFields: ['shipping'] });
    const violation = result.violations.find((entry) => entry.rule === 'profile_selected');
    expect(violation?.message).toContain('출고지');
    expect(violation?.message).toContain('반품지');
  });

  it('tells a missing listing profile apart from a missing account', () => {
    const noProfile = evaluate({}, { listingProfileFields: null }).violations
      .find((entry) => entry.rule === 'profile_selected');
    const noAccount = evaluate({}, null).violations.find((entry) => entry.rule === 'profile_selected');
    expect(noProfile?.message).toContain('등록 기본값');
    expect(noAccount?.message).toContain('계정이 없습니다');
  });

  it('collects every violation instead of stopping at the first', () => {
    const result = evaluate({ hasMallCategory: false, imageCount: 0, salePrice: null });
    expect(result.violations.map((violation) => violation.rule)).toEqual(
      expect.arrayContaining(['mall_category_mapped', 'images_present', 'price_positive']),
    );
  });

  it('enforces the per-mall option ceiling', () => {
    const coupang = getMallAdapterManifest('coupang')!;
    const result = evaluateMallPreflight({
      manifest: coupang,
      product: product({ optionNames: Array.from({ length: 201 }, (_, index) => `옵션${index}`) }),
      account: ACCOUNT,
    });
    const violation = result.violations.find((entry) => entry.rule === 'option_count_within_limit');
    expect(violation?.message).toContain('200');
  });

  it('blocks an unverified mall before running any rule', () => {
    const elevenSt = getMallAdapterManifest('11st')!;
    const result = evaluateMallPreflight({ manifest: elevenSt, product: product(), account: ACCOUNT });
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.message).toContain('확인되지 않았습니다');
  });

  it('blocks a channel that does not sell products', () => {
    const direct = getMallAdapterManifest('coupang-direct')!;
    const result = evaluateMallPreflight({ manifest: direct, product: product(), account: ACCOUNT });
    expect(result.ok).toBe(false);
  });
});

describe('isKcReady', () => {
  it('accepts a number or an explicit 해당 없음 only', () => {
    expect(isKcReady({ status: null, number: 'CB061R1234-1001' })).toBe(true);
    expect(isKcReady({ status: 'none', number: null })).toBe(true);
    expect(isKcReady({ status: 'exists', number: null })).toBe(false);
    expect(isKcReady({ status: 'unknown', number: null })).toBe(false);
    expect(isKcReady(null)).toBe(false);
  });
});
