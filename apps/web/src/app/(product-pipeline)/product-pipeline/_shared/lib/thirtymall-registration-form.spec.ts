import { describe, expect, it } from 'vitest';
import {
  THIRTYMALL_DEFAULT_DISPLAY_CATEGORY,
  THIRTYMALL_DEFAULT_MANAGER,
  THIRTYMALL_DEFAULT_STANDARD_CATEGORY,
  THIRTYMALL_DELIVERY_TEMPLATE,
  THIRTYMALL_KEYWORD_MAX_COUNT,
  THIRTYMALL_KEYWORD_MAX_LENGTH,
  THIRTYMALL_NAME_MAX,
  THIRTYMALL_REGISTER_URL,
  buildThirtymallKeywords,
  buildThirtymallProductName,
  thirtymallFormFromDraft,
  thirtymallListPrice,
  thirtymallSupplyPrice,
} from './thirtymall-registration-form';
import type { MallProductDraft } from './mall-product-draft';

/**
 * 떠리몰 폼 빌더.
 *
 * 기대값은 **실측 등록물**에서 왔다(2026-09-11).
 *   `132154869` 야광 안테나 지시봉 (24개) (업체별도 무료배송) — 판매가 28,000 · 즉시할인 11,140
 *   · 즉시할인가 16,860 · 공급가 14,331 · 배송 템플릿 '기본 - 배송비무료' · 고시 기타 재화
 *   · 인증정보 상세페이지 별도 표기 · 담당자 노영우(nogoon92) · 브랜드 kiditem
 */
const draft = (overrides: Partial<MallProductDraft> = {}): MallProductDraft => ({
  candidateId: 'c1',
  displayName: '1000야광 안테나 지시봉',
  sellerProductName: '1000야광 안테나 지시봉',
  brand: '노브랜드',
  maker: '해피프랜즈',
  keywords: ['야간안전용품', '야간시인성', '지시봉'],
  representativeImageUrl: 'https://cdn.example.com/rep.jpg',
  additionalImageUrls: ['https://cdn.example.com/a1.jpg', 'https://cdn.example.com/a2.jpg'],
  detailImageUrls: ['https://cdn.example.com/detail.jpg'],
  notice: { category: '어린이제품', fields: { 품명및모델명: '야광 안테나 지시봉', 제조국: '중국' } },
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
  sourceCategory: '완구',
  ...overrides,
});

describe('buildThirtymallProductName', () => {
  it('묶음은 `(N개)` 를 붙이고 배송 꼬리로 끝난다 — 등록물 모양', () => {
    expect(buildThirtymallProductName('1000야광 안테나 지시봉', 24))
      .toBe('야광 안테나 지시봉 (24개) (업체별도 무료배송)');
  });

  it('낱개는 수량을 적지 않는다 — 낱개 등록물 226개가 그렇다', () => {
    expect(buildThirtymallProductName('크리스마스 선물용품 모음', 1))
      .toBe('크리스마스 선물용품 모음 (업체별도 무료배송)');
  });

  it('길어도 255자를 넘지 않고 배송 꼬리는 남는다', () => {
    const name = buildThirtymallProductName('가'.repeat(400), 12);
    expect(name.length).toBeLessThanOrEqual(THIRTYMALL_NAME_MAX);
    expect(name.endsWith('(12개) (업체별도 무료배송)')).toBe(true);
  });
});

describe('buildThirtymallKeywords', () => {
  it('`, ` 로 잇는다 — 등록물 모양', () => {
    expect(buildThirtymallKeywords(['야간안전용품', '야간시인성'])).toBe('야간안전용품, 야간시인성');
  });

  it('겹치는 낱말과 빈 낱말을 버리고, 낱말 안의 쉼표는 빈칸으로 바꾼다', () => {
    expect(buildThirtymallKeywords(['지시봉', ' ', '지시봉', '야광,안테나'])).toBe('지시봉, 야광 안테나');
  });

  it('30개 · 500자를 넘기지 않는다 — 넘치면 뒤 낱말을 통째로 뺀다', () => {
    const many = Array.from({ length: 60 }, (_, i) => `검색어${i}`);
    expect(buildThirtymallKeywords(many).split(', ')).toHaveLength(THIRTYMALL_KEYWORD_MAX_COUNT);
    const long = Array.from({ length: 30 }, (_, i) => `${'긴'.repeat(20)}${i}`);
    const result = buildThirtymallKeywords(long);
    expect(result.length).toBeLessThanOrEqual(THIRTYMALL_KEYWORD_MAX_LENGTH);
    for (const word of result.split(', ')) expect(long).toContain(word);
  });
});

describe('가격', () => {
  it('판매가는 초안 정상가, 없으면 원본명 앞 숫자, 둘 다 아니면 판매가', () => {
    expect(thirtymallListPrice(draft(), 5060)).toBe(8000);
    const noList = draft({ variants: [{ ...draft().variants[0]!, listPrice: 5060 }] });
    expect(thirtymallListPrice(noList, 5060)).toBe(5060);
    const prefixed = draft({ displayName: '9000야광봉', variants: [{ ...draft().variants[0]!, listPrice: 5060 }] });
    expect(thirtymallListPrice(prefixed, 5060)).toBe(9000);
  });

  /** 화면과 같은 식이어야 한다. 실측 5,060 → 4,301 · 등록물 16,860 → 14,331. */
  it('공급가가 화면·등록물과 맞는다', () => {
    expect(thirtymallSupplyPrice(5060)).toBe(4301);
    expect(thirtymallSupplyPrice(16860)).toBe(14331);
    expect(thirtymallSupplyPrice(0)).toBe(0);
  });
});

describe('thirtymallFormFromDraft', () => {
  it('신규 등록 화면 주소로 연다 — 겉 주소다(폼은 그 안 iframe)', () => {
    expect(thirtymallFormFromDraft(draft()).url).toBe(THIRTYMALL_REGISTER_URL);
  });

  /**
   * ⭐ 즉시할인가가 우리 판매가가 되게 넣는다. 등록물 479개가 전부 판매가 − 즉시할인 모양이다.
   */
  it('⭐ 판매가 = 정상가, 즉시할인 = 정상가 − 판매가 → 즉시할인가가 우리 판매가', () => {
    const { tableFields } = thirtymallFormFromDraft(draft());
    expect(tableFields.판매가).toBe('8000');
    expect(tableFields.즉시할인).toBe('2940');
  });

  it('할인할 몫이 없으면 즉시할인 칸을 건드리지 않는다', () => {
    const flat = draft({ displayName: '야광봉', variants: [{ ...draft().variants[0]!, listPrice: 5060 }] });
    const { tableFields } = thirtymallFormFromDraft(flat);
    expect(tableFields.판매가).toBe('5060');
    expect(tableFields.즉시할인).toBeUndefined();
  });

  it('상품명·검색어·재고를 줄 제목으로 담는다', () => {
    const { tableFields } = thirtymallFormFromDraft(draft(), { quantity: 24 });
    expect(tableFields.상품명).toBe('야광 안테나 지시봉 (24개) (업체별도 무료배송)');
    expect(tableFields.검색어).toBe('야간안전용품, 야간시인성, 지시봉');
    expect(tableFields.재고수량).toBe('999');
  });

  it('등록물 고정값 — 옵션 안 씀 · 인증정보 상세페이지 별도 표기 · 고시 사용함 · 배송비무료 템플릿', () => {
    const { tableRadios, tableSelects } = thirtymallFormFromDraft(draft());
    expect(tableRadios['옵션 사용 여부']).toBe('N');
    expect(tableRadios.인증정보).toBe('DETAIL_PAGE');
    expect(tableRadios.상품정보제공고시).toBe('USED');
    expect(tableSelects['배송 템플릿']).toBe(THIRTYMALL_DELIVERY_TEMPLATE);
  });

  /**
   * 검색해서 고르는 칸은 순서가 있다. 검색칸에는 이름(끝 이름)만 넣고, 목록에서는
   * 뜨는 글자 그대로 고른다.
   */
  it('담당자·분류·브랜드는 검색어와 고를 글자를 따로 담는다', () => {
    const { tablePicks } = thirtymallFormFromDraft(draft());
    expect(tablePicks.map((pick) => pick.row)).toEqual(['담당자', '표준카테고리', '전시카테고리', '브랜드']);
    expect(tablePicks[0]).toEqual({ row: '담당자', query: '노영우', pick: THIRTYMALL_DEFAULT_MANAGER });
    expect(tablePicks[1]).toEqual({
      row: '표준카테고리',
      query: '데코용품',
      pick: THIRTYMALL_DEFAULT_STANDARD_CATEGORY,
    });
    expect(tablePicks[2]?.pick).toBe(THIRTYMALL_DEFAULT_DISPLAY_CATEGORY);
    expect(tablePicks[3]).toEqual({ row: '브랜드', query: 'kiditem', pick: 'kiditem' });
  });

  it('⚠️ 옛 등록물의 엉뚱한 표준분류(니트/스웨터)를 기본값으로 쓰지 않는다', () => {
    expect(THIRTYMALL_DEFAULT_STANDARD_CATEGORY).not.toContain('니트');
  });

  it('분류와 담당자를 직접 주면 그걸 쓴다', () => {
    const { tablePicks } = thirtymallFormFromDraft(draft(), {
      standardCategory: '출산/육아>완구/매트>RC/작동완구>RC카',
      manager: '홍길동(hong)',
    });
    expect(tablePicks[0]).toEqual({ row: '담당자', query: '홍길동', pick: '홍길동(hong)' });
    expect(tablePicks[1]).toEqual({
      row: '표준카테고리',
      query: 'RC카',
      pick: '출산/육아>완구/매트>RC/작동완구>RC카',
    });
  });

  it('대표·리스트 이미지는 대표, 추가이미지는 추가 썸네일 — 등록물과 같다', () => {
    const { imageGroups } = thirtymallFormFromDraft(draft());
    expect(imageGroups.main).toEqual(['https://cdn.example.com/rep.jpg']);
    expect(imageGroups.list).toEqual(['https://cdn.example.com/rep.jpg']);
    expect(imageGroups.additional).toEqual(['https://cdn.example.com/a1.jpg', 'https://cdn.example.com/a2.jpg']);
  });

  it('상세설명 이미지를 몰에 올리도록 넘긴다', () => {
    expect(thirtymallFormFromDraft(draft()).detailUploads).toEqual([{ url: 'https://cdn.example.com/detail.jpg' }]);
  });

  it('⭐ 고시는 새 창이라 사람이 넣고, 저장도 사람이 한다고 안내한다', () => {
    const steps = thirtymallFormFromDraft(draft()).manualSteps.join(' ');
    expect(steps).toContain('새 창');
    expect(steps).toContain('기타 재화');
    expect(steps).toContain('사람이 직접 저장');
  });
});
