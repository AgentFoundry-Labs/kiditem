import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { buildSabangnetImportPlan, planSabangnetMallValues, sabangnetShopMallKey } from './sabangnet-product-import.plan';
import {
  parseSabangnetWorkbook,
  recomputeSheetRange,
  SabangnetWorkbookFormatError,
  type SabangnetChannelOverrideRow,
  type SabangnetMallCategoryRow,
  type SabangnetMallTemplateRow,
  type SabangnetOptionRow,
  type SabangnetProductRow,
  type SabangnetSendRecordRow,
} from '../../../adapter/out/documents/sabangnet/product-workbook.parser';

/** 사방넷 수정파일 모양: 제목 줄 · 머리 줄 · '▶' 설명 줄 · 자료. */
function workbook(title: string, headers: string[], rows: (string | number | null)[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([
    [title],
    headers,
    headers.map((header) => `▶${header} 설명`),
    ...rows,
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const PRODUCT_HEADERS = [
  '품번코드\n[수정불가]', '상품명', '모델명', '모델NO', '자체상품코드\n[수정불가]', '사이트검색어', '상품상태', '세금구분',
  '배송비구분', '배송비', '원가', '판매가', 'TAG가', '옵션제목(1)', '옵션상세명칭', '옵션제목(2)', '옵션상세명칭',
  '대표이미지', '상품상세설명', '재고관리사용여부', '속성정보(상품정보고시)\n분류코드', '속성값1', '속성값2',
];

const OPTION_HEADERS = [
  '사방넷상품코드\n[수정불가]', '옵션상세명칭', '공급상태', '단품추가금액', '옵션제목', '모델명\n[수정불가]', '안전재고',
];

const OVERRIDE_HEADERS = ['품번코드', '쇼핑몰코드', '쇼핑몰명', '쇼핑몰 판매가', '쇼핑몰 상품명', '원가'];

function parse<T>(buffer: Buffer): T[] {
  return parseSabangnetWorkbook(buffer, 'test.xlsx').rows as T[];
}

const sku = (
  masterProductId: string,
  code: string,
  sourceProductCode: string,
  sourceOptionCode: string,
  optionName: string | null,
  barcode: string | null = null,
) => ({
  masterProductId,
  code,
  sourceAccountKey: 'sellpia',
  sourceProductCode,
  sourceOptionCode,
  name: '애니멀스마트만능패드',
  optionName,
  barcode,
  purchasePrice: null,
  imageUrls: [],
});

describe('Sabangnet workbook import', () => {
  const products = parse<SabangnetProductRow>(workbook('상품관리 > 사방넷상품대량수정 >', PRODUCT_HEADERS, [
    ['100017', '투명우산 그리기', '8321-1', '8321-1', null, '투명우산,그리기우산', '2', '1', '4', '3000', 1350, 2880, 5000,
      '단품', '단품', null, null, 'https://pic.example/100017_1.jpg', '<img src="x">', 'N', '035', '상세설명참조', 'KY I&D'],
    ['100300', '애니멀 만능패드', '7747-4', '7747-4', '7400090026127', null, '2', '1', '4', '3000', 2000, 5900, 9000,
      '색상', '파랑,노랑,핑크', null, null, null, null, 'N', null, null, null],
  ]));
  const options = parse<SabangnetOptionRow>(workbook('상품관리 > 사방넷단품대량수정', OPTION_HEADERS, [
    ['100017-0001', null, '1', 0, '단품', '8321-1', 0],
    ['100300-0001', '파랑', '2', 0, '색상', '7747-4', 0],
    ['100300-0002', '노랑', '1', 500, '색상', '7747-4', 0],
    ['100300-0003', '핑크', '1', 0, '색상', '7747-4', 0],
  ]));
  const overrides = parse<SabangnetChannelOverrideRow>(workbook(' 쇼핑몰관리 > 쇼핑몰별별도정보관리', OVERRIDE_HEADERS, [
    ['100017', 'shop0387', '하프클럽(신)', 3100, '투명우산 (보리보리)', 1350],
    ['100017', 'shop0004', '인터파크', 3000, null, 1350],
    ['100300', 'shop0464', '11번가', 6200, null, 2000],
    ['100300', 'shop0003', '11번가(구)', 6100, null, 2000],
  ]));

  it('recomputes the sheet range Sabangnet writes too short', () => {
    const sheet = XLSX.utils.aoa_to_sheet([['a'], ['b'], ['c'], ['d'], ['e']]);
    sheet['!ref'] = 'A1:A2';
    expect(recomputeSheetRange(sheet)).toBe('A1:A5');
  });

  it('reads every data row after the description line', () => {
    expect(products.map((row) => row.goodsNo)).toEqual(['100017', '100300']);
    expect(products[0]).toMatchObject({
      name: '투명우산 그리기',
      keywords: ['투명우산', '그리기우산'],
      salePrice: 2880,
      deliveryFee: 3000,
      optionTitles: ['단품'],
      imageUrls: ['https://pic.example/100017_1.jpg'],
      noticeCategory: '035',
      noticeValues: ['상세설명참조', 'KY I&D'],
    });
    expect(products[1]!.optionValueLists).toEqual([['파랑', '노랑', '핑크']]);
    expect(options.map((row) => row.optionCode)).toEqual(['100017-0001', '100300-0001', '100300-0002', '100300-0003']);
    expect(overrides[0]).toMatchObject({ shopCode: 'shop0387', salePrice: 3100, name: '투명우산 (보리보리)' });
  });

  it('keeps only mall-only values from a mall row and reports a per-mall detail it no longer takes', () => {
    const elevenStreet = overrides.find((override) => override.shopCode === 'shop0464')!;
    const plan = buildSabangnetImportPlan({
      products,
      options,
      overrides: [{ ...elevenStreet, detailHtml: '<p>몰 상세</p>', stockPercent: 150 }],
      skus: [],
      accounts: [{ id: 'acc-11st', channel: '11st' }],
    });
    // 등록 대상은 이름 · 가격 · 상세를 갖지 않는다(KID-313 W2). 재고분할퍼센트만 몰 칸으로 남는다.
    expect(plan.products[1]!.overrides[0]!.data).toEqual({ stockPercent: 100, sourceRaw: elevenStreet.raw });
    expect(plan.issues).toContainEqual(expect.objectContaining({
      kind: 'channel_overrides',
      code: elevenStreet.goodsNo,
      message: expect.stringContaining('몰별 상세 override 는 더 이상 받지 않음'),
    }));
  });

  it('reports once per product which per-mall values it ignores, naming the malls, and stores none of them', () => {
    const elevenStreet = overrides.find((override) => override.shopCode === 'shop0464')!;
    const plan = buildSabangnetImportPlan({
      products,
      options,
      overrides: [
        { ...elevenStreet, salePrice: 3100, name: '11번가 이름', promoText: '무료배송', noticeCategory: '035', priceRateBp: 10_400, costPrice: null, detailHtml: null },
        { ...elevenStreet, shopCode: 'shop0387', shopName: '보리보리', salePrice: 3200, name: null, promoText: null, noticeCategory: null, priceRateBp: null, costPrice: 1500, detailHtml: null },
      ],
      skus: [],
      accounts: [{ id: 'acc-11st', channel: '11st' }],
    });

    const lines = plan.issues.filter((issue) => issue.kind === 'channel_overrides' && issue.code === elevenStreet.goodsNo);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.message).toBe(
      `몰별 값은 더 이상 받지 않음 — 판매가(${elevenStreet.shopName} · 보리보리) · 적용율(${elevenStreet.shopName}) · 원가(보리보리) · 상품명(${elevenStreet.shopName}) · 홍보문(${elevenStreet.shopName}) · 고시(${elevenStreet.shopName}). 판매 상품 한 곳에서 고칩니다.`,
    );
    expect(plan.products[1]!.overrides[0]!.data).not.toHaveProperty('salePrice');
    expect(plan.products[1]!.overrides[0]!.data).not.toHaveProperty('promoText');
  });

  it('reports nothing for a product whose mall rows carry only mall-only values', () => {
    const elevenStreet = overrides.find((override) => override.shopCode === 'shop0464')!;
    const plan = buildSabangnetImportPlan({
      products,
      options,
      overrides: [{ ...elevenStreet, salePrice: null, priceRateBp: null, costPrice: null, name: null, promoText: null, noticeCategory: null, detailHtml: null, stockPercent: 50 }],
      skus: [],
      accounts: [{ id: 'acc-11st', channel: '11st' }],
    });
    expect(plan.issues.filter((issue) => issue.kind === 'channel_overrides')).toEqual([]);
  });

  it('carries the product detail to the content revision instead of the product', () => {
    const plan = buildSabangnetImportPlan({ products, options, overrides: [], skus: [], accounts: [] });
    expect(plan.products[0]!.create).not.toHaveProperty('detailHtml');
    expect(plan.products[0]!.detail).toEqual({ html: products[0]!.detailHtml });
  });

  it('reads the Sabangnet percentage rate into basis points', () => {
    const rows = parse<SabangnetChannelOverrideRow>(workbook('쇼핑몰별별도정보', [
      '품번코드', '쇼핑몰코드', '적용율(%)',
    ], [['100300', 'shop0464', 104]]));
    expect(rows[0]).toMatchObject({ priceRateBp: 10_400 });
  });

  it('reads the send-record download without the mall login column', () => {
    const buffer = workbook('상품관리 > 쇼핑몰상품수정', ['쇼핑몰코드', '쇼핑몰ID', '쇼핑몰상품코드', '품번코드', '판매가(송신)'], [
      ['shop0387', 'seller-login', '438217859', '100017', 3100],
      ['shop0387', 'seller-login', '', '100300', 3100],
      ['', 'seller-login', '1', '100300', 0],
    ]);
    const parsed = parseSabangnetWorkbook(buffer, '쇼핑몰상품수정_다운로드.xlsx');
    expect(parsed.kind).toBe('send_records');
    expect(parsed.rows as SabangnetSendRecordRow[]).toEqual([expect.objectContaining({
      shopCode: 'shop0387', mallProductCode: '438217859', goodsNo: '100017', sentPrice: 3100,
    })]);
    expect(parsed.issues).toHaveLength(1);
    expect(JSON.stringify(parsed.rows)).not.toContain('seller-login');
  });

  it('keeps each product × mall Sabangnet category and template, newer 11st shop first', () => {
    const categories = parse<SabangnetMallCategoryRow>(workbook(' 쇼핑몰관리 > 쇼핑몰카테고리 > 수정파일', [
      '카테고리코드\n[수정불가]', '쇼핑몰명\n[수정불가]', '카테고리 제목', '카테고리(쇼핑몰)\n[수정불가]', '사용여부',
    ], [
      ['C1207602', '11번가', '역할놀이', '장난감 > 역할놀이/소꿉놀이 > 역할놀이 기타', '사용'],
      ['C0000001', '11번가(구)', '예전', '도서/문구::문구/사무용품 > 문구용품 > 문구용품 기타', '사용'],
    ]));
    const templates = parse<SabangnetMallTemplateRow>(workbook(' 쇼핑몰관리 > 쇼핑몰부가정보 > 수정파일', [
      '부가정보코드\n[수정불가]', '쇼핑몰명\n[수정불가]', '부가정보 제목', '카테고리(쇼핑몰)\n[수정불가]', '사용여부',
      '상품설명 상단 추가문구', '상품설명 하단 추가문구', '상품명 추가 앞문구', '상품명 추가 뒷문구',
    ], [
      ['00102324', '11번가', '(신)3만원이상무료배송', '장난감 > 역할놀이/소꿉놀이 > 역할놀이 기타', '사용', null, "<img src='https://x/bottom.jpg' />", '[키드아이템]', null],
    ]));
    expect(categories[0]).toMatchObject({ code: 'C1207602', path: '장난감 > 역할놀이/소꿉놀이 > 역할놀이 기타', active: true });
    const planned = planSabangnetMallValues({
      sendRecords: [
        { row: 4, shopCode: 'shop0003', goodsNo: '103181', additionCode: null, categoryCode: 'C0000001' },
        { row: 5, shopCode: 'shop0464', goodsNo: '103181', additionCode: '00102324', categoryCode: 'C1207602' },
        { row: 6, shopCode: 'shop0464', goodsNo: '999999', additionCode: '00102324', categoryCode: 'C1207602' },
      ],
      categories,
      templates,
      productIdByCode: new Map([['103181', 'p-1']]),
      accounts: [{ id: 'acc-11st', channel: '11st' }],
    });
    expect(planned.writes).toEqual([{
      salesProductId: 'p-1',
      channelAccountId: 'acc-11st',
      values: {
        sabangnetCategoryCode: 'C1207602',
        sabangnetCategoryTitle: '역할놀이',
        sabangnetCategoryPath: '장난감 > 역할놀이/소꿉놀이 > 역할놀이 기타',
        sabangnetTemplateCode: '00102324',
        sabangnetTemplateTitle: '(신)3만원이상무료배송',
        sabangnetNamePrefix: '[키드아이템]',
        sabangnetDetailBottom: "<img src='https://x/bottom.jpg' />",
      },
    }]);
    expect(planned).toMatchObject({ withCategory: 1, withTemplate: 1 });
  });

  it('keeps a mall template text over 20 000 characters out of the mall values and names it in an issue line', () => {
    const planned = planSabangnetMallValues({
      sendRecords: [{ row: 4, shopCode: 'shop0464', goodsNo: '103181', additionCode: '00102324', categoryCode: null }],
      categories: [],
      templates: [{
        row: 4, code: '00102324', mallName: '11번가', title: '무료배송', path: null, active: true,
        detailTop: 'a'.repeat(25_000), detailBottom: null, namePrefix: '[키드아이템]', nameSuffix: null,
      }],
      productIdByCode: new Map([['103181', 'p-1']]),
      accounts: [{ id: 'acc-11st', channel: '11st' }],
    });
    expect(planned.writes).toEqual([{
      salesProductId: 'p-1',
      channelAccountId: 'acc-11st',
      values: { sabangnetTemplateCode: '00102324', sabangnetTemplateTitle: '무료배송', sabangnetNamePrefix: '[키드아이템]' },
    }]);
    expect(planned.issues).toEqual([{
      kind: 'send_records',
      row: 4,
      code: '103181',
      message: expect.stringContaining('sabangnetDetailTop'),
    }]);
  });

  it('refuses a workbook that is not a Sabangnet export', () => {
    const other = workbook('다른 파일', ['주문번호', '수량'], [['1', 2]]);
    expect(() => parseSabangnetWorkbook(other, 'orders.xlsx')).toThrow(SabangnetWorkbookFormatError);
  });

  it('plans products with options, links source identities only when certain, and keeps per-mall values', () => {
    const plan = buildSabangnetImportPlan({
      products,
      options,
      overrides,
      skus: [
        sku('master-8321-1', 'KID-8321-1', '8321', '1', null, '8806384800001'),
        sku('master-7747-1', 'KID-7747-1', '7747', '1', '파랑(Bear)', '7400090044480'),
        sku('master-7747-2', 'KID-7747-2', '7747', '2', '노랑(DEER)'),
        sku('master-7747-3', 'KID-7747-3', '7747', '3', '분홍(Rabbit)'),
        sku('master-7747-4', 'KID-7747-4', '7747', '4', '랜덤'),
      ],
      accounts: [
        { id: 'acc-boribori', channel: 'boribori' },
        { id: 'acc-11st', channel: '11st' },
      ],
    });
    const [umbrella, pad] = plan.products;
    expect(umbrella!.create).toMatchObject({ code: '100017', status: 'active', taxType: 'taxable', deliveryFeeType: 'collect_or_prepay', optionAxes: [] });
    expect(umbrella!.options).toEqual([
      expect.objectContaining({
        sabangnetOptionCode: '100017-0001',
        values: [],
        salePrice: 2880,
        normalPrice: 5000,
        barcode: '8806384800001',
        components: [{ masterProductId: 'master-8321-1', quantity: 1 }],
      }),
    ]);
    expect(umbrella!.options[0]!.optionCode).toBeUndefined();
    expect(pad!.create.optionAxes).toEqual(['색상']);
    expect(pad!.options.map((option) => [
      option.sabangnetOptionCode,
      option.values,
      option.supplyStatus,
      option.salePrice,
      option.normalPrice,
      option.components.map((c) => c.masterProductId),
    ]))
      .toEqual([
        ['100300-0001', ['파랑'], 'sold_out', 5900, 9000, ['master-7747-1']],
        ['100300-0002', ['노랑'], 'selling', 6400, 9000, ['master-7747-2']],
        // 핑크 ↔ 분홍(Rabbit): 이름이 겹치지 않아 연결하지 않는다.
        ['100300-0003', ['핑크'], 'selling', 5900, 9000, []],
      ]);
    expect(umbrella!.overrides).toEqual([
      expect.objectContaining({ channelAccountId: 'acc-boribori', shopCode: 'shop0387' }),
    ]);
    // 11번가 신(shop0464)과 구(shop0003)가 같은 몰 계정이면 신이 이긴다.
    expect(pad!.overrides).toEqual([
      expect.objectContaining({ channelAccountId: 'acc-11st', shopCode: 'shop0464' }),
    ]);
    expect(plan.skippedByShop).toEqual({ shop0004: 1 });
  });

  it('reads the bulk registration form and keeps the source own code as a bootstrap key', () => {
    const rows = parse<SabangnetProductRow>(workbook('상품관리 > 사방넷상품대량등록', [
      '상품명', '자체상품코드', '옵션제목(1)', '옵션상세명칭(1)', '판매가', '대표이미지',
    ], [
      ['투명우산 그리기', 'KID-UMB', '단품', null, 2880, 'https://pic.example/u.jpg'],
      ['새 스티커', 'KID-NEW', '색상', '빨강,파랑', 1500, null],
    ]));
    const plan = buildSabangnetImportPlan({
      products: rows,
      options: [],
      overrides: [],
      skus: [],
      accounts: [],
      existingCodeByOwnCode: new Map([['KID-UMB', '100017']]),
    });
    expect(plan.products.map((product) => [product.create.code, product.create.ownCode, product.create.sabangnetGoodsNo]))
      .toEqual([['KID-UMB', 'KID-UMB', null], ['KID-NEW', 'KID-NEW', null]]);
    expect(plan.products[1]!.options.map((option) => option.sabangnetOptionCode)).toEqual(['KID-NEW-0001', 'KID-NEW-0002']);
    expect(plan.products[1]!.options.every((option) => option.optionCode === undefined)).toBe(true);
  });

  it('builds option combinations from the product sheet when no option file is given', () => {
    const plan = buildSabangnetImportPlan({ products, options: [], overrides: [], skus: [], accounts: [] });
    expect(plan.products[1]!.options.map((option) => [option.sabangnetOptionCode, option.values])).toEqual([
      ['100300-0001', ['파랑']],
      ['100300-0002', ['노랑']],
      ['100300-0003', ['핑크']],
    ]);
    expect(plan.products[1]!.options.every((option) => option.optionCode === undefined)).toBe(true);
  });

  it('maps Sabangnet shop codes, including malls outside the listing import', () => {
    expect(sabangnetShopMallKey('shop0387')).toBe('boribori');
    expect(sabangnetShopMallKey('shop0075')).toBe('coupang');
    expect(sabangnetShopMallKey('shop9999')).toBeNull();
  });
});
