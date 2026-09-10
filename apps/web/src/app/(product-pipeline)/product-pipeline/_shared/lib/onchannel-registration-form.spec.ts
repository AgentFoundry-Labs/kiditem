import { describe, expect, it } from 'vitest';
import {
  buildOnchannelProductName,
  onchannelFormFromDraft,
  ONCHANNEL_KEYWORD_SLOTS,
} from './onchannel-registration-form';
import type { MallProductDraft } from './mall-product-draft';

/**
 * 라이브 실측(2026-09-10, 온채널 CH5280806 / num 12513346)에서 읽은 규칙을 고정한다.
 */
function draft(overrides: Partial<MallProductDraft> = {}): MallProductDraft {
  return {
    candidateId: 'c1',
    displayName: '첼로 모양 지우개 세트',
    sellerProductName: '10500첼로모양지우개세트',
    brand: '노브랜드',
    maker: '해피프랜즈',
    keywords: ['미니어처지우개', '간식지우개', '어린이지우개선물'],
    representativeImageUrl: 'https://cdn/rep.jpg',
    additionalImageUrls: [],
    detailImageUrls: ['https://kiditem.diskn.com/abc'],
    notice: { category: '어린이제품', fields: { 제조국: '중국' } },
    variants: [{
      options: [{ type: '색상', value: '단일' }],
      salePrice: 11760, listPrice: 11760, stock: 50,
      barcode: null, sellerSku: null, representativeImageUrl: 'https://cdn/rep.jpg',
    }],
    sourceCategory: null,
    ...overrides,
  };
}

describe('buildOnchannelProductName', () => {
  it('상품명 + (수량개) + 첫 키워드다', () => {
    // 실측: `첼로 모양 지우개 세트 (18개) 미니어처지우개`
    expect(buildOnchannelProductName('첼로 모양 지우개 세트', ['미니어처지우개'], 18))
      .toBe('첼로 모양 지우개 세트 (18개) 미니어처지우개');
  });

  it('키즈노트의 p 표기도 접두어도 쓰지 않는다', () => {
    const name = buildOnchannelProductName('상품', ['키워드'], 3);
    expect(name).toContain('(3개)');
    expect(name).not.toContain('키드아이템');
    expect(name).not.toContain('3p');
  });
});

describe('onchannelFormFromDraft', () => {
  it('키워드는 같은 이름 칸 열 개에 순서대로 나눠 넣는다', () => {
    // 칸 이름이 전부 `product_subject[]` 하나다. `product_subject[0]` 같은 번호
    // 이름은 화면에 한 칸도 없어서(라이브 실측 2026-09-10) 이름으로 넣으면
    // 열 개가 통째로 사라진다. 그래서 순서로 넣는 자리로 넘긴다.
    const form = onchannelFormFromDraft(draft());
    expect(form.fields['product_subject[0]']).toBeUndefined();
    expect(form.groups.keywords).toEqual(['미니어처지우개', '간식지우개', '어린이지우개선물']);
  });

  it('키워드 칸 수를 넘기지 않는다', () => {
    const many = Array.from({ length: 15 }, (_, i) => `k${i}`);
    const form = onchannelFormFromDraft(draft({ keywords: many }));
    expect(form.groups.keywords).toHaveLength(ONCHANNEL_KEYWORD_SLOTS);
    expect(form.groups.keywords[ONCHANNEL_KEYWORD_SLOTS - 1]).toBe('k9');
  });

  it('배송안내 3칸도 같은 이름이라 순서로 넣는다', () => {
    const form = onchannelFormFromDraft(draft());
    expect(form.fields['product_trans_info[0]']).toBeUndefined();
    expect(form.groups.transInfo).toEqual(['오후 1시', '제조사', '2~3일']);
  });

  it('분류는 코드가 아니라 이름 4단이고, 계단식이라 순서대로 넘긴다', () => {
    // 한꺼번에 넣으면 뒤 세 칸의 목록이 아직 비어 있어 값이 안 들어간다.
    // 그래서 일반 `fields` 가 아니라 순서·대기가 있는 자리로 넘긴다.
    const form = onchannelFormFromDraft(draft(), {
      category: { first: '생활/건강', second: '문구/사무용품', third: '문구용품', fourth: '지우개' },
    });
    expect(form.fields.category_cate_first).toBeUndefined();
    expect(form.selectorFields.categoryFirst).toBe('생활/건강');
    expect(form.selectorFields.categoryFourth).toBe('지우개');
  });

  it('분류를 안 주면 비워 두고 사람에게 넘긴다', () => {
    const form = onchannelFormFromDraft(draft());
    expect(form.selectorFields.categoryFirst).toBe('');
    expect(form.manualSteps.some((s) => s.includes('분류 4단'))).toBe(true);
  });

  it('약관동의 화면의 두 갈래를 고른다 — 안 고르면 다음 단계로 못 간다', () => {
    const form = onchannelFormFromDraft(draft());
    expect(form.radios.product_supp_sec).toBe('1');
    expect(form.radios.product_prd_channel).toBe('1');
    expect(form.checks).toContain('agree_terms');
  });

  it('공급가와 판매가가 따로다 — 역산하지 않는다', () => {
    const noSupply = onchannelFormFromDraft(draft());
    expect(noSupply.fields.option_price).toBe('11760');
    expect(noSupply.fields.onch_price).toBeUndefined();
    expect(noSupply.manualSteps.some((s) => s.includes('공급가'))).toBe(true);

    const withSupply = onchannelFormFromDraft(draft(), { supplyPrice: 10500 });
    expect(withSupply.fields.onch_price).toBe('10500');
  });

  it('KC 인증번호는 상품마다 달라 비워 두고 알린다', () => {
    const form = onchannelFormFromDraft(draft());
    expect(form.fields.kc_sec).toBeUndefined();
    expect(form.manualSteps.some((s) => s.includes('KC 인증번호'))).toBe(true);
    expect(onchannelFormFromDraft(draft(), { kcNumber: 'CB115R0308-5001' }).fields.kc_sec)
      .toBe('CB115R0308-5001');
  });

  it('고시 열일곱 칸을 채운다 — 분류를 고르면 생기는 칸들이다', () => {
    // `notification_cate_num` 이 방아쇠다. 확장이 먼저 고르고 칸이 생기기를 기다린 뒤
    // 채운다. 고르기 전에 넣으면 칸이 없어서 그냥 사라진다.
    const form = onchannelFormFromDraft(draft());
    expect(form.fields.notification_cate_num).toBe('17');
    expect(form.fields.prd_model).toBe('첼로모양지우개세트');
    expect(form.fields.use_age).toBe('상세페이지참조');
    expect(form.fields.kc_type).toBe('[어린이제품]안전확인');
    expect(form.fields.make_con).toBe('중국');
  });

  it('승인 요청을 안 하면 삭제된다고 반드시 알린다', () => {
    // 이 몰에서 가장 비싼 실수다. 등록만 하면 익일 23:59에 사라진다.
    expect(onchannelFormFromDraft(draft()).manualSteps.some((s) => s.includes('익일 23:59')))
      .toBe(true);
  });

  it('상세설명은 온채널 자체 호스팅으로 간다', () => {
    const form = onchannelFormFromDraft(draft());
    expect(form.detailHtmlTarget).toBe('product_contents');
    expect(form.detailUploads).toEqual([{ url: 'https://kiditem.diskn.com/abc' }]);
  });

  it('배송·출고지 고정값이 실측과 같다', () => {
    const form = onchannelFormFromDraft(draft());
    expect(form.fields.product_trans_nm).toBe('CJ 대한통운');
    expect(form.fields.extends_send_price).toBe('3000');
    expect(form.fields.extends_jeju_send_price).toBe('4000');
    expect(form.fields.extends_release_address_id).toBe('181');
  });

  it('신규폼과 수정폼 필드명이 다르다는 걸 지킨다', () => {
    // 수정폼 이름(product_nm·keyword1·input_category_first)을 쓰면 폼이 조용히 빈 채로 남는다.
    const form = onchannelFormFromDraft(draft());
    expect(form.fields.product_name).toBeDefined();
    expect(form.fields.product_nm).toBeUndefined();
    expect(form.fields.keyword1).toBeUndefined();
  });

  it('약관동의를 통과시켰다고 알린다 — 3단계 마법사다', () => {
    expect(onchannelFormFromDraft(draft()).manualSteps.some((s) => s.includes('약관동의')))
      .toBe(true);
  });

  it('제출은 사람이 한다고 알린다', () => {
    expect(onchannelFormFromDraft(draft()).manualSteps.some((s) => s.includes('자동 제출하지 않습니다')))
      .toBe(true);
  });

  it('옵션이 없으면 폼을 만들지 않는다', () => {
    expect(() => onchannelFormFromDraft(draft({ variants: [] }))).toThrow(/옵션/);
  });
});
