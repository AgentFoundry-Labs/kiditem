import { describe, expect, it } from 'vitest';
import {
  KKOMANGSE_DEFAULT_CATEGORY,
  KKOMANGSE_HASHTAG_MAX,
  KKOMANGSE_REGISTER_URL,
  buildKkomangseHashtags,
  buildKkomangseProductName,
  kkomangseFormFromDraft,
  kkomangseListPrice,
  kkomangseSupplyPrice,
} from './kkomangse-registration-form';
import type { MallProductDraft } from './mall-product-draft';

/**
 * 꼬망세몰 폼 빌더.
 *
 * 기대값은 **실측 등록물**(`_code=H7984-C3488-G2602`)에서 왔다.
 *   상품명 `전동 오토 버블건 1p 비눗방울 비누방울`
 *   정상가 8,000 / 판매가 5,060 / 납품가 4,301 (수수료 15%)
 *   해시태그 아홉 개 44자 · 제조사 해피프랜즈 · 원산지 중국 · KC `CB065R2807-5003`
 */
const draft = (overrides: Partial<MallProductDraft> = {}): MallProductDraft => ({
  candidateId: 'c1',
  displayName: '8000전동오토버블건',
  sellerProductName: '8000전동오토버블건',
  brand: '노브랜드',
  maker: '해피프랜즈',
  keywords: ['비눗방울', '비누방울', '버블'],
  representativeImageUrl: 'https://cdn.example.com/rep.jpg',
  additionalImageUrls: ['https://cdn.example.com/a1.jpg', 'https://cdn.example.com/a2.jpg'],
  detailImageUrls: ['https://cdn.example.com/detail.jpg'],
  notice: { category: '어린이제품', fields: { 품명및모델명: '전동 오토 버블건', 제조국: '중국' } },
  variants: [
    {
      options: [],
      salePrice: 5060,
      listPrice: 8000,
      stock: 999,
      barcode: null,
      sellerSku: null,
      representativeImageUrl: 'https://cdn.example.com/rep.jpg',
    },
  ],
  sourceCategory: '비누방울',
  ...overrides,
});

describe('buildKkomangseProductName', () => {
  it('수량이 괄호 없이 `1p` 로 들어간다 — 실측 등록물과 같은 규칙', () => {
    expect(buildKkomangseProductName('8000전동오토버블건', ['비눗방울', '비누방울'], 1))
      .toBe('전동오토버블건 1p 비눗방울 비누방울');
  });

  it('키워드는 세 개까지만 붙인다', () => {
    expect(buildKkomangseProductName('버블건', ['가', '나', '다', '라'], 2)).toBe('버블건 2p 가 나 다');
  });
});

describe('buildKkomangseHashtags', () => {
  it('쉼표로 잇는다 — 실측 등록물 모양', () => {
    expect(buildKkomangseHashtags(['비눗방울', '비누방울', '버블'])).toBe('비눗방울,비누방울,버블');
  });

  it('낱말 안의 쉼표는 빈칸으로 바꾼다 — 구분자와 섞이지 않게', () => {
    expect(buildKkomangseHashtags(['키링,전통', '민화'])).toBe('키링 전통,민화');
  });

  it('겹치는 태그와 빈 태그를 버린다', () => {
    expect(buildKkomangseHashtags(['버블', ' ', '버블', '물총'])).toBe('버블,물총');
  });

  it('200자를 넘기지 않는다 — 넘치면 뒤의 낱말을 통째로 뺀다', () => {
    const many = Array.from({ length: 80 }, (_, i) => `태그${i}`);
    const result = buildKkomangseHashtags(many);
    expect(result.length).toBeLessThanOrEqual(KKOMANGSE_HASHTAG_MAX);
    // 반쪽 낱말이 남지 않는다.
    for (const tag of result.split(',')) expect(many).toContain(tag);
  });
});

describe('kkomangseListPrice / kkomangseSupplyPrice', () => {
  it('원본명 앞의 소비자가를 정상가로 쓴다 — 실측 8,000', () => {
    expect(kkomangseListPrice('8000전동오토버블건', 5060)).toBe(8000);
  });

  it('표기가 없거나 판매가보다 낮으면 판매가를 쓴다', () => {
    expect(kkomangseListPrice('전동오토버블건', 5060)).toBe(5060);
    expect(kkomangseListPrice('1000버블건', 5060)).toBe(5060);
  });

  /**
   * 화면의 `calcSupplyFromPrice` 와 같은 식이어야 한다:
   * `판매가 − round(판매가 × 수수료율)`. 실측 등록물 5,060 → 4,301.
   */
  it('납품가가 실측과 맞는다 — 5,060 → 4,301', () => {
    expect(kkomangseSupplyPrice(5060)).toBe(4301);
    expect(kkomangseSupplyPrice(0)).toBe(0);
  });
});

describe('kkomangseFormFromDraft', () => {
  it('신규 등록 화면 주소로 연다', () => {
    expect(kkomangseFormFromDraft(draft()).url).toBe(KKOMANGSE_REGISTER_URL);
  });

  /**
   * ⭐ 저장되는 가격은 판매가(`_price`) 하나다. 납품가 칸은 "저장하지 않는 계산용"
   * 이라 넣어 봐야 소용없다 — 화면이 판매가로 다시 계산해 덮는다.
   */
  it('⭐ 판매가와 정상가만 담는다 — 납품가는 화면이 계산하는 칸이다', () => {
    const { fields } = kkomangseFormFromDraft(draft());
    expect(fields._price).toBe('5060');
    expect(fields._screenPrice).toBe('8000');
    expect(fields._supplyPrice).toBeUndefined();
  });

  it('상품명·해시태그·제조사·원산지를 실측 칸 이름으로 담는다', () => {
    const { fields } = kkomangseFormFromDraft(draft());
    expect(fields._name).toBe('전동오토버블건 1p 비눗방울 비누방울 버블');
    expect(fields._hashtag).toBe('비눗방울,비누방울,버블');
    expect(fields._maker).toBe('해피프랜즈');
    // 몰의 칸 이름이 `_orgin` 이다(오타 그대로).
    expect(fields._orgin).toBe('중국');
  });

  it('원산지를 모르면 넣지 않는다 — 지어내지 않는다', () => {
    const { fields } = kkomangseFormFromDraft(
      draft({ notice: { category: '어린이제품', fields: {} } }),
    );
    expect(fields._orgin).toBeUndefined();
  });

  it('KC 번호가 있으면 인증 + 번호, 없으면 미인증', () => {
    const withCert = draft();
    withCert.notice.fields.안전인증번호 = 'CB065R2807-5003';
    const certified = kkomangseFormFromDraft(withCert);
    expect(certified.radios._kc_yn).toBe('Y');
    expect(certified.fields._kc_num).toBe('CB065R2807-5003');

    const bare = kkomangseFormFromDraft(draft());
    expect(bare.radios._kc_yn).toBe('N');
    expect(bare.fields._kc_num).toBeUndefined();
  });

  it('기본 분류는 선물용품 > 장난감/완구 다', () => {
    const { selectorFields } = kkomangseFormFromDraft(draft());
    expect([selectorFields.category1, selectorFields.category2, selectorFields.category3])
      .toEqual([...KKOMANGSE_DEFAULT_CATEGORY]);
  });

  it('분류를 직접 주면 그걸 쓴다 — 세 단이 다 있을 때만', () => {
    const direct = kkomangseFormFromDraft(draft(), { categoryCodes: ['278', '279', '289'] });
    expect(direct.selectorFields.category3).toBe('289');
    const short = kkomangseFormFromDraft(draft(), { categoryCodes: ['278'] });
    expect(short.selectorFields.category3).toBe(KKOMANGSE_DEFAULT_CATEGORY[2]);
  });

  it('몰 고정 라디오를 실측값 그대로 담는다', () => {
    const { radios } = kkomangseFormFromDraft(draft());
    expect(radios._view).toBe('Y');
    expect(radios._option_type_chk).toBe('nooption');
    expect(radios.p_vat).toBe('Y');
    expect(radios._shoppingPay_use).toBe('N');
  });

  it('배송 금액 칸은 담지 않는다 — 업체별 정책을 따른다', () => {
    const { fields } = kkomangseFormFromDraft(draft());
    for (const key of Object.keys(fields)) expect(key).not.toMatch(/shoppingPay/);
  });

  /**
   * ⭐ 상세 이미지 1 이 상품 페이지의 큰 사진이다(매장 화면 실측). 대표가 거기 나와야
   * 한다. 추가 썸네일은 오버와 상세 2~5 에 들어간다.
   */
  it('⭐ 상세 1 은 대표, 추가 썸네일은 상세 2~5 로 간다', () => {
    const { imageGroups } = kkomangseFormFromDraft(draft());
    expect(imageGroups.square).toEqual(['https://cdn.example.com/rep.jpg']);
    expect(imageGroups.swipe).toEqual(['https://cdn.example.com/rep.jpg']);
    expect(imageGroups.over).toEqual(['https://cdn.example.com/a1.jpg']);
    expect(imageGroups.gallery).toEqual([
      'https://cdn.example.com/a1.jpg',
      'https://cdn.example.com/a2.jpg',
    ]);
  });

  it('상세 이미지는 다섯 칸이라 추가 썸네일은 네 장까지만 넣는다', () => {
    const many = Array.from({ length: 7 }, (_, i) => `https://cdn.example.com/a${i}.jpg`);
    const { imageGroups } = kkomangseFormFromDraft(draft({ additionalImageUrls: many }));
    expect(imageGroups.gallery).toEqual(many.slice(0, 4));
  });

  it('추가 썸네일이 없으면 오버와 상세 2~5 는 비운다 — 대표를 되풀이하지 않는다', () => {
    const { imageGroups } = kkomangseFormFromDraft(draft({ additionalImageUrls: [] }));
    expect(imageGroups.swipe).toEqual(['https://cdn.example.com/rep.jpg']);
    expect(imageGroups.over).toEqual([]);
    expect(imageGroups.gallery).toEqual([]);
  });

  it('⭐ 저장은 사람이 한다고 안내에 남긴다', () => {
    const steps = kkomangseFormFromDraft(draft()).manualSteps.join(' ');
    expect(steps).toContain('선택 카테고리 추가');
    expect(steps).toContain('사람이 직접 저장');
  });
});
