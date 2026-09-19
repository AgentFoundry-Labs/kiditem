import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { buildSabangnetImportPlan, sabangnetShopMallKey } from './sabangnet-product-import.plan';
import {
  parseSabangnetWorkbook,
  recomputeSheetRange,
  SabangnetWorkbookFormatError,
  type SabangnetChannelOverrideRow,
  type SabangnetOptionRow,
  type SabangnetProductRow,
  type SabangnetSendRecordRow,
} from './sabangnet-product-workbook.parser';

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

const sku = (id: string, code: string, optionName: string | null, barcode: string | null = null) => ({
  sellpiaInventorySkuId: id,
  code,
  name: '애니멀스마트만능패드',
  optionName,
  barcode,
  purchasePrice: null,
  salePrice: null,
  isActive: true,
  masterProductId: null,
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

  it('refuses a workbook that is not a Sabangnet export', () => {
    const other = workbook('다른 파일', ['주문번호', '수량'], [['1', 2]]);
    expect(() => parseSabangnetWorkbook(other, 'orders.xlsx')).toThrow(SabangnetWorkbookFormatError);
  });

  it('plans products with options, Sellpia links only when certain, and per-mall values', () => {
    const plan = buildSabangnetImportPlan({
      products,
      options,
      overrides,
      skus: [
        sku('s-8321', '8321-1', null, '8806384800001'),
        sku('s-1', '7747-1', '파랑(Bear)', '7400090044480'),
        sku('s-2', '7747-2', '노랑(DEER)'),
        sku('s-3', '7747-3', '분홍(Rabbit)'),
        sku('s-4', '7747-4', '랜덤'),
      ],
      accounts: [
        { id: 'acc-boribori', channel: 'boribori' },
        { id: 'acc-11st', channel: '11st' },
      ],
    });
    const [umbrella, pad] = plan.products;
    expect(umbrella!.create).toMatchObject({ code: '100017', status: 'active', taxType: 'taxable', deliveryFeeType: 'collect_or_prepay', optionAxes: [] });
    expect(umbrella!.options).toEqual([
      expect.objectContaining({ optionCode: '100017-0001', values: [], barcode: '8806384800001', components: [{ sellpiaInventorySkuId: 's-8321', quantity: 1 }] }),
    ]);
    expect(pad!.create.optionAxes).toEqual(['색상']);
    expect(pad!.options.map((option) => [option.optionCode, option.values, option.supplyStatus, option.extraPrice, option.components.map((c) => c.sellpiaInventorySkuId)]))
      .toEqual([
        ['100300-0001', ['파랑'], 'sold_out', 0, ['s-1']],
        ['100300-0002', ['노랑'], 'selling', 500, ['s-2']],
        // 핑크 ↔ 분홍(Rabbit): 이름이 겹치지 않아 연결하지 않는다.
        ['100300-0003', ['핑크'], 'selling', 0, []],
      ]);
    expect(umbrella!.overrides).toEqual([
      expect.objectContaining({ channelAccountId: 'acc-boribori', data: expect.objectContaining({ salePrice: 3100, name: '투명우산 (보리보리)' }) }),
    ]);
    // 11번가 신(shop0464)과 구(shop0003)가 같은 몰 계정이면 신이 이긴다.
    expect(pad!.overrides).toEqual([
      expect.objectContaining({ channelAccountId: 'acc-11st', shopCode: 'shop0464', data: expect.objectContaining({ salePrice: 6200 }) }),
    ]);
    expect(plan.skippedByShop).toEqual({ shop0004: 1 });
  });

  it('reads the bulk registration form and finds an existing product by its own code', () => {
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
      .toEqual([['100017', 'KID-UMB', null], ['KID-NEW', 'KID-NEW', null]]);
    expect(plan.products[1]!.options.map((option) => option.optionCode)).toEqual(['KID-NEW-0001', 'KID-NEW-0002']);
  });

  it('builds option combinations from the product sheet when no option file is given', () => {
    const plan = buildSabangnetImportPlan({ products, options: [], overrides: [], skus: [], accounts: [] });
    expect(plan.products[1]!.options.map((option) => [option.optionCode, option.values])).toEqual([
      ['100300-0001', ['파랑']],
      ['100300-0002', ['노랑']],
      ['100300-0003', ['핑크']],
    ]);
  });

  it('maps Sabangnet shop codes, including malls outside the listing import', () => {
    expect(sabangnetShopMallKey('shop0387')).toBe('boribori');
    expect(sabangnetShopMallKey('shop0075')).toBe('coupang');
    expect(sabangnetShopMallKey('shop9999')).toBeNull();
  });
});
