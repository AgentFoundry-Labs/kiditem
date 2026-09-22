import { describe, expect, it } from 'vitest';
import {
  ICECREAM_AS_PHONE,
  ICECREAM_DEFAULT_CATEGORY,
  ICECREAM_DEFAULT_CATEGORY_CODE,
  ICECREAM_NOTICE_ITEM_CODE,
  ICECREAM_REGISTER_URL,
  buildIcecreamNotice,
  buildIcecreamProductName,
  icecreamFormFromDraft,
  icecreamListPrice,
  icecreamSupplyPrice,
  parseIcecreamCategory,
} from './icecream-registration-form';
import type { MallProductDraft } from './mall-product-draft';

/**
 * 아이스크림몰 폼 빌더.
 *
 * 기대값은 **실측 등록물**(`goodsNo=11411122`)에서 왔다. 화면을 상상해서 만든 값이
 * 아니라, 그 몰에 실제로 올라가 있는 상품에서 읽은 숫자다.
 *   상품명 `슈가 귤 쫀득 쫀뜩 주물럭 1p 귤주물럭 찐득이`
 *   공급가 1,950 / 정상가 4,000 / 판매가 2,600 (마진율 25)
 *   분류 `아이스크림몰>학급운영>학생선물>장난감/완구` (BC0105010200)
 *   고시 크기 `8x8x7cm` · 색상 `오렌지` · 사용연령 `8세이상`
 */
const draft = (overrides: Partial<MallProductDraft> = {}): MallProductDraft => ({
  candidateId: 'c1',
  displayName: '4000슈가귤쫀득쫀뜩주물럭',
  sellerProductName: '4000슈가귤쫀득쫀뜩주물럭',
  brand: '노브랜드',
  maker: '해피프랜즈',
  keywords: ['귤주물럭', '찐득이'],
  representativeImageUrl: 'https://cdn.example.com/rep.jpg',
  additionalImageUrls: ['https://cdn.example.com/a1.jpg'],
  detailImageUrls: ['https://kiditem.diskn.com/x80sp01Z4m'],
  notice: {
    category: '어린이제품',
    fields: {
      품명및모델명: '4000슈가귤쫀득쫀뜩주물럭',
      크기: '8x8x7cm',
      색상: '오렌지',
      재질: '고무',
      사용연령: '8세 이상',
      제조자: '해피프랜즈',
      제조국: '중국',
    },
  },
  variants: [{
    options: [{ type: '색상', value: '오렌지' }],
    salePrice: 2600, listPrice: 4000, stock: 999,
    barcode: null, sellerSku: null, representativeImageUrl: 'https://cdn.example.com/rep.jpg',
  }],
  sourceCategory: null,
  ...overrides,
});

describe('상품명', () => {
  it('앞의 소비자가를 떼고 수량을 1p 로 붙인다 — 실측과 같은 모양', () => {
    expect(buildIcecreamProductName('4000슈가 귤 쫀득 쫀뜩 주물럭', ['귤주물럭', '찐득이'], 1))
      .toBe('슈가 귤 쫀득 쫀뜩 주물럭 1p 귤주물럭 찐득이');
  });

  it('키워드는 셋까지만 붙인다', () => {
    const name = buildIcecreamProductName('상품', ['가', '나', '다', '라'], 2);
    expect(name).toBe('상품 2p 가 나 다');
  });
});

describe('가격', () => {
  it('공급가 = 판매가 × 0.75 — 실측 2,600 → 1,950', () => {
    expect(icecreamSupplyPrice(2600)).toBe(1950);
  });

  it('정상가는 원본명 앞의 숫자를 쓴다 — 실측 4,000', () => {
    expect(icecreamListPrice('4000슈가귤쫀득쫀뜩주물럭', 2600)).toBe(4000);
  });

  it('앞 숫자가 판매가보다 작으면 판매가를 쓴다 — 할인율이 이상하게 찍히지 않게', () => {
    expect(icecreamListPrice('1000싼상품', 2600)).toBe(2600);
    expect(icecreamListPrice('숫자없는상품', 2600)).toBe(2600);
  });
});

describe('분류', () => {
  it('`>` 로 나누고 빈 단계는 버린다', () => {
    expect(parseIcecreamCategory('아이스크림몰>학급운영> >학생선물'))
      .toEqual(['아이스크림몰', '학급운영', '학생선물']);
  });
});

describe('고시', () => {
  it('상품 상세 값을 그대로 옮긴다 — 실측 등록물과 같은 값', () => {
    const rows = buildIcecreamNotice(draft());
    const value = (title: string) => rows.find((r) => r.title === title)?.value;
    expect(value('크기, 중량')).toBe('8x8x7cm');
    expect(value('색상')).toBe('오렌지');
    expect(value('재질')).toBe('고무');
    expect(value('사용연령(체중범위)')).toBe('8세 이상');
    expect(value('제조자')).toBe('해피프랜즈');
    expect(value('제조국')).toBe('중국');
  });

  it('품명은 원본 수집명이다 — 실측이 `4000슈가귤쫀득쫀뜩주물럭` 이었다', () => {
    const rows = buildIcecreamNotice(draft());
    expect(rows.find((r) => r.title === '품명 및 모델명')?.value)
      .toBe('4000슈가귤쫀득쫀뜩주물럭');
  });

  it('몰 고정 문구는 초안이 덮지 않는다', () => {
    const rows = buildIcecreamNotice(draft());
    expect(rows.find((r) => r.title === 'A/S 책임자 / 전화번호')?.value).toBe(ICECREAM_AS_PHONE);
    expect(rows.find((r) => r.title === '품질보증기준')?.value).toContain('공정거래위원회');
  });

  it('값이 없는 줄은 아예 담지 않는다 — 빈 칸을 만들지 않는다', () => {
    const rows = buildIcecreamNotice(draft());
    expect(rows.every((row) => row.value.length > 0)).toBe(true);
    expect(rows.some((row) => row.title === '동일모델의 출시년월')).toBe(false);
  });
});

describe('폼', () => {
  it('폼 id 별로 칸을 나눠 담는다 — 이 몰만 form 이 열한 개다', () => {
    const form = icecreamFormFromDraft(draft());
    expect(form.url).toBe(ICECREAM_REGISTER_URL);
    expect(form.formFields.goodsInfo?.goodsNm).toBe('슈가귤쫀득쫀뜩주물럭 1p 귤주물럭 찐득이');
    expect(form.formFields.priceInfo).toMatchObject({
      supPcost: '1950', norPrc: '4000', salePrc: '2600', mrgnRate: '25',
    });
  });

  it('⭐ 실측 등록물에 있는 항목을 전부 채운다 — 몇 칸만 채우면 기존 상품과 달라진다', () => {
    // 라이브 2026-09-11: 이름·가격만 채웠더니 배송비·과세·재고가 빈 채로 남았다.
    const form = icecreamFormFromDraft(draft());
    expect(form.formFields.deliveryInfo).toMatchObject({
      deliDday: '2', deliPsbRgnCd: '01', deliPolcNo: '3916',
      deliGoodsGbCd: '01', deliGoodsDtlGbCd: '10',
    });
    expect(form.formFields.priceInfo?.taxGbCd).toBe('01');
    expect(form.formFields.goodsInfo?.buyrAgeLmtCd).toBe('0');
    expect(form.formFields.saleInfo).toMatchObject({
      stkQty: '0', limtQty: '0', safeStkQty: '0', paysPointRate: '1',
    });
  });

  it('라디오도 실측대로 고른다 — 재고관리·옵션은 쓰지 않는다', () => {
    const form = icecreamFormFromDraft(draft());
    expect(form.formRadios.saleInfo).toMatchObject({
      stkMgrYn: 'N', optnYn: 'N', buyQtyLmtYn: 'N', safeStkNotiYn: 'N',
    });
    expect(form.formRadios.deliveryInfo).toMatchObject({
      cmbDeliYn: 'Y', ordCnclPsbYn: 'Y', exchPsbYn: 'Y', rtnPsbYn: 'Y',
    });
    expect(form.formRadios.goodsInfo?.dispYn).toBe('Y');
  });

  it('결제수단 셋을 켠다 — 신용카드·실시간계좌이체·포인트', () => {
    const form = icecreamFormFromDraft(draft());
    expect(form.formChecks.priceInfo?.['payWayCd[]']).toEqual(['11', '12', '32']);
    expect(form.formChecks.priceInfo?.ctgCmsnRateAplyYn).toBe(true);
  });

  it('분류는 코드와 경로를 함께 넘긴다 — 칸이 팝업 전용 readonly 다', () => {
    const form = icecreamFormFromDraft(draft());
    expect(form.category).toEqual({
      code: ICECREAM_DEFAULT_CATEGORY_CODE,
      path: ICECREAM_DEFAULT_CATEGORY,
    });
  });

  it('고시는 품목코드와 함께 넘긴다 — 그게 있어야 행이 열린다', () => {
    const form = icecreamFormFromDraft(draft());
    expect(form.notice.itemCode).toBe(ICECREAM_NOTICE_ITEM_CODE);
    expect(form.notice.rows.length).toBeGreaterThan(5);
  });

  it('인증번호가 있으면 안전인증 대상으로 켠다', () => {
    const withCert = draft();
    withCert.notice.fields.안전인증번호 = 'CB065R1075-2004';
    const form = icecreamFormFromDraft(withCert);
    expect(form.notice).toMatchObject({
      safeCertiTgtYn: 'Y', kcCertified: 'Y', certNumber: 'CB065R1075-2004',
    });
  });

  it('인증번호가 없으면 대상 아님으로 두고 사람에게 알린다', () => {
    const form = icecreamFormFromDraft(draft());
    expect(form.notice.safeCertiTgtYn).toBe('N');
    expect(form.manualSteps.join(' ')).toContain('안전인증번호가 없습니다');
  });

  it('네이버 최저가는 넣은 만큼만 담고 안 넣으면 알린다 — 이 몰만 요구한다', () => {
    const without = icecreamFormFromDraft(draft());
    expect(without.formFields.saleInfo?.naverMinPrc).toBeUndefined();
    expect(without.manualSteps.join(' ')).toContain('네이버 최저가');

    const withPrice = icecreamFormFromDraft(draft(), {
      naverMinPrice: 2200, naverMinPriceUrl: 'https://search.shopping.naver.com/x',
    });
    expect(withPrice.formFields.saleInfo).toMatchObject({
      naverMinPrc: '2200', naverMinPrcUrl: 'https://search.shopping.naver.com/x',
    });
  });

  it('조사일은 지어내지 않는다 — 안 주면 비운다', () => {
    const form = icecreamFormFromDraft(draft(), { naverMinPrice: 2200 });
    expect(form.formFields.saleInfo?.naverMinPrcIvstgDt).toBeUndefined();
  });

  it('상세설명은 SmartEditor 뒷단 textarea 로 간다', () => {
    const form = icecreamFormFromDraft(draft());
    expect(form.detailHtmlTarget).toBe('detailHtmlEditor');
    expect(form.detailUploads).toEqual([{ url: 'https://kiditem.diskn.com/x80sp01Z4m' }]);
  });

  it('승인요청이 남아 있다고 항상 알린다 — 온채널과 같은 부류다', () => {
    expect(icecreamFormFromDraft(draft()).manualSteps.join(' ')).toContain('승인요청');
  });

  it('옵션이 없으면 폼을 만들지 않는다', () => {
    expect(() => icecreamFormFromDraft(draft({ variants: [] }))).toThrow(/옵션/);
  });

  it('⭐ 셀피아 코드를 몰의 업체상품코드 칸에 심는다 — 가져올 때 이름 대신 코드로 이어진다 (KID-246)', () => {
    expect(icecreamFormFromDraft(draft(), { sellpiaCode: '10292-1' }).formFields.goodsInfo!.entrGoodsNo)
      .toBe('10292-1');
    // 코드가 없으면 칸을 만들지 않는다 — 빈 값을 몰에 써넣지 않는다.
    expect(icecreamFormFromDraft(draft()).formFields.goodsInfo!.entrGoodsNo).toBeUndefined();
  });
});
