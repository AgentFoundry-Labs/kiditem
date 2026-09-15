import { describe, expect, it } from 'vitest';
import {
  KIDKIDS_AS_CONTACT,
  KIDKIDS_DEFAULT_CATEGORY,
  KIDKIDS_KEYWORD_MAX,
  KIDKIDS_NAME_MAX,
  KIDKIDS_REGISTER_URL,
  buildKidkidsProductName,
  buildKidkidsSearchKeywords,
  kidkidsConsumerPrice,
  kidkidsFormFromDraft,
  kidkidsSalePrice,
  kidkidsSupplyPrice,
} from './kidkids-registration-form';
import { KIDITEM_AS_PHONE, type MallProductDraft } from './mall-product-draft';

/**
 * 키드키즈 폼 빌더.
 *
 * 기대값은 **실측 등록물**(2026-09-14)에서 왔다.
 *   1120268 `[키드아이템] 애니멀 회전 주사위 키링 1p 휴대용 주사위 장난감 열쇠고리`
 *           송장용 `3500애니멀회전주사위키링` · 공급 1,776 / 판매 2,220 / 소비자 3,500
 *   1119121 KC `CB117R352-5001` 안전확인 · 고시 어린이제품(42) 13줄
 */
const draft = (overrides: Partial<MallProductDraft> = {}): MallProductDraft => ({
  candidateId: 'c1',
  displayName: '애니멀 회전 주사위 키링',
  sellerProductName: '3500애니멀회전주사위키링',
  brand: '노브랜드',
  maker: '해피프랜즈',
  keywords: ['휴대용', '주사위', '장난감', '열쇠고리', '보드게임'],
  representativeImageUrl: 'https://cdn.example.com/rep.jpg',
  additionalImageUrls: ['https://cdn.example.com/a1.jpg', 'https://cdn.example.com/a2.jpg'],
  detailImageUrls: ['https://cdn.example.com/detail.jpg'],
  notice: {
    category: '어린이제품',
    fields: { 품명및모델명: '애니멀 회전 주사위 키링', 제조국: '중국', 취급방법및주의사항: '상세페이지 참조' },
  },
  variants: [
    {
      options: [],
      salePrice: 2220,
      listPrice: 2220,
      stock: 999,
      barcode: null,
      sellerSku: null,
      representativeImageUrl: 'https://cdn.example.com/rep.jpg',
    },
  ],
  sourceCategory: null,
  ...overrides,
});

describe('buildKidkidsProductName', () => {
  it('접두어 + 이름 + 1p + 키워드 — 실측 등록물 모양', () => {
    expect(buildKidkidsProductName('애니멀 회전 주사위 키링', ['휴대용', '장난감', '열쇠고리'], 1))
      .toBe('[키드아이템] 애니멀 회전 주사위 키링 1p 휴대용 장난감 열쇠고리');
  });

  it('원본명의 가격 접두를 떼고, 이름에 있는 낱말은 다시 붙이지 않는다', () => {
    expect(buildKidkidsProductName('3500킬러볼스피너키링', ['키링', '스핀'], 1))
      .toBe('[키드아이템] 킬러볼스피너키링 1p 스핀');
  });

  it('이름의 일부인 숫자는 가격으로 보고 떼지 않는다 — `3D`', () => {
    expect(buildKidkidsProductName('3D 입체퍼즐', [], 1)).toBe('[키드아이템] 3D 입체퍼즐 1p');
  });

  it('100자를 넘기지 않고 낱말 단위로 뺀다', () => {
    const name = buildKidkidsProductName('가'.repeat(80), ['키워드하나', '키워드둘이다'], 1);
    expect(name.length).toBeLessThanOrEqual(KIDKIDS_NAME_MAX);
    expect(name.endsWith('1p 키워드하나')).toBe(true);
  });
});

describe('buildKidkidsSearchKeywords', () => {
  it('공백으로 잇고 낱말 안 공백은 붙인다 — 실측 `휴대용주사위 주사위키링`', () => {
    expect(buildKidkidsSearchKeywords(['휴대용 주사위', '주사위키링', '주사위키링'])).toBe('휴대용주사위 주사위키링');
  });

  it('75자를 넘기지 않는다', () => {
    const out = buildKidkidsSearchKeywords(Array.from({ length: 30 }, (_, i) => `키워드${i}`));
    expect(out.length).toBeLessThanOrEqual(KIDKIDS_KEYWORD_MAX);
  });
});

describe('가격', () => {
  it('공급가는 판매가의 80% 올림 — 실측 4,430 → 3,544 · 2,530 → 2,024', () => {
    expect(kidkidsSupplyPrice(4430)).toBe(3544);
    // 2530 × 0.8 은 부동소수로 2024.0000000000002 다. 그대로 올리면 2,025 가 된다.
    expect(kidkidsSupplyPrice(2530)).toBe(2024);
    expect(kidkidsSupplyPrice(0)).toBe(0);
  });

  it('판매가 끝자리는 0 으로 내린다 — 화면이 알림으로 막는 값', () => {
    expect(kidkidsSalePrice(2225)).toBe(2220);
    expect(kidkidsSalePrice(1590)).toBe(1590);
  });

  it('소비자가는 원본명 앞 숫자, 판매가 이하면 판매가', () => {
    expect(kidkidsConsumerPrice(['3500애니멀회전주사위키링'], 2220)).toBe(3500);
    expect(kidkidsConsumerPrice(['애니멀', '1000애니멀'], 2220)).toBe(2220);
  });
});

describe('kidkidsFormFromDraft', () => {
  it('등록 화면 주소와 실측 고정값', () => {
    const form = kidkidsFormFromDraft(draft());
    expect(form.url).toBe(KIDKIDS_REGISTER_URL);
    expect(form.fields).toMatchObject({
      goods_name: '[키드아이템] 애니멀 회전 주사위 키링 1p 휴대용 장난감 열쇠고리 보드게임',
      delivery_gname: '3500애니멀회전주사위키링',
      final_cus_price: '3500',
      sales_price: '2220',
      supplier_price: '1776',
      opt_low_qty: '1',
      manufacture_name: '해피프랜즈',
      org_country: '중국',
      as_comment: '7일',
      logis_area: '전국',
      logis_from_day: '2',
      logis_to_day: '3',
    });
    expect(form.radios).toMatchObject({
      tax_type: 'A', optionYN: 'N', only_member: 'N', logis_money_flag_gm: 'Y', today_delivery: 'N',
    });
    expect(form.detailHtmlTarget).toBe('goods_desc');
  });

  it('⭐ 가격 칸 순서 — 판매가 뒤에 공급가가 와야 화면이 공급률을 계산한다', () => {
    const keys = Object.keys(kidkidsFormFromDraft(draft()).fields);
    expect(keys.indexOf('sales_price')).toBeLessThan(keys.indexOf('supplier_price'));
  });

  it('기본 분류는 선물/행사 > 완구선물 > 기타완구, 코드로 바꿀 수 있다', () => {
    expect(kidkidsFormFromDraft(draft()).selectorFields).toMatchObject({
      category1: KIDKIDS_DEFAULT_CATEGORY[0],
      category2: KIDKIDS_DEFAULT_CATEGORY[1],
      category3: KIDKIDS_DEFAULT_CATEGORY[2],
    });
    expect(kidkidsFormFromDraft(draft(), { categoryCodes: ['5', '359', '2554'] }).selectorFields.category3)
      .toBe('2554');
  });

  it('KC 번호가 없으면 인증 미해당 + 고시 기타 재화 5줄', () => {
    const form = kidkidsFormFromDraft(draft());
    expect(form.radios.kc_view).toBe('N');
    expect(form.fields.kc_no).toBeUndefined();
    expect(form.selectorFields.noticeGroup).toBe('54');
    expect(Object.keys(form.infoRows).sort()).toEqual(['373', '374', '375', '376', '377']);
    expect(form.infoRows['373']).toBe('3500애니멀회전주사위키링');
  });

  it('KC 번호가 있으면 안전확인 + 번호 + 연령, 고시 어린이제품 13줄', () => {
    const form = kidkidsFormFromDraft(draft(), { certNumber: 'CB117R352-5001' });
    expect(form.radios.kc_view).toBe('Y');
    expect(form.fields).toMatchObject({ kc_view_flag: 'B', kc_no: 'CB117R352-5001', kc_age: '8세이상' });
    expect(form.selectorFields.noticeGroup).toBe('42');
    expect(Object.keys(form.infoRows)).toHaveLength(13);
    expect(form.infoRows['278']).toBe('CB117R352-5001');
    expect(form.infoRows['282']).toBe('8세이상');
    // '상세페이지 참조' 는 등록물이 쓰는 글자('상세설명참조')로 맞춘다.
    expect(form.infoRows['286']).toBe('상세설명참조');
  });

  /** KC 사용연령은 인증과 같아야 한다. 모양이 달라도 기본 8세로 덮지 않는다. */
  it('⭐ 사용연령 `만 3세 이상` 은 3세이상으로 — 8세로 덮지 않는다', () => {
    const form = kidkidsFormFromDraft(
      draft({ notice: { category: '어린이제품', fields: { 사용연령: '만 3세 이상' } } }),
      { certNumber: 'CB117R352-5001' },
    );
    expect(form.fields.kc_age).toBe('3세이상');
    expect(form.infoRows['282']).toBe('3세이상');
  });

  it('노출 이름의 앞 숫자는 소비자가로 쓰지 않는다 — 셀피아 원본명의 가격만', () => {
    const form = kidkidsFormFromDraft(draft({ displayName: '5000피스 퍼즐', sellerProductName: '퍼즐' }));
    expect(form.fields.final_cus_price).toBe('2220');
  });

  it('상세의 KC 번호도 읽는다', () => {
    const form = kidkidsFormFromDraft(draft({
      notice: { category: '어린이제품', fields: { 안전인증번호: 'CB065R1010-26001', 사용연령: '14세 이상' } },
    }));
    expect(form.fields.kc_no).toBe('CB065R1010-26001');
    expect(form.fields.kc_age).toBe('14세이상');
  });

  it('⭐ AS 책임자는 몰이 정한 키드키즈 고객센터다 — 우리 번호가 아니다', () => {
    for (const form of [kidkidsFormFromDraft(draft()), kidkidsFormFromDraft(draft(), { certNumber: 'X' })]) {
      const values = Object.values(form.infoRows);
      expect(values).toContain(KIDKIDS_AS_CONTACT);
      expect(values.some((value) => value.includes(KIDITEM_AS_PHONE))).toBe(false);
    }
  });

  it('이미지는 대표 1장 + 추가 최대 4장, 칸마다 한 장', () => {
    const form = kidkidsFormFromDraft(draft({
      additionalImageUrls: ['a', 'b', 'c', 'd', 'e', 'https://cdn.example.com/rep.jpg'],
    }));
    expect(form.imageGroups).toEqual({
      main: ['https://cdn.example.com/rep.jpg'], img2: ['a'], img3: ['b'], img4: ['c'], img5: ['d'],
    });
  });
});
