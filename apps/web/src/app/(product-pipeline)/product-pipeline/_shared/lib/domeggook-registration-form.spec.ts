import { describe, expect, it } from 'vitest';
import {
  buildDomeggookTitle,
  domeggookFormFromDraft,
  DOMEGGOOK_CHILD_NOTICE_FIELD,
  DOMEGGOOK_TERMS_FIELDS,
} from './domeggook-registration-form';
import type { MallProductDraft } from './mall-product-draft';

/**
 * 라이브 실측(2026-09-10, 도매꾹 상품번호 67662430)에서 읽은 규칙을 고정한다.
 * 여기가 깨지면 폼이 바뀐 것이고, 그때는 등록된 상품을 다시 열어 보고 고쳐야 한다.
 */
function draft(overrides: Partial<MallProductDraft> = {}): MallProductDraft {
  return {
    candidateId: 'c1',
    displayName: '생수통 치즈 슬라임(3탄)',
    sellerProductName: '1170생수통치즈슬라임3탄',
    brand: '노브랜드',
    maker: '해피프랜즈',
    keywords: ['끈끈이', '주물럭'],
    representativeImageUrl: 'https://cdn/rep.jpg',
    additionalImageUrls: ['https://cdn/a.jpg'],
    detailImageUrls: ['https://kiditem.diskn.com/K7OMlWn1HH'],
    notice: { category: '어린이제품', fields: { 품명및모델명: '주물럭', 제조국: '중국' } },
    variants: [{
      options: [{ type: '색상', value: '단일' }],
      salePrice: 1170, listPrice: 1170, stock: 987,
      barcode: null, sellerSku: null, representativeImageUrl: 'https://cdn/rep.jpg',
    }],
    sourceCategory: null,
    ...overrides,
  };
}

describe('buildDomeggookTitle', () => {
  it('접두어 없이 상품명 + 수량 + 키워드다', () => {
    // 실측: `생수통 치즈 슬라임(3탄) 1p 끈끈이 주물럭 스트레스해소`
    expect(buildDomeggookTitle('생수통 치즈 슬라임(3탄)', ['끈끈이', '주물럭'], 1))
      .toBe('생수통 치즈 슬라임(3탄) 1p 끈끈이 주물럭');
  });

  it('키즈노트와 달리 [키드아이템] 을 붙이지 않는다', () => {
    expect(buildDomeggookTitle('상품', [], 1)).not.toContain('키드아이템');
  });
});

describe('domeggookFormFromDraft — 키워드', () => {
  it('보이는 칸에 넣는다 — 숨은 itemKeyword 는 직접 채우지 않는다', () => {
    // 키워드 칸은 name 이 없어서 이름으로 못 닿는다. 숨은 값만 채우면 페이지가
    // 그 칸들로 다시 만들어 덮는다(라이브 확인 2026-09-10).
    const form = domeggookFormFromDraft(draft());
    expect(form.groups.keywords).toEqual(['끈끈이', '주물럭']);
    expect(form.fields.itemKeyword).toBeUndefined();
  });

  it('칸 수를 넘기지 않는다', () => {
    const many = Array.from({ length: 15 }, (_, i) => `k${i}`);
    const form = domeggookFormFromDraft(draft({ keywords: many }));
    expect(form.groups.keywords).toHaveLength(10);
  });
});

describe('domeggookFormFromDraft', () => {
  it('가격과 재고를 숫자만으로 넣는다 — 도매꾹은 콤마를 받지 않는다', () => {
    const form = domeggookFormFromDraft(draft());
    expect(form.fields.amt1).toBe('1170');
    expect(form.fields.qty).toBe('987');
  });

  it('고시 상품군은 어린이제품(23)이다', () => {
    expect(domeggookFormFromDraft(draft()).fields.infoDutyType).toBe('23');
  });

  it('고시 칸을 실측 이름으로 채운다', () => {
    const form = domeggookFormFromDraft(draft());
    expect(form.fields[DOMEGGOOK_CHILD_NOTICE_FIELD.품명및모델명]).toBe('주물럭');
    expect(form.fields[DOMEGGOOK_CHILD_NOTICE_FIELD.제조국]).toBe('중국');
    expect(form.fields[DOMEGGOOK_CHILD_NOTICE_FIELD.AS책임자]).toBe('고객센터 031-908-5401');
    // 제조자 고시는 실측에서 '내용없음' 이었다. 기본정보 itemCompany 와 다르다.
    expect(form.fields[DOMEGGOOK_CHILD_NOTICE_FIELD.제조자]).toBe('내용없음');
  });

  it('거래조건 4칸을 전부 같은 값으로 채운다', () => {
    const form = domeggookFormFromDraft(draft());
    for (const field of DOMEGGOOK_TERMS_FIELDS) {
      expect(form.fields[field]).toBe('상세정보참고');
    }
  });

  it('제조사 표기가 이 몰 것이다 — 해피프렌즈이지 해피프랜즈가 아니다', () => {
    expect(domeggookFormFromDraft(draft()).fields.itemCompany).toBe('해피프렌즈');
  });

  it('빈 칸에 점을 넣는다 — 실측 관행이다', () => {
    const form = domeggookFormFromDraft(draft());
    expect(form.fields.itemSize).toBe('.');
    expect(form.fields.itemWeight).toBe('.');
  });

  it('묶음 수량을 안 주면 1로 두고 사람에게 알린다', () => {
    const form = domeggookFormFromDraft(draft());
    expect(form.fields.unitQty).toBe('1');
    expect(form.manualSteps.some((s) => s.includes('최소 구매수량'))).toBe(true);
  });

  it('묶음 수량을 주면 그대로 쓴다', () => {
    expect(domeggookFormFromDraft(draft(), { unitQty: 5 }).fields.unitQty).toBe('5');
  });

  it('분류를 안 주면 넣지 않는다 — 6단 코드를 지어내지 않는다', () => {
    const form = domeggookFormFromDraft(draft());
    expect(form.fields.itemCategory).toBeUndefined();
    // 대신 확장이 도매꾹 AI 추천을 받는다. 몰이 자기 분류 체계로 판단한 값이라
    // 우리 추측보다 낫다.
    expect(form.manualSteps.some((s) => s.includes('AI 추천'))).toBe(true);
  });

  it('상세설명 칸은 itemMemo[Item] 이다', () => {
    // 라이브 3중 확인: 수정폼에서 상세 HTML 을 담은 유일한 칸이고, 구매자
    // 상품페이지 #lInfoView 에 그 이미지가 그대로 렌더된다.
    const form = domeggookFormFromDraft(draft());
    expect(form.detailHtmlTarget).toBe('itemMemo[Item]');
    expect(form.detailUploads).toEqual([{ url: 'https://kiditem.diskn.com/K7OMlWn1HH' }]);
  });

  it('상세 이미지가 있으면 사람에게 넘기지 않는다', () => {
    // 예전엔 호스팅이 꺼져 있으면 '직접 올리세요'로 넘겼다. 그게 상세페이지가
    // 통째로 비는 이유였다. 이제 확장이 첨부 저장소에 올려서 넣으므로 남는 숙제가 없다.
    const form = domeggookFormFromDraft(draft());
    expect(form.detailUploads).toHaveLength(1);
    expect(form.manualSteps.some((s) => s.includes('직접 올리세요'))).toBe(false);
  });

  it('상세 이미지가 아예 없을 때만 사람에게 알린다', () => {
    const form = domeggookFormFromDraft({ ...draft(), detailImageUrls: [] });
    expect(form.manualSteps.some((s) => s.includes('상세페이지를 먼저 확정'))).toBe(true);
  });

  it('도매꾹만 노출하고 공급사는 끈다', () => {
    const form = domeggookFormFromDraft(draft());
    expect(form.checks['market[]:dome']).toBe(true);
    expect(form.checks['market[]:supply']).toBe(false);
  });

  it('라디오 기본값이 실측과 같다', () => {
    expect(domeggookFormFromDraft(draft()).radios).toEqual({
      itemSection: 'SELL', taxAdded: '1', deliveryMethod: 'TB',
      itemSafetyCert: '1', onlyForAdult: '0', imageResize: '0',
      // 배송비 결제방식과 구간 수. 등록폼 기본값(S / 1구간)과 다르다.
      deliveryWho: 'C', lAmtSectionCntDeliDome: '2',
    });
  });

  it('배송·반품 조건이 실측과 같다', () => {
    // 등록폼 기본은 고정단가 1구간이고 반품배송비가 비어 있다. 손대지 않으면
    // 이 판매자의 조건이 되지 않는다.
    const form = domeggookFormFromDraft(draft());
    expect(form.fields.deliBuyerOpt).toBe('qty');
    expect(form.fields.deliBuyerTblStr).toBe('1+3000|43+0');
    expect(form.fields.returnDeliAmt).toBe('3000');
    expect(form.checks.returnDeliAmtDouble).toBe(true);
    expect(form.checks.byUnitQty).toBe(true);
  });

  it('원산지와 안전인증은 이름 없는 칸이라 선택자로 넘긴다', () => {
    const form = domeggookFormFromDraft(draft(), { certNumber: 'CB065R1579-2008' });
    expect(form.selectorFields).toEqual({
      originType: '1', originArea: '4', originNation: '36',
      certExempt: '01', certType: 'B02', certNumber: 'CB065R1579-2008',
    });
  });

  it('상품명에서 소비자가 접두어를 뗀다 — 몰마다 상품명이 다르다', () => {
    // 셀피아 원본명은 `2000생수통치즈슬라임(3탄)` 처럼 앞에 소비자가가 붙는다.
    // 도매꾹 등록물에는 그 숫자가 없다. 도매 단가를 따로 넣으므로 남으면 헷갈린다.
    const form = domeggookFormFromDraft(draft({ displayName: '2000생수통치즈슬라임(3탄)' }));
    expect(form.fields.itemTitle.startsWith('생수통치즈슬라임(3탄)')).toBe(true);
    expect(form.fields.itemTitle).not.toContain('2000생수통');
  });

  it('대표이미지는 전문가용 칸에 넣는다', () => {
    // 등록폼 기본값(`imageResize=1`, 일반업로드)에서는 `image1~4` 가 숨은 칸이라
    // 사진 넉 장이 아무 데도 안 붙는다. 실제 등록물은 전부 전문가용이다.
    const form = domeggookFormFromDraft(draft());
    expect(form.radios.imageResize).toBe('0');
    expect(form.fileUploads.map((upload) => upload.name)).toEqual(
      expect.arrayContaining(['image1']),
    );
    expect(form.fileUploads.some((upload) => upload.name === 'image0')).toBe(false);
  });

  it('내 다른 판매상품 홍보 칸을 채운다 — 켜려면 내용이 있어야 한다', () => {
    // 켜고 비우면 도매꾹이 "내용을 입력해주세요" 로 제출을 막는다. 실제 등록물은
    // 이 칸에 `descn2` 를 들고 있다(상품 67662430).
    expect(domeggookFormFromDraft(draft()).promoHtml).toBe('descn2');
  });

  it('색상 옵션이 단일이 아니면 고시 색상을 덮는다', () => {
    const form = domeggookFormFromDraft(draft({
      variants: [{ ...draft().variants[0]!, options: [{ type: '색상', value: '블루' }] }],
    }));
    expect(form.fields[DOMEGGOOK_CHILD_NOTICE_FIELD.색상]).toBe('블루');
  });

  it('제출은 사람이 한다고 항상 알린다', () => {
    expect(domeggookFormFromDraft(draft()).manualSteps.some((s) => s.includes('자동 제출하지 않습니다')))
      .toBe(true);
  });

  it('옵션이 없으면 폼을 만들지 않는다', () => {
    expect(() => domeggookFormFromDraft(draft({ variants: [] }))).toThrow(/옵션/);
  });
});
