import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { MALL_BULK_SHEETS } from '../../../domain/mall-bulk-sheet/mall-bulk-sheet-registry';
import { MallCategoryLookup } from '../../../domain/mall-bulk-sheet/mall-sheet-categories';
import { resolveFixedValues, type MallBulkSheetSpec } from '../../../domain/mall-bulk-sheet/mall-bulk-sheet';
import { toMallSheetProduct, type MallSheetSourceProduct } from '../../../domain/mall-bulk-sheet/mall-sheet-product';
import { MallBulkSheetFilesAdapter } from './mall-bulk-sheet-files.adapter';

const adapter = new MallBulkSheetFilesAdapter();

function sample(): MallSheetSourceProduct {
  const overrides = [
    ['gmarket', '장난감/완구 > 감각발달완구 > 기타감각발달완구'],
    ['auction', '장난감/완구 > 감각발달완구 > 기타감각발달완구'],
    ['11st', '장난감 > 감각발달완구 > 비눗방울/버블건'],
    ['coupang', '완구/취미 > 보드게임 > 기타보드게임'],
    ['kidsnote', '선물/행사/체험 > 선물용품 > 장난감/완구'],
    ['kkomangse', '선물/행사용품 > 선물용품 > 비누방울/물총'],
    ['thirtymall', '출산/육아 > 완구/매트 > 캐릭터카드/딱지'],
  ].map(([mallKey, path]) => ({
    mallKey: mallKey!,
    salePrice: null,
    priceRateBp: null,
    name: null,
    detailHtml: null,
    promoText: null,
    adapterValues: { sabangnetCategoryPath: path! },
  }));
  // 티쳐몰은 이름표가 없어 몰별 값의 분류 번호를 그대로 쓴다.
  overrides.push({
    mallKey: 'teacher-mall',
    salePrice: null,
    priceRateBp: null,
    name: null,
    detailHtml: null,
    promoText: null,
    adapterValues: { sabangnetCategoryPath: '티처몰 > 학급운영 > 놀이활동 > 교육완구' },
  });
  return {
    id: '11111111-1111-4111-8111-111111111111',
    code: '100105',
    ownCode: null,
    name: '비눗방울 버블건 1p',
    brand: 'kiditem',
    manufacturer: '해피프랜즈',
    modelName: null,
    modelNo: null,
    originCountry: '중국',
    keywords: ['비눗방울'],
    taxType: 'taxable',
    salePrice: 5900,
    tagPrice: null,
    imageUrls: ['https://pic.sabangnet.co.kr/product_image/1.jpg'],
    detailHtml: '<center><img src="https://kiditem.diskn.com/T83fBBvdxE"></center>',
    noticeCategory: '035',
    certificationNumbers: [],
    optionAxes: [],
    options: [{ code: '100105-0001', values: [], extraPrice: 0, barcode: null, supplyStatus: 'selling' }],
    overrides,
    sabangnetImageUrls: [],
  };
}

async function fill(spec: MallBulkSheetSpec, fixed: Record<string, string> = {}) {
  const categories = new MallCategoryLookup(await adapter.categoryTables());
  const result = spec.rows(toMallSheetProduct(sample(), spec, categories), {
    fixed: resolveFixedValues(spec, fixed),
    categories,
  });
  expect(result.problems).toEqual([]);
  const buffer = await adapter.write(spec.template, result.rows);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[spec.template.sheet]!, { header: 1, defval: null, raw: true });
  // 안내행을 지우고 올리는 양식은 머리행이 1행, 상품이 2행부터다.
  const headerRow = spec.template.emit === 'headers' ? 1 : spec.template.headerRow;
  const firstDataRow = spec.template.emit === 'headers' ? 2 : spec.template.firstDataRow;
  const header = (rows[headerRow - 1] ?? []).map((cell) => String(cell ?? '').replace(/\s+/g, ' ').trim());
  const data = rows[firstDataRow - 1] ?? [];
  const cell = (name: string) => data[header.indexOf(name)];
  return { rows, data, cell, header };
}

describe('MallBulkSheetFilesAdapter', () => {
  it('resolves every Sabangnet test path from the stored mall category tables', async () => {
    const categories = new MallCategoryLookup(await adapter.categoryTables());
    expect(categories.code('gmarket', '장난감/완구 > 감각발달완구 > 기타감각발달완구')).toBe('100000042200001589300028350');
    expect(categories.code('auction', '장난감/완구 > 감각발달완구 > 기타감각발달완구')).toBe('20141000');
    expect(categories.esmCode('100000042200001589300028350')).toBe('00310013000100010000');
    expect(categories.code('11st', '장난감 > 물놀이용품 > 물총')).toBe('1010984');
    expect(categories.coupang(categories.code('coupang', '완구/취미 > 보드게임 > 기타보드게임'))?.purchaseOptions)
      .toEqual([{ name: '수량', required: true, unit: '개', pickOne: false }]);
  });

  it('fills the ESM template from row 8 and keeps codes as text', async () => {
    const spec = MALL_BULK_SHEETS.find((sheet) => sheet.sheetKey === 'esm')!;
    const { rows, cell } = await fill(spec);
    expect(String(rows[0]?.[2])).toContain('NEW 2.0');
    expect(cell('카테고리 코드')).toBe('00310013000100010000');
    expect(cell('상품명')).toBe('비눗방울 버블건 1p');
    expect(cell('G 판매가')).toBe(5900);
    expect(rows[7]?.[0]).toBe(1);
    expect(rows).toHaveLength(507);
  });

  it('fills the 11st template from row 4 after dropping the guide and example rows', async () => {
    const spec = MALL_BULK_SHEETS.find((sheet) => sheet.sheetKey === '11st')!;
    const { rows, cell } = await fill(spec);
    expect(String(rows[2]?.[0])).toContain('2.50');
    expect(cell('카테고리코드')).toBe('1010963');
    expect(cell('고시유형코드')).toBe('891045');
    expect(rows).toHaveLength(4);
  });

  it('fills the Coupang Wing Ver.4.6 template from row 5 and clears the prefilled category rows', async () => {
    const spec = MALL_BULK_SHEETS.find((sheet) => sheet.sheetKey === 'coupang')!;
    const { rows, cell } = await fill(spec);
    expect(String(rows[3]?.[0])).toContain('Ver.4.6');
    expect(cell('카테고리')).toBe('[77448] 완구/취미>보드게임>기타보드게임');
    expect(cell('옵션유형1')).toBe('수량');
    expect(cell('옵션값1')).toBe('1개');
    expect(rows).toHaveLength(5);
  });

  it('fills the Kidsnote sample from row 2 in place of the sample product', async () => {
    const spec = MALL_BULK_SHEETS.find((sheet) => sheet.sheetKey === 'kidsnote')!;
    const { rows, cell } = await fill(spec);
    expect(cell('상품명')).toBe('[키드아이템] 비눗방울 버블건 1p');
    expect(cell('대분류')).toBe('선물/행사/체험');
    expect(rows.flat()).not.toContain('샘플 상품명');
  });

  it('fills the Kkomangse sample in place of its two example products', async () => {
    const spec = MALL_BULK_SHEETS.find((sheet) => sheet.sheetKey === 'kkomangse')!;
    const { rows, cell } = await fill(spec);
    expect(cell('대표상품명')).toBe('비눗방울 버블건 1p');
    expect([cell('1차 분류'), cell('2차 분류'), cell('3차 분류')]).toEqual(['선물/행사용품', '선물용품', '비누방울/물총']);
    expect(cell('판매가 (납품가 입력시 생략가능)')).toBe(5900);
    expect(cell('목록 기본이미지 (외부URL만)')).toBe('https://pic.sabangnet.co.kr/product_image/1.jpg');
    expect(String(cell('상품설명 (엔터제외)'))).not.toContain('\n');
    expect(rows.flat()).not.toContain('샘플 상품 A');
  });

  it('writes the Thirtymall sheet without the guide rows and resolves its standard category', async () => {
    const spec = MALL_BULK_SHEETS.find((sheet) => sheet.sheetKey === 'thirtymall')!;
    const { rows, cell, header } = await fill(spec, { manager: '169983' });
    // 안내행을 지운 모양 — 첫 줄이 칸 제목, 둘째 줄이 상품 하나.
    expect(header[0]).toBe('상품군');
    expect(rows).toHaveLength(2);
    expect(cell('표준카테고리')).toBe('1010980');
    expect(cell('담당자')).toBe('169983');
    expect(cell('판매가')).toBe(5900);
    expect(cell('원산지')).toBe('40037');
    expect(String(cell('상품이미지')).split('\n')[0]).toBe('main^|^https://pic.sabangnet.co.kr/product_image/1.jpg');
    expect(cell('상품정보고시 유형')).toBe('40');
    expect(cell('상품정보고시 항목1')).toBe('비눗방울 버블건 1p');
  });

  it('writes the Teacherville sheet without the guide rows and prices it by the supply rate', async () => {
    const spec = MALL_BULK_SHEETS.find((sheet) => sheet.sheetKey === 'teacherville')!;
    const { rows, cell, header } = await fill(spec);
    expect(header[1]).toBe('*상품번호');
    expect(rows).toHaveLength(2);
    expect(cell('카테고리')).toBe('0001000300050004');
    expect(cell('*상품명')).toBe('비눗방울 버블건 1p');
    expect(cell('할인가(판매가)')).toBe(5900);
    expect(cell('공급가')).toBe(4720);
    expect(cell('상품정보고시품목')).toBe('40');
    expect(String(cell('상품정보고시')).startsWith('품명 및 모델명=비눗방울 버블건 1p^')).toBe(true);
  });

  it('refuses rows that name a column the template does not have', async () => {
    const spec = MALL_BULK_SHEETS.find((sheet) => sheet.sheetKey === 'kidsnote')!;
    await expect(adapter.write(spec.template, [{ 없는칸: 'x' }])).rejects.toThrow('없는 칸: 없는칸');
  });
});
