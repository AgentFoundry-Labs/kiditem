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
  ].map(([mallKey, path]) => ({
    mallKey: mallKey!,
    salePrice: null,
    priceRateBp: null,
    name: null,
    detailHtml: null,
    promoText: null,
    adapterValues: { sabangnetCategoryPath: path! },
  }));
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

async function fill(spec: MallBulkSheetSpec) {
  const categories = new MallCategoryLookup(await adapter.categoryTables());
  const result = spec.rows(toMallSheetProduct(sample(), spec, categories), {
    fixed: resolveFixedValues(spec, {}),
    categories,
  });
  expect(result.problems).toEqual([]);
  const buffer = await adapter.write(spec.template, result.rows);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[spec.template.sheet]!, { header: 1, defval: null, raw: true });
  const header = (rows[spec.template.headerRow - 1] ?? []).map((cell) => String(cell ?? '').replace(/\s+/g, ' ').trim());
  const data = rows[spec.template.firstDataRow - 1] ?? [];
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

  it('refuses rows that name a column the template does not have', async () => {
    const spec = MALL_BULK_SHEETS.find((sheet) => sheet.sheetKey === 'kidsnote')!;
    await expect(adapter.write(spec.template, [{ 없는칸: 'x' }])).rejects.toThrow('없는 칸: 없는칸');
  });
});
