import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { CoupangWingRegistrationExportService } from '../coupang-wing-registration-export.service';

const headerRow = new Array<string>(117).fill('');
headerRow[0] = '카테고리';
headerRow[1] = '등록상품명';
headerRow[6] = '브랜드';
headerRow[61] = '판매가격';
headerRow[64] = '재고수량';
headerRow[74] = '바코드';
headerRow[88] = '상품고시정보 카테고리';
headerRow[109] = '상세 설명';

function templateBuffer(): Buffer {
  const workbook = XLSX.utils.book_new();
  const base = XLSX.utils.aoa_to_sheet([
    new Array(117).fill(''),
    headerRow,
    ['설명'],
    ['보존'],
  ]);
  base['!cols'] = [{ wch: 24 }];
  XLSX.utils.book_append_sheet(workbook, base, '기본');
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['hidden']]),
    'hidden',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['env']]),
    'env',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['example']]),
    '1. 예시',
  );
  return Buffer.from(
    XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
  );
}

const products = [
  {
    categoryCell: '[77390] 완구/취미>스포츠/야외완구>물총',
    productName: '선인장 딸깍 키링 1p',
    brand: '노브랜드',
    maker: '해피프랜즈',
    searchKeyword: '키링,완구',
    searchOptions: [{ type: '색상', value: '초록' }],
    additionalImageUrls: ['https://cdn.example/thumb.png'],
    noticeCategory: '어린이제품',
    noticeValues: ['상세페이지 참조'],
    variants: [
      {
        purchaseOptions: [{ type: '색상', value: '단일' }],
        salePrice: 2200,
        origPrice: 3000,
        stock: 999,
        representativeImageUrl: 'https://cdn.example/rep.png',
        vendorItemCode: '10451-1',
      },
    ],
  },
];

describe('CoupangWingRegistrationExportService', () => {
  it('preserves the template sheets and writes the existing product row layout server-side', () => {
    const result = new CoupangWingRegistrationExportService().convert(
      templateBuffer(),
      products,
      '쿠팡WING_일괄등록_20260907.xlsx',
    );
    const workbook = XLSX.read(result.buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets['기본']!, {
      header: 1,
      blankrows: false,
    });

    expect(result.fileName).toBe('쿠팡WING_일괄등록_20260907.xlsx');
    expect(result.productCount).toBe(1);
    expect(result.rowCount).toBe(1);
    expect(workbook.SheetNames).toEqual(['기본', 'hidden', 'env']);
    expect(rows[4]?.[0]).toBe(products[0]!.categoryCell);
    expect(rows[4]?.[1]).toBe(products[0]!.productName);
    expect(rows[4]?.[61]).toBe('2200');
    expect(rows[4]?.[72]).toBe('10451-1');
    expect(rows[3]?.[0]).toBe('보존');
  });

  it('rejects an invalid template layout without persisting an output', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([['wrong']]),
      '기본',
    );
    const invalid = Buffer.from(
      XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
    );

    expect(() =>
      new CoupangWingRegistrationExportService().convert(invalid, products),
    ).toThrow('WING 양식 레이아웃 불일치');
  });

  it('rejects a registration row whose numeric fields cannot be parsed', () => {
    const invalidProducts = [
      {
        ...products[0],
        variants: [{ ...products[0]!.variants[0], salePrice: 'not-a-price' }],
      },
    ];

    expect(() =>
      new CoupangWingRegistrationExportService().convert(
        templateBuffer(),
        invalidProducts,
      ),
    ).toThrow(/salePrice/);
  });
});
