import { describe, expect, it } from 'vitest';
import {
  SSG_DEFAULT_DISPLAY_CATEGORY,
  SSG_DEFAULT_STANDARD_CATEGORY,
  SSG_KEYWORD_MAX,
  SSG_MAX_IMAGES,
  SSG_NAME_MAX_BYTES,
  SSG_NOTICE_CLASS,
  SSG_NOTICE_PROP,
  SSG_REGISTER_URL,
  buildSsgProductName,
  buildSsgSearchKeywords,
  parseSsgCategory,
  ssgByteLength,
  ssgFormFromDraft,
  ssgSupplyPrice,
} from './ssg-registration-form';
import { KIDITEM_AS_PHONE, type MallProductDraft } from './mall-product-draft';

/**
 * 신세계 폼 빌더.
 *
 * 기대값은 **실측 등록물**(2026-09-14, 최근 3개월 45개)에서 왔다.
 *   1000850269603 `만두 쫀뜩 말랑이 1p 주물럭 스트레스볼 스퀴시`
 *                 판매 2,600 · 마진 15 · 공급 2,009 · 고시 기타 품명 `4000만두쫀뜩말랑이`
 */
const draft = (overrides: Partial<MallProductDraft> = {}): MallProductDraft => ({
  candidateId: 'c1',
  displayName: '만두 쫀뜩 말랑이',
  sellerProductName: '4000만두쫀뜩말랑이',
  brand: '노브랜드',
  maker: '해피프랜즈',
  keywords: ['주물럭', '스트레스볼', '스퀴시', '말랑이', '완구'],
  representativeImageUrl: 'https://cdn.example.com/rep.jpg',
  additionalImageUrls: ['https://cdn.example.com/a1.jpg', 'https://cdn.example.com/rep.jpg'],
  detailImageUrls: ['http://localhost:9000/kiditem/detail.jpg'],
  notice: { category: '어린이제품', fields: { 제조국: '중국' } },
  variants: [
    {
      options: [],
      salePrice: 2600,
      listPrice: 2600,
      stock: 999,
      barcode: null,
      sellerSku: null,
      representativeImageUrl: 'https://cdn.example.com/rep.jpg',
    },
  ],
  sourceCategory: null,
  ...overrides,
});

describe('buildSsgProductName', () => {
  it('이름 + 1p + 키워드, 접두어 없음 — 실측 등록물 모양', () => {
    expect(buildSsgProductName('만두 쫀뜩 말랑이', ['주물럭', '스트레스볼', '스퀴시'], 1))
      .toBe('만두 쫀뜩 말랑이 1p 주물럭 스트레스볼 스퀴시');
  });

  it('원본명의 가격 접두는 떼고, 이름의 일부인 숫자는 남긴다', () => {
    expect(buildSsgProductName('4000만두쫀뜩말랑이', ['말랑이'], 1)).toBe('만두쫀뜩말랑이 1p');
    expect(buildSsgProductName('3D 입체퍼즐', [], 1)).toBe('3D 입체퍼즐 1p');
  });

  it('⭐ 화면이 세는 byte(한글 2) 상한을 넘기지 않는다 — 넘치면 저장이 막힌다', () => {
    const name = buildSsgProductName('가'.repeat(40), ['키워드하나', '키워드둘이다'], 1);
    expect(ssgByteLength(name)).toBeLessThanOrEqual(SSG_NAME_MAX_BYTES);
    expect(ssgByteLength('가a')).toBe(3);
  });
});

describe('buildSsgSearchKeywords', () => {
  it('쉼표로 잇고 낱말 안 공백·중복은 없앤다', () => {
    expect(buildSsgSearchKeywords(['스트레스 볼', '스퀴시', '스퀴시', '완구'])).toBe('스트레스볼,스퀴시,완구');
  });

  it('등록물처럼 10개까지만', () => {
    const out = buildSsgSearchKeywords(Array.from({ length: 15 }, (_, i) => `키워드${i}`));
    expect(out.split(',')).toHaveLength(SSG_KEYWORD_MAX);
  });
});

describe('ssgSupplyPrice', () => {
  it('판매가 × (1 − 마진) ÷ 1.1 — 등록물 값과 같다', () => {
    expect(ssgSupplyPrice(2600)).toBe(2009);
    expect(ssgSupplyPrice(2280)).toBe(1762);
    expect(ssgSupplyPrice(11680)).toBe(9025);
    expect(ssgSupplyPrice(0)).toBe(0);
  });
});

describe('parseSsgCategory', () => {
  it('`번호:이름` 을 받는다', () => {
    expect(parseSsgCategory('6000161769:보드게임')).toEqual({ id: '6000161769', keyword: '보드게임', label: '보드게임' });
    expect(parseSsgCategory(' 1000022578 | 패션.잡화 ')).toMatchObject({ id: '1000022578', keyword: '패션.잡화' });
  });

  it('모양이 틀리면 null', () => {
    expect(parseSsgCategory('보드게임')).toBeNull();
    expect(parseSsgCategory('12:완구')).toBeNull();
    expect(parseSsgCategory('')).toBeNull();
  });
});

describe('ssgFormFromDraft', () => {
  it('⭐ 새 등록 화면 주소 — 쿼리가 붙으면 기존 상품 수정 화면이다', () => {
    expect(ssgFormFromDraft(draft()).url).toBe(SSG_REGISTER_URL);
    expect(SSG_REGISTER_URL).not.toContain('?');
  });

  it('등록물 고정값: 신세계몰 · 키드아이템 · 마진 15 · 재고 999 · 배송비 두 정책', () => {
    const { ssg } = ssgFormFromDraft(draft());
    expect(ssg).toMatchObject({
      // `말랑이` 는 이름에 이미 있어 다시 붙이지 않는다.
      itemName: '만두 쫀뜩 말랑이 1p 주물럭 스트레스볼 스퀴시 완구',
      brandName: '키드아이템',
      siteNo: '6004',
      salePrice: 2600,
      marginRate: 15,
      stock: 999,
      modelName: '4000만두쫀뜩말랑이',
      manufacturer: '해피프랜즈',
      originCountry: '중국',
    });
    expect(ssg.displayCategory).toEqual({ id: SSG_DEFAULT_DISPLAY_CATEGORY.id, keyword: SSG_DEFAULT_DISPLAY_CATEGORY.keyword });
    expect(ssg.standardCategory).toEqual({ id: SSG_DEFAULT_STANDARD_CATEGORY.id, keyword: SSG_DEFAULT_STANDARD_CATEGORY.keyword });
    expect(ssg.shipping.fees.map((fee) => fee.feeId)).toEqual(['0000621476', '0000621477']);
    expect(ssg.shipping).toMatchObject({ leadDays: 3, outboundAddrId: '0006820704', returnAddrId: '0006820707' });
  });

  it('KC 번호가 없으면 고시 기타 — 품명은 셀피아 원본명, A/S 는 우리 번호', () => {
    const { notice } = ssgFormFromDraft(draft()).ssg;
    expect(notice.classId).toBe(SSG_NOTICE_CLASS.기타);
    expect(notice.values).toEqual({
      [SSG_NOTICE_PROP.품명및모델명]: '4000만두쫀뜩말랑이',
      [SSG_NOTICE_PROP.인증허가]: '상세설명 참조',
      [SSG_NOTICE_PROP.수입자]: '해피프랜즈',
      [SSG_NOTICE_PROP.AS책임자]: KIDITEM_AS_PHONE,
    });
    expect(notice).toMatchObject({ importPropId: SSG_NOTICE_PROP.수입여부, importYn: 'Y' });
  });

  it('KC 번호가 있으면 고시 어린이제품 12줄', () => {
    const { ssg, manualSteps } = ssgFormFromDraft(draft(), { certNumber: 'CB117R352-5001' });
    expect(ssg.notice.classId).toBe(SSG_NOTICE_CLASS.어린이제품);
    expect(Object.keys(ssg.notice.values)).toHaveLength(12);
    expect(ssg.notice.values[SSG_NOTICE_PROP.어린이제품인증대상]).toContain('CB117R352-5001');
    // 인증정보 표는 아직 사람이 넣는다고 분명히 말한다.
    expect(manualSteps.some((step) => step.includes('인증정보'))).toBe(true);
  });

  it('카테고리는 사람이 고른 것으로 바꿀 수 있다', () => {
    const { ssg } = ssgFormFromDraft(draft(), {
      displayCategory: { id: '6000161769', keyword: '보드게임', label: '보드게임' },
      standardCategory: { id: '1000022580', keyword: '퍼즐/보드게임', label: '퍼즐/보드게임' },
    });
    expect(ssg.displayCategory).toEqual({ id: '6000161769', keyword: '보드게임' });
    expect(ssg.standardCategory).toEqual({ id: '1000022580', keyword: '퍼즐/보드게임' });
  });

  it('이미지는 대표가 첫 장, 중복 없이 10장까지', () => {
    const many = Array.from({ length: 14 }, (_, i) => `https://cdn.example.com/${i}.jpg`);
    const form = ssgFormFromDraft(draft({ additionalImageUrls: ['https://cdn.example.com/rep.jpg', ...many] }));
    expect(form.imageGroups.ssg[0]).toBe('https://cdn.example.com/rep.jpg');
    expect(form.imageGroups.ssg).toHaveLength(SSG_MAX_IMAGES);
    expect(new Set(form.imageGroups.ssg).size).toBe(SSG_MAX_IMAGES);
  });

  it('상세 이미지는 확장이 몰 서버에 올리도록 원본 주소로 넘긴다', () => {
    expect(ssgFormFromDraft(draft()).detailUploads).toEqual([{ url: 'http://localhost:9000/kiditem/detail.jpg' }]);
  });
});
