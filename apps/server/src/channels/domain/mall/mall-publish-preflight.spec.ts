import { describe, expect, it } from 'vitest';
import { getMallAdapterManifest } from './mall-adapter-manifest';
import {
  evaluateMallPreflight,
  type PreflightProduct,
  type PreflightProfile,
} from './mall-publish-preflight';

const ASOF = new Date('2026-09-02T00:00:00.000Z');

function product(overrides: Partial<PreflightProduct> = {}): PreflightProduct {
  return {
    masterProductId: 'mp-1',
    name: '유아 원목 블록 30P',
    salePrice: 24900,
    imageCount: 5,
    optionNames: ['기본'],
    hasMallCategory: true,
    noticeCategory: '어린이제품',
    noticeMissingFields: [],
    certification: { certType: 'safety_confirm', validTo: new Date('2027-01-31T00:00:00.000Z') },
    ...overrides,
  };
}

const PROFILE: PreflightProfile = {
  id: 'profile-1',
  name: '기본 배송 프로필',
  filledFields: ['shipping', 'releaseAddress', 'returnAddress', 'returnPolicy', 'asPhone'],
};

const KIDSNOTE = getMallAdapterManifest('kidsnote')!;

function evaluate(overrides: Partial<PreflightProduct> = {}, profile: PreflightProfile | null = PROFILE) {
  return evaluateMallPreflight({ manifest: KIDSNOTE, product: product(overrides), profile, asOf: ASOF });
}

describe('evaluateMallPreflight', () => {
  it('passes a complete product', () => {
    expect(evaluate()).toMatchObject({ ok: true, violations: [] });
  });

  it('blocks an expired KC certificate', () => {
    const result = evaluate({
      certification: { certType: 'safety_confirm', validTo: new Date('2026-08-31T00:00:00.000Z') },
    });
    expect(result.ok).toBe(false);
    expect(result.violations.map((violation) => violation.rule)).toContain('kc_not_expired');
  });

  it('treats a certificate with no expiry as valid', () => {
    expect(evaluate({ certification: { certType: 'none', validTo: null } }).ok).toBe(true);
  });

  it('blocks when KC was never entered — 해당 없음도 명시적으로 골라야 한다', () => {
    const result = evaluate({ certification: null });
    expect(result.violations.map((violation) => violation.rule)).toContain('kc_certification');
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

  it('reports every missing notice field at once', () => {
    const result = evaluate({ noticeMissingFields: ['제조자', 'A/S 책임자'] });
    const violation = result.violations.find((entry) => entry.rule === 'notice_attributes');
    expect(violation?.message).toContain('제조자');
    expect(violation?.message).toContain('A/S 책임자');
  });

  it('names the missing profile fields rather than just failing', () => {
    const result = evaluate({}, { id: 'p2', name: '반쪽 프로필', filledFields: ['shipping'] });
    const violation = result.violations.find((entry) => entry.rule === 'profile_selected');
    expect(violation?.message).toContain('출고지');
    expect(violation?.message).toContain('반품지');
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
      profile: PROFILE,
      asOf: ASOF,
    });
    const violation = result.violations.find((entry) => entry.rule === 'option_count_within_limit');
    expect(violation?.message).toContain('200');
  });

  it('blocks an unverified mall before running any rule', () => {
    const elevenSt = getMallAdapterManifest('11st')!;
    const result = evaluateMallPreflight({ manifest: elevenSt, product: product(), profile: PROFILE, asOf: ASOF });
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.message).toContain('확인되지 않았습니다');
  });

  it('blocks a channel that does not sell products', () => {
    const direct = getMallAdapterManifest('coupang-direct')!;
    const result = evaluateMallPreflight({ manifest: direct, product: product(), profile: PROFILE, asOf: ASOF });
    expect(result.ok).toBe(false);
  });
});
