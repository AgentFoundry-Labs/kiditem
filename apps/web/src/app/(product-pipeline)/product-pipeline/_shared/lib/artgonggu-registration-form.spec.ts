import { describe, expect, it } from 'vitest';
import {
  artgongguFormFromDraft,
  buildArtgongguProductName,
  parseCategoryPath,
} from './artgonggu-registration-form';
import type { MallProductDraft } from './mall-product-draft';

/**
 * 아트공구(Cafe24) 폼.
 *
 * 값은 실제 등록물에서 읽어온 것이다(라이브 실측 2026-09-10, 상품 123858).
 */
const draft = (overrides: Partial<MallProductDraft> = {}): MallProductDraft => ({
  candidateId: 'c1',
  displayName: '15000컬러와이드LCD전자메모보드(15인치)',
  sellerProductName: '15000컬러와이드LCD전자메모보드(15인치)',
  brand: '해피프렌즈',
  maker: '해피프렌즈',
  keywords: ['스마트만능패드', '전자보드', '전자칠판', '컬러메모보드'],
  representativeImageUrl: 'https://cdn/rep.jpg',
  additionalImageUrls: [],
  detailImageUrls: ['https://kiditem.diskn.com/m87ThsZDcW'],
  notice: { category: '어린이제품', fields: {} },
  variants: [{
    options: [], salePrice: 9490, listPrice: 15000, stock: 9999,
    barcode: null, sellerSku: null, representativeImageUrl: 'https://cdn/rep.jpg',
  }],
  ...overrides,
} as unknown as MallProductDraft);

describe('artgongguFormFromDraft', () => {
  it('상품명은 접두어 + 상품명 + 수량 + 키워드다', () => {
    // 실측: `[펜시네550] 컬러 와이드 LCD 전자 메모보드 (15인치)1p 대형 컬러전자칠판`
    const name = buildArtgongguProductName('15000컬러와이드LCD', ['전자보드', '전자칠판'], 1, '[펜시네550]');
    expect(name.startsWith('[펜시네550] 컬러와이드LCD 1p')).toBe(true);
  });

  it('상품명에서 소비자가 접두어를 뗀다 — 몰마다 상품명이 다르다', () => {
    const form = artgongguFormFromDraft(draft(), { namePrefix: '[펜시네550]' });
    expect(form.fields.product_name).not.toContain('15000컬러와이드');
    expect(form.fields.product_name.startsWith('[펜시네550]')).toBe(true);
  });

  it('내부 조회용 이름에는 원본명을 그대로 남긴다', () => {
    // `item_name` 은 구매자에게 안 보이는 조회용이라 셀피아 원본명이 그대로 들어간다.
    const form = artgongguFormFromDraft(draft());
    expect(form.fields.item_name).toBe('15000컬러와이드LCD전자메모보드(15인치)');
    expect(form.fields.purchase_prd_name).toBe('15000컬러와이드LCD전자메모보드(15인치)');
  });

  it('키워드는 콤마로 잇는다 — 이 몰은 칸이 하나다', () => {
    // 도매꾹은 10칸, 온채널은 10칸, 여기는 `product_tag` 한 칸이다.
    expect(artgongguFormFromDraft(draft()).fields.product_tag)
      .toBe('스마트만능패드,전자보드,전자칠판,컬러메모보드');
  });

  it('대표이미지는 한 장만 넘긴다 — Cafe24 가 네 크기를 만든다', () => {
    // 화면에는 네 칸이 있지만 파일 한 번이면 몰이 크기를 만든다(라이브 확인).
    const form = artgongguFormFromDraft(draft());
    expect(form.imageUrls).toEqual(['https://cdn/rep.jpg']);
  });

  it('대표이미지가 없으면 빈 목록이다 — 아무 이미지로 채우지 않는다', () => {
    const form = artgongguFormFromDraft(draft({ representativeImageUrl: '' }));
    expect(form.imageUrls).toEqual([]);
    expect(form.manualSteps.some((s) => s.includes('대표이미지가 없습니다'))).toBe(true);
  });

  it('상품분류는 이름 경로로 쪼갠다', () => {
    expect(parseCategoryPath('*완구/선물/행사용품 > 완구/선물 > 팬시/놀이완구'))
      .toEqual(['*완구/선물/행사용품', '완구/선물', '팬시/놀이완구']);
  });

  it('분류 이름에 슬래시가 있어도 나뉘지 않는다', () => {
    // `*완구/선물/행사용품` 처럼 이름 자체에 `/` 가 많다. 구분자는 `>` 뿐이다.
    expect(parseCategoryPath('*화방/문구 > 물감/파레트')).toEqual(['*화방/문구', '물감/파레트']);
  });

  it('분류를 안 고르면 사람에게 넘긴다 — 이 몰은 필수다', () => {
    expect(artgongguFormFromDraft(draft()).manualSteps.some((s) => s.includes('분류가 필수')))
      .toBe(true);
  });

  it('상세설명 원본을 그대로 넘긴다 — 올리는 것은 확장이 한다', () => {
    // 확장이 이 주소에서 읽어 Cafe24 편집기 파일매니저에 올린다.
    const form = artgongguFormFromDraft(draft());
    expect(form.detailHtmlTarget).toBe('product_description');
    expect(form.detailUploads).toEqual([{ url: 'https://kiditem.diskn.com/m87ThsZDcW' }]);
  });

  it('진열함·판매함으로 넣는다', () => {
    const form = artgongguFormFromDraft(draft());
    expect(form.radios['is_display[1]']).toBe('T');
    expect(form.radios['selling_status[1]']).toBe('T');
  });

  it('배송·과세 기본값이 실측과 같다', () => {
    const form = artgongguFormFromDraft(draft());
    expect(form.fields.ship_fee).toBe('3000.00');
    expect(form.fields.delivery_start).toBe('2');
    expect(form.fields.prd_tax_type_per).toBe('10');
    expect(form.fields.made_in).toBe('중국OEM');
  });

  it('옵션이 없으면 폼을 만들지 않는다', () => {
    expect(() => artgongguFormFromDraft(draft({ variants: [] }))).toThrow(/옵션/);
  });

  it('소비자가는 상품명 앞 숫자에서 읽는다', () => {
    // 셀피아 원본명이 `3000감정잔디인형` 처럼 소비자가로 시작한다. 등록물 두 건이
    // 그 숫자를 그대로 들고 있었다(3000 · 15000).
    const form = artgongguFormFromDraft(draft({ displayName: '3000감정잔디인형' }));
    expect(form.fields['product_custom[1]']).toBe('3000');
    // 몰 상품명에서는 뗀다.
    expect(form.fields.product_name).not.toContain('3000감정');
  });

  it('숫자로 시작하지 않으면 소비자가를 지어내지 않는다', () => {
    const form = artgongguFormFromDraft(draft({ displayName: '감정잔디인형' }));
    expect(form.fields['product_custom[1]']).toBeUndefined();
    expect(form.manualSteps.some((s) => s.includes('소비자가를 상품명에서'))).toBe(true);
  });

  it('공급가는 사람이 넣는다 — 두 건으로 비율을 굳히지 않는다', () => {
    // 실측 두 건 모두 소비자가의 약 53.8% 였지만, 잘못 넣으면 매입 단가가 틀어진다.
    const empty = artgongguFormFromDraft(draft());
    expect(empty.fields.product_buy).toBeUndefined();
    expect(empty.manualSteps.some((s) => s.includes('공급가가 비어'))).toBe(true);

    const filled = artgongguFormFromDraft(draft(), { supplyPrice: 1615 });
    expect(filled.fields.product_buy).toBe('1615');
    expect(filled.manualSteps.some((s) => s.includes('공급가가 비어'))).toBe(false);
  });

  it('신규 폼 기본값과 다른 칸을 덮어쓴다', () => {
    // 손대지 않으면 등록물과 달라지는 칸들이다(라이브 대조: 신규 폼 vs 등록물 28곳).
    const form = artgongguFormFromDraft(draft());
    expect(form.fields.mobile_img_resize1).toBe('640');
    expect(form.fields['margin_rate[0]']).toBe('0.00');
    expect(form.fields.product_weight).toBe('1.00');
    expect(form.fields.is_option_setting).toBe('F');
    expect(form.radios.global_shipping).toBe('F');
    expect(form.checks['supplier_main_display[1][]']).toBe(true);
  });
});