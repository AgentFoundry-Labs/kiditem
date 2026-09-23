import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { MALL_BULK_SHEETS } from '../../../domain/registration/bulk-sheet/mall-bulk-sheet-registry';
import { MallCategoryLookup } from '../../../domain/registration/bulk-sheet/mall-sheet-categories';
import { resolveFixedValues, type MallBulkSheetSpec } from '../../../domain/registration/bulk-sheet/mall-bulk-sheet';
import { toMallSheetProduct, type MallSheetSourceProduct } from '../../../domain/registration/bulk-sheet/mall-sheet-product';
import { MallBulkSheetFilesAdapter } from './mall-bulk-sheet-files.adapter';

const adapter = new MallBulkSheetFilesAdapter();

function sample(): MallSheetSourceProduct {
  const overrides: NonNullable<MallSheetSourceProduct['overrides']> = [
    ['gmarket', '장난감/완구 > 감각발달완구 > 기타감각발달완구'],
    ['auction', '장난감/완구 > 감각발달완구 > 기타감각발달완구'],
    ['11st', '장난감 > 감각발달완구 > 비눗방울/버블건'],
    ['coupang', '완구/취미 > 보드게임 > 기타보드게임'],
    ['kidsnote', '선물/행사/체험 > 선물용품 > 장난감/완구'],
    ['kkomangse', '선물/행사용품 > 선물용품 > 비누방울/물총'],
    ['thirtymall', '출산/육아 > 완구/매트 > 캐릭터카드/딱지'],
    ['lotte-on', '장난감/완구 > 감각발달완구 > 비눗방울'],
    ['domeggook', '유아동 > 완구/매트 > 감각발달완구 > 링쌓기/컵쌓기'],
    ['icecream-mall', '아이스크림몰 > 유치원 > 브랜드마켓 > 장난감/완구'],
  ].map(([mallKey, path]) => ({
    mallKey: mallKey!,
    adapterValues: { sabangnetCategoryPath: path! },
  }));
  // 아트공구(카페24)는 분류표가 없어 몰별 값의 분류 번호를 그대로 쓴다.
  overrides.push({
    mallKey: 'art09',
    adapterValues: { categoryCode: '29' },
  });
  // 온채널은 공급가를 사람이 정한다(판매가에서 역산하지 않는다).
  overrides.push({
    mallKey: 'onch',
    adapterValues: { sabangnetCategoryPath: '출산/육아 > 완구/인형 > 감각발달완구 > 비눗방울', supplyPrice: '3200' },
  });
  // 스마트스토어는 분류표가 없어 몰별 값의 카테고리 번호를 그대로 쓴다.
  overrides.push({
    mallKey: 'smartstore',
    adapterValues: { categoryCode: '50003307' },
  });
  // 티쳐몰은 이름표가 없어 몰별 값의 분류 번호를 그대로 쓴다.
  overrides.push({
    mallKey: 'teacher-mall',
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
    keywords: ['비눗방울', '버블건', '물놀이', '여름완구', '어린이날'],
    status: 'active' as const,
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

  it('writes the Lotte ON template from row 5 and clears its guide rows', async () => {
    const spec = MALL_BULK_SHEETS.find((sheet) => sheet.sheetKey === 'lotte-on')!;
    const { rows, cell } = await fill(spec);
    expect(String(rows[1]?.[1])).toBe('카테고리코드');
    // 필수 · 예시 행은 비운다 — 예시 상품이 몰에 올라가지 않게.
    expect((rows[2] ?? []).filter(Boolean)).toEqual([]);
    expect((rows[3] ?? []).filter(Boolean)).toEqual([]);
    expect(cell('카테고리코드')).toBe('BC55010400');
    expect(cell('상품명')).toBe('비눗방울 버블건 1p');
    expect(cell('판매가')).toBe(5900);
    expect(cell('대표이미지')).toBe('https://pic.sabangnet.co.kr/product_image/1.jpg');
    expect(rows).toHaveLength(5);
  });

  it('writes the Domeggook sheet with the guide codes and a one-step unit price', async () => {
    const spec = MALL_BULK_SHEETS.find((sheet) => sheet.sheetKey === 'domeggook')!;
    const { cell } = await fill(spec, { returnAddress: 'SA1234567' });
    expect(cell('카테고리고유번호')).toBe('5576');
    expect(cell('판매채널')).toBe('도매꾹,도매매');
    expect(cell('도매꾹 / 판매단가')).toBe('1:5900');
    expect(cell('상품정보제공고시 구분코드')).toBe(40);
    expect(String(cell('상품정보제공고시 세부항목')).split('\n')[0]).toBe('1:비눗방울 버블건 1p');
    expect(cell('반품배송지')).toBe('SA1234567');
    expect(cell('원산지')).toBe('수입산_아시아_중국');
  });

  it('writes the Artgonggu CSV with the header row first', async () => {
    const spec = MALL_BULK_SHEETS.find((sheet) => sheet.sheetKey === 'artgonggu')!;
    const { rows, cell, header } = await fill(spec);
    expect(header[0]).toBe('상품코드');
    expect(rows).toHaveLength(2);
    expect(String(cell('상품분류 번호'))).toBe('29');
    expect(cell('상품명')).toBe('비눗방울 버블건 1p');
    expect(cell('판매가')).toBe(5900);
    expect(cell('이미지등록(상세)')).toBe('https://pic.sabangnet.co.kr/product_image/1.jpg');
  });

  it('fills the Smartstore template from row 3 after dropping the guide rows', async () => {
    const spec = MALL_BULK_SHEETS.find((sheet) => sheet.sheetKey === 'smartstore')!;
    const { rows, cell, header } = await fill(spec);
    // 1행 묶음 제목 · 2행 칸 이름은 남고, 작성 가이드(3~6행)는 상품 행이 덮는다.
    expect(header[0]).toBe('판매자 상품코드');
    expect(rows).toHaveLength(3);
    expect(String(cell('카테고리코드'))).toBe('50003307');
    expect(cell('상품명')).toBe('비눗방울 버블건 1p');
    expect(cell('판매가')).toBe(5900);
    expect(cell('재고수량')).toBe(999);
    expect(cell('대표이미지')).toBe('https://pic.sabangnet.co.kr/product_image/1.jpg');
    expect(cell('원산지코드')).toBe('0200037');
    expect(cell('택배사코드')).toBe('CJGLS');
    expect(rows.flat()).not.toContain('베이지 골지니트원피스');
  });

  it('fills the Icecream mall template from row 3 with the category-driven notice items', async () => {
    const spec = MALL_BULK_SHEETS.find((sheet) => sheet.sheetKey === 'icecream-mall')!;
    const { rows, cell, header } = await fill(spec);
    expect(header[0]).toBe('상품명');
    expect(rows).toHaveLength(3);
    expect(cell('상품명')).toBe('비눗방울 버블건 1p');
    expect(cell('표준카테고리 번호')).toBe('BC0116100100');
    expect(cell('입점사 번호')).toBe('1482');
    expect(cell('판매가')).toBe(5900);
    expect(cell('공급원가 (직접입력)')).toBe(4425);
    expect(cell('업체가A')).toBe(5310);
    expect(cell('상품고시 품목코드')).toBe('023');
    expect(cell('고시항목명칭1')).toBe('품명 및 모델명');
    expect(cell('고시항목내용1')).toBe('비눗방울 버블건 1p');
    expect(cell('안전인증 대상여부')).toBe('N');
    expect(rows.flat()).not.toContain('상품샘플');
  });

  it('fills the Onchannel form from row 4 and keeps the guide rows above it', async () => {
    const spec = MALL_BULK_SHEETS.find((sheet) => sheet.sheetKey === 'onch')!;
    const { rows, cell, header } = await fill(spec);
    expect(header[0]).toBe('분류');
    expect(String(rows[1]?.[0])).toContain('필수');
    expect(rows).toHaveLength(4);
    expect(String(cell('분류'))).toBe('50004224');
    expect(cell('온채널공급가')).toBe(3200);
    expect(cell('택배사')).toBe(38);
    expect(cell('메인이미지(600x600)')).toBe('https://pic.sabangnet.co.kr/product_image/1.jpg');
    expect(cell('상품고시구분')).toBe(26);
    expect(rows.flat()).not.toContain('시원한 아이스티');
  });

  it('refuses rows that name a column the template does not have', async () => {
    const spec = MALL_BULK_SHEETS.find((sheet) => sheet.sheetKey === 'kidsnote')!;
    await expect(adapter.write(spec.template, [{ 없는칸: 'x' }])).rejects.toThrow('없는 칸: 없는칸');
  });
});
