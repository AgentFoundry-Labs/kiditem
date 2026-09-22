import { describe, expect, it } from 'vitest';
import { MARKETPLACE_ADAPTER_NOTES, getMallAdapterManifest } from './mall-adapter-manifest';
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
    certificationNumbers: ['CB061R1234-1001'],
    kcStatus: 'unknown',
    stock: 12,
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

  /**
   * KC 는 판매상품에서만 읽는다(KID-310). 인증 문서에 번호가 있거나, KC 가 붙지 않는 상품이라고
   * 사람이 `kcStatus='none'` 으로 말해 둔 경우에만 통과한다. 아직 확인하지 않은 `unknown` 은
   * 막는다 — 모르는 것을 보내고 몰이 거절하면 그 사유가 실패 큐에서만 보인다.
   */
  it('⭐ blocks a product with no certification document on its selling product', () => {
    const result = evaluate({ certificationNumbers: [] });
    expect(result.ok).toBe(false);
    const violation = result.violations.find((entry) => entry.rule === 'kc_certification');
    expect(violation?.message).toContain('인증');
    // 다른 칸을 채워도 이 규칙은 풀리지 않는다.
    expect(evaluate({ certificationNumbers: [], imageCount: 9, hasMallCategory: true, salePrice: 30_000 }).ok).toBe(false);
    expect(isKcReady({ kcStatus: 'unknown', certificationNumbers: [] })).toBe(false);
  });

  it("⭐ KC 가 붙지 않는 상품이라고 말해 두면 인증 문서 없이도 보낸다", () => {
    expect(evaluate({ certificationNumbers: [], kcStatus: 'none' })).toMatchObject({ ok: true });
  });

  it('blocks a certification document with a blank number', () => {
    expect(evaluate({ certificationNumbers: ['  '] }).violations.map((entry) => entry.rule))
      .toContain('kc_certification');
  });

  /**
   * 품절은 목록에서 지울 일이 아니라 "지금은 보내지 않는다"고 말할 일이다. 매트릭스는
   * 품절 상품도 재고 0 으로 세우고(어느 몰에 무엇이 있나), 보낼 수 있는지는 여기가 답한다.
   */
  it('⭐ blocks a sold-out product with out_of_stock', () => {
    const result = evaluate({ stock: 0 });
    expect(result.ok).toBe(false);
    const violation = result.violations.find((entry) => entry.rule === 'out_of_stock');
    expect(violation?.message).toContain('품절');
  });

  /** 재고 연결이 없는 것(null)은 재고 0 이 아니라 모른다는 뜻이다. 모른다고 막지 않는다. */
  it('⭐ does not block a product with no inventory link', () => {
    expect(evaluate({ stock: null }).violations.map((entry) => entry.rule))
      .not.toContain('out_of_stock');
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

  /**
   * 등록 기본값 문서를 저장하는 화면이 아직 없다(KID-235). 사람이 만들 길이 없는 것을 게이트로
   * 두면 어느 몰도 열리지 않는다 — 문서가 통째로 없는 것은 막지 않고, 계정이 없는 것은 막는다.
   */
  it('⭐ 등록 기본값 문서가 없는 것은 막지 않는다 — 저장할 화면이 아직 없다', () => {
    expect(evaluate({}, { listingProfileFields: null }).violations
      .find((entry) => entry.rule === 'profile_selected')).toBeUndefined();

    const noAccount = evaluate({}, null).violations.find((entry) => entry.rule === 'profile_selected');
    expect(noAccount?.message).toContain('계정이 없습니다');
  });

  /** 문서가 있는데 필수 항목이 빈 것은 사람이 고칠 수 있다 — 그건 계속 막는다. */
  it('문서가 있는데 필수 항목이 비면 계속 막는다', () => {
    expect(evaluate({}, { listingProfileFields: ['shipping'] }).violations
      .map((violation) => violation.rule)).toContain('profile_selected');
  });

  it('collects every violation instead of stopping at the first', () => {
    const result = evaluate({ hasMallCategory: false, imageCount: 0, salePrice: null });
    expect(result.violations.map((violation) => violation.rule)).toEqual(
      expect.arrayContaining(['mall_category_mapped', 'images_present', 'price_positive']),
    );
  });

  it('enforces the per-mall option ceiling', () => {
    const toss = getMallAdapterManifest('toss')!;
    const result = evaluateMallPreflight({
      manifest: toss,
      product: product({ optionNames: Array.from({ length: 301 }, (_, index) => `옵션${index}`) }),
      account: ACCOUNT,
    });
    const violation = result.violations.find((entry) => entry.rule === 'option_count_within_limit');
    expect(violation?.message).toContain('300');
  });

  /**
   * 쿠팡 마켓플레이스는 몰 등록 매니페스트를 떠났지만(KID-250) 그 상한은 실측으로 알아낸
   * 사실이다. 등록을 다시 붙이는 날 조사부터 다시 하지 않도록 점검이 그대로 받는다.
   */
  it('⭐ 마켓 어댑터 사정도 같은 점검을 그대로 받는다 — 쿠팡 옵션 200개 상한', () => {
    const coupang = MARKETPLACE_ADAPTER_NOTES.coupang;
    expect(getMallAdapterManifest('coupang')).toBeNull();
    expect(coupang.limits).toEqual({
      maxPerRequest: 1,
      ratePerSecond: null,
      maxOptionsPerListing: 200,
      minStockValue: null,
    });
    const result = evaluateMallPreflight({
      manifest: coupang,
      product: product({ optionNames: Array.from({ length: 201 }, (_, index) => `옵션${index}`) }),
      account: ACCOUNT,
    });
    const violation = result.violations.find((entry) => entry.rule === 'option_count_within_limit');
    expect(violation?.message).toContain('200');
  });

  /** 로켓은 사입 채널이라 등록 개념이 없다. 마켓 사정으로도 그 판정은 같다. */
  it('⭐ 쿠팡 로켓은 마켓 사정으로 봐도 판매 채널이 아니다', () => {
    const result = evaluateMallPreflight({
      manifest: MARKETPLACE_ADAPTER_NOTES.rocket,
      product: product(),
      account: ACCOUNT,
    });
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.message).toContain('상품 판매 채널이 아닙니다');
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
  it('accepts a certification document that carries a number', () => {
    expect(isKcReady({ kcStatus: 'unknown', certificationNumbers: ['CB061R1234-1001'] })).toBe(true);
    expect(isKcReady({ kcStatus: 'unknown', certificationNumbers: ['', 'CB061R1234-1001'] })).toBe(true);
    expect(isKcReady({ kcStatus: 'unknown', certificationNumbers: [''] })).toBe(false);
    expect(isKcReady({ kcStatus: 'unknown', certificationNumbers: [] })).toBe(false);
  });

  it("'해당 없음' 은 번호가 없어도 통과하고, 'exists' 는 번호를 요구한다", () => {
    expect(isKcReady({ kcStatus: 'none', certificationNumbers: [] })).toBe(true);
    // 있다고 말해 두고 번호를 안 적은 것은 아직 확인하지 않은 것과 같다.
    expect(isKcReady({ kcStatus: 'exists', certificationNumbers: [] })).toBe(false);
    expect(isKcReady({ kcStatus: 'exists', certificationNumbers: ['CB061R1234-1001'] })).toBe(true);
  });
});
