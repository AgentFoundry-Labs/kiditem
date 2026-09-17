import { describe, expect, it } from 'vitest';
import {
  BORIBORI_DEFAULT_CATEGORY,
  BORIBORI_MARGIN_RATE,
  BORIBORI_MD_NO,
  BORIBORI_REGISTER_URL,
  BORIBORI_SITE_CODE,
  BORIBORI_STOCK,
  boriboriDiscountRate,
  boriboriFormFromDraft,
  boriboriListPrice,
  buildBoriboriProductName,
} from './boribori-registration-form';
import type { MallProductDraft } from './mall-product-draft';

/**
 * 보리보리(셀러클럽) 폼 빌더.
 *
 * 기대값은 **실측 등록물**(업체상품코드 `435316017`)에서 왔다.
 *   상품명 `킬러볼 스피너 키링 (1p) 스핀 장난감 열쇠고리`
 *   정상가 3,500 / 판매가 2,410 (할인 31%) / 마진율 18 / 재고 999
 *   분류 `241 > 217009 > 217009001` (문구/팬시 > 문구 > 팬시용품)
 */
const draft = (overrides: Partial<MallProductDraft> = {}): MallProductDraft => ({
  candidateId: 'c1',
  displayName: '3500킬러볼스피너키링',
  sellerProductName: '3500킬러볼스피너키링',
  brand: '키드아이템',
  maker: '해피프랜즈',
  keywords: ['스핀', '장난감', '열쇠고리'],
  representativeImageUrl: 'https://cdn.example.com/rep.jpg',
  additionalImageUrls: ['https://cdn.example.com/a1.jpg'],
  detailImageUrls: ['https://kiditem.diskn.com/S8brNL1Xs4'],
  notice: { category: '기타 재화', fields: { 품명및모델명: '킬러볼 스피너 키링' } },
  variants: [
    {
      options: [],
      salePrice: 2410,
      listPrice: 3500,
      stock: 999,
      barcode: null,
      sellerSku: null,
      representativeImageUrl: 'https://cdn.example.com/rep.jpg',
    },
  ],
  sourceCategory: '팬시용품',
  ...overrides,
});

describe('buildBoriboriProductName', () => {
  it('수량이 **괄호 붙은 `(1p)`** 로 들어간다 — 티처몰과 같은 규칙', () => {
    expect(buildBoriboriProductName('3500킬러볼스피너키링', ['스핀', '장난감', '열쇠고리'], 1))
      .toBe('킬러볼스피너키링 (1p) 스핀 장난감 열쇠고리');
  });

  it('키워드는 세 개까지만 붙인다', () => {
    expect(buildBoriboriProductName('키링', ['가', '나', '다', '라'], 2)).toBe('키링 (2p) 가 나 다');
  });
});

describe('boriboriListPrice / boriboriDiscountRate', () => {
  it('원본명 앞의 소비자가를 정상가로 쓴다 — 실측 등록물이 3,500 이었다', () => {
    expect(boriboriListPrice('3500킬러볼스피너키링', 2410)).toBe(3500);
  });

  it('표기가 없거나 판매가보다 낮으면 판매가를 쓴다 — 할인율이 이상해지지 않게', () => {
    expect(boriboriListPrice('킬러볼스피너키링', 2410)).toBe(2410);
    expect(boriboriListPrice('1000키링', 2410)).toBe(2410);
  });

  it('할인율이 실측과 맞는다 — 3,500 → 2,410 은 31%', () => {
    expect(boriboriDiscountRate(3500, 2410)).toBe(31);
    expect(boriboriDiscountRate(2410, 2410)).toBe(0);
  });
});

describe('boriboriFormFromDraft', () => {
  it('신규 등록 화면 주소로 연다', () => {
    expect(boriboriFormFromDraft(draft()).url).toBe(BORIBORI_REGISTER_URL);
    expect(BORIBORI_REGISTER_URL).toContain('seller-club.co.kr');
  });

  /**
   * ⭐⭐ 회귀(실측 2026-09-11): 화면이 **하프클럽으로 열린다.** 사이트를 보리보리로
   * 바꾸지 않으면 1단 분류가 패션 17개라 우리 분류(`241 문구/팬시`)가 **아예 없다.**
   */
  it('⭐⭐ 사이트를 보리보리로 먼저 바꾼다 — 분류 목록이 통째로 갈린다', () => {
    expect(boriboriFormFromDraft(draft()).selectorFields.site).toBe(BORIBORI_SITE_CODE);
    expect(BORIBORI_SITE_CODE).toBe('2');
  });

  it('⭐ 분류 세 단을 모두 담는다 — 계단식이라 확장이 순서대로 넣는다', () => {
    const f = boriboriFormFromDraft(draft()).selectorFields;
    expect(f.category1).toBeTruthy();
    expect(f.category2).toBeTruthy();
    expect(f.category3).toBeTruthy();
  });

  it('기본 분류는 실측 등록물이 쓰던 자리다', () => {
    const f = boriboriFormFromDraft(draft()).selectorFields;
    expect([f.category1, f.category2, f.category3]).toEqual([...BORIBORI_DEFAULT_CATEGORY]);
  });

  it('분류를 직접 주면 그걸 쓴다 — 세 단이 다 있을 때만', () => {
    const f = boriboriFormFromDraft(draft(), { categoryCodes: ['226', '226001', '226001001'] });
    expect(f.selectorFields.category1).toBe('226');
    const short = boriboriFormFromDraft(draft(), { categoryCodes: ['226'] });
    expect(short.selectorFields.category1).toBe(BORIBORI_DEFAULT_CATEGORY[0]);
  });

  it('가격 세 칸을 실측대로 담는다', () => {
    const f = boriboriFormFromDraft(draft()).selectorFields;
    expect(f.listPrice).toBe('3500');
    expect(f.salePrice).toBe('2410');
    expect(f.marginRate).toBe(String(BORIBORI_MARGIN_RATE));
  });

  it('담당MD 를 넣는다 — 없으면 상품을 만들 수 없다고 화면이 못박는다', () => {
    expect(boriboriFormFromDraft(draft()).selectorFields.md).toBe(BORIBORI_MD_NO);
  });

  it('옵션 없는 상품은 단품/단품으로 둔다', () => {
    const f = boriboriFormFromDraft(draft()).selectorFields;
    expect(f.optionName).toBe('단품');
    expect(f.optionValue).toBe('단품');
  });

  it('몰 고정 라디오를 실측값 그대로 담는다', () => {
    const { radios } = boriboriFormFromDraft(draft());
    expect(radios.dispYn).toBe('Y');
    expect(radios.outStockDispYn).toBe('N');
    expect(radios.refundYn).toBe('Y');
    expect(radios.piInfoYn).toBe('N');
  });

  it('배송은 담지 않는다 — 템플릿 하나에 다 묶여 있다', () => {
    const f = boriboriFormFromDraft(draft()).selectorFields;
    for (const key of Object.keys(f)) {
      expect(key).not.toMatch(/delivery|return|dlv|rtrn/i);
    }
  });

  it('대표와 추가 이미지를 나눠 담는다', () => {
    const { imageGroups } = boriboriFormFromDraft(draft());
    expect(imageGroups.representative).toEqual(['https://cdn.example.com/rep.jpg']);
    expect(imageGroups.additional).toEqual(['https://cdn.example.com/a1.jpg']);
  });

  it('빈 이미지 주소는 버린다', () => {
    const { imageGroups } = boriboriFormFromDraft(
      draft({ representativeImageUrl: '  ', additionalImageUrls: ['', 'https://c/a.jpg'] }),
    );
    expect(imageGroups.representative).toEqual([]);
    expect(imageGroups.additional).toEqual(['https://c/a.jpg']);
  });

  it('수식어는 줄 때만 담는다 — 우리 데이터에 없는 값이다', () => {
    expect(boriboriFormFromDraft(draft()).selectorFields.decoWord).toBeUndefined();
    expect(boriboriFormFromDraft(draft(), { decoWord: 'ZZ9' }).selectorFields.decoWord).toBe('ZZ9');
  });

  /**
   * ⭐ 등록이 네 단계다(코드생성 → 상품정보생성 → 상세정보 → 승인요청).
   * 상세설명·고시·원산지 칸은 **저장 뒤에야** 열리므로 이번 회차에는 못 넣는다.
   * 못 넣는 것을 넣은 척하지 않는다 — 안내로 정확히 말한다.
   */
  it('⭐ 저장 뒤에 해야 하는 일을 안내에 남긴다', () => {
    const steps = boriboriFormFromDraft(draft()).manualSteps.join(' ');
    expect(steps).toContain('상세설명');
    expect(steps).toContain('승인요청');
    expect(steps).toContain(String(BORIBORI_STOCK));
    expect(steps).toContain('보리보리');
  });

  /**
   * ⚠️⚠️ 회귀(라이브 2026-09-11, 사장님 화면): 업체상품코드를 안 채워서 **필수 칸이
   * 빈 채로** 남았고 거기서 막혔다. 이 값은 **우리가 정하는 코드**다 — 몰이 주는
   * `상품코드` 는 등록할 때 자동 발급된다. 둘을 헷갈리면 이 칸을 영영 안 채운다.
   */
  it('⭐⭐ 업체상품코드를 채운다 — 필수이고 우리가 정하는 코드다', () => {
    const withSku = draft();
    withSku.variants[0]!.sellerSku = 'KID-5010381620';
    expect(boriboriFormFromDraft(withSku).selectorFields.sellerCode).toBe('KID-5010381620');
    // 직접 준 값이 자체관리코드보다 우선한다.
    expect(boriboriFormFromDraft(withSku, { sellerCode: 'ZZ-1' }).selectorFields.sellerCode).toBe('ZZ-1');
  });

  it('업체상품코드가 없으면 넣지 않고 **비었다고 말한다** — 조용히 넘기지 않는다', () => {
    const form = boriboriFormFromDraft(draft());
    expect(form.selectorFields.sellerCode).toBeUndefined();
    expect(form.manualSteps.join(' ')).toContain('업체상품코드가 비어 있습니다');
  });

  /**
   * ⚠️ 담당MD 칸은 신규 등록에서 `disabled` 다(실측). 우리가 못 넣으므로
   * **못 넣는다고 말해야** 사람이 손댈 곳을 안다.
   */
  it('⭐ 담당MD 는 사람이 고르라고 안내한다 — 칸이 잠겨 있다', () => {
    expect(boriboriFormFromDraft(draft()).manualSteps.join(' ')).toContain('담당MD');
  });

  it('상세 이미지는 주소로 넘긴다 — 2단계에서 사람이 쓴다', () => {
    expect(boriboriFormFromDraft(draft()).detailUploads)
      .toEqual([{ url: 'https://kiditem.diskn.com/S8brNL1Xs4' }]);
  });
});
