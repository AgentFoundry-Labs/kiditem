import { BadRequestException, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';

const BASE_SHEET = '기본';
const DATA_START_ROW = 4;
const DEFAULT_FILE_PREFIX = '쿠팡WING_일괄등록_';

const WING_COL = {
  category: 0,
  name: 1,
  brand: 6,
  maker: 7,
  searchKeyword: 8,
  purchaseOptStart: 9,
  purchaseOptCount: 6,
  searchOptStart: 21,
  searchOptCount: 20,
  price: 61,
  origPrice: 63,
  stock: 64,
  adult: 68,
  tax: 69,
  parallel: 70,
  vendorCode: 72,
  model: 73,
  barcode: 74,
  noticeCat: 88,
  noticeValStart: 89,
  noticeValCount: 14,
  imgRep: 103,
  imgAddl: 105,
  detail: 109,
  total: 117,
} as const;

const DEFAULT_NO_BARCODE_REASON =
  '[바코드없음]온라인 판매를 위한 소규모 상품(자가제작 등)이며, 향후에도 대량 유통 계획이 없습니다.';

type WingOption = { type: string; value: string };
type WingVariant = {
  purchaseOptions: WingOption[];
  salePrice: number;
  origPrice?: number;
  stock: number;
  barcode?: string;
  representativeImageUrl: string;
  vendorItemCode?: string;
  model?: string;
};
type WingProduct = {
  categoryCell: string;
  productName: string;
  brand: string;
  maker: string;
  searchKeyword?: string;
  searchOptions?: WingOption[];
  additionalImageUrls?: string[];
  detailImageUrls?: string[];
  noticeCategory: string;
  noticeValues?: string[];
  variants: WingVariant[];
};

export type CoupangWingRegistrationExportResult = {
  buffer: Buffer;
  fileName: string;
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  productCount: number;
  rowCount: number;
};

@Injectable()
export class CoupangWingRegistrationExportService {
  convert(
    templateBuffer: Buffer,
    products: unknown,
    requestedFileName?: string,
  ): CoupangWingRegistrationExportResult {
    if (!templateBuffer.length) {
      throw new BadRequestException('WING 양식 템플릿이 필요합니다.');
    }
    if (!Array.isArray(products) || products.length === 0) {
      throw new BadRequestException('등록할 상품이 없습니다.');
    }

    const normalizedProducts = products.map((product, index) => normalizeProduct(product, index));
    const workbook = readWorkbook(templateBuffer);
    const sheet = workbook.Sheets[BASE_SHEET];
    if (!sheet) throw new BadRequestException(`양식에 "${BASE_SHEET}" 시트가 없습니다.`);

    const grid = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      blankrows: false,
    });
    assertBaseSheetLayout(grid[1] ?? []);
    XLSX.utils.sheet_add_aoa(
      sheet,
      normalizedProducts.flatMap(buildProductRows),
      { origin: DATA_START_ROW },
    );

    const output = XLSX.utils.book_new();
    for (const name of workbook.SheetNames) {
      if (new Set([BASE_SHEET, 'hidden', 'env']).has(name)) {
        XLSX.utils.book_append_sheet(output, workbook.Sheets[name], name);
      }
    }

    const buffer = Buffer.from(XLSX.write(output, { type: 'buffer', bookType: 'xlsx' }));
    return {
      buffer,
      fileName: normalizeFileName(requestedFileName),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      productCount: normalizedProducts.length,
      rowCount: normalizedProducts.reduce((count, product) => count + product.variants.length, 0),
    };
  }
}

function readWorkbook(templateBuffer: Buffer): XLSX.WorkBook {
  try {
    return XLSX.read(templateBuffer, { type: 'buffer' });
  } catch {
    throw new BadRequestException('WING 양식 템플릿을 읽을 수 없습니다.');
  }
}

function normalizeProduct(value: unknown, index: number): WingProduct {
  if (!isRecord(value)) {
    throw new BadRequestException(`상품 ${index + 1}이 유효하지 않습니다.`);
  }
  const variants = Array.isArray(value.variants) ? value.variants : [];
  if (variants.length === 0) {
    throw new BadRequestException(`상품 "${String(value.productName ?? '')}" 에 variant(SKU) 가 없습니다.`);
  }
  return {
    categoryCell: stringValue(value.categoryCell),
    productName: stringValue(value.productName),
    brand: stringValue(value.brand),
    maker: stringValue(value.maker),
    searchKeyword: optionalString(value.searchKeyword),
    searchOptions: optionsValue(value.searchOptions),
    additionalImageUrls: stringArray(value.additionalImageUrls),
    detailImageUrls: stringArray(value.detailImageUrls),
    noticeCategory: stringValue(value.noticeCategory),
    noticeValues: stringArray(value.noticeValues),
    variants: variants.map((variant, variantIndex) => normalizeVariant(variant, index, variantIndex)),
  };
}

function normalizeVariant(value: unknown, productIndex: number, variantIndex: number): WingVariant {
  if (!isRecord(value)) {
    throw new BadRequestException(`상품 ${productIndex + 1}의 variant ${variantIndex + 1}이 유효하지 않습니다.`);
  }
  return {
    purchaseOptions: optionsValue(value.purchaseOptions) ?? [],
    salePrice: numberValue(value.salePrice),
    origPrice: optionalNumber(value.origPrice),
    stock: numberValue(value.stock),
    barcode: optionalString(value.barcode),
    representativeImageUrl: stringValue(value.representativeImageUrl),
    vendorItemCode: optionalString(value.vendorItemCode),
    model: optionalString(value.model),
  };
}

function buildProductRows(product: WingProduct): string[][] {
  return product.variants.map((variant) => {
    const row = new Array<string>(WING_COL.total).fill('');
    row[WING_COL.category] = product.categoryCell;
    row[WING_COL.name] = product.productName;
    row[WING_COL.brand] = product.brand;
    row[WING_COL.maker] = product.maker || product.brand;
    if (product.searchKeyword) row[WING_COL.searchKeyword] = product.searchKeyword;

    variant.purchaseOptions.slice(0, WING_COL.purchaseOptCount).forEach((option, index) => {
      row[WING_COL.purchaseOptStart + index * 2] = option.type;
      row[WING_COL.purchaseOptStart + index * 2 + 1] = option.value;
    });
    (product.searchOptions ?? []).slice(0, WING_COL.searchOptCount).forEach((option, index) => {
      row[WING_COL.searchOptStart + index * 2] = option.type;
      row[WING_COL.searchOptStart + index * 2 + 1] = option.value;
    });

    row[WING_COL.price] = String(variant.salePrice);
    row[WING_COL.origPrice] = String(variant.origPrice ?? variant.salePrice);
    row[WING_COL.stock] = String(variant.stock);
    row[WING_COL.adult] = 'N';
    row[WING_COL.tax] = 'Y';
    row[WING_COL.parallel] = 'N';
    if (variant.vendorItemCode) row[WING_COL.vendorCode] = variant.vendorItemCode;
    if (variant.model) row[WING_COL.model] = variant.model;
    row[WING_COL.barcode] = variant.barcode || DEFAULT_NO_BARCODE_REASON;
    row[WING_COL.noticeCat] = product.noticeCategory;
    (product.noticeValues ?? []).slice(0, WING_COL.noticeValCount).forEach((value, index) => {
      row[WING_COL.noticeValStart + index] = value;
    });
    row[WING_COL.imgRep] = variant.representativeImageUrl;
    if (product.additionalImageUrls?.length) {
      row[WING_COL.imgAddl] = product.additionalImageUrls.join(',');
    }
    if (product.detailImageUrls?.length) row[WING_COL.detail] = product.detailImageUrls[0]!;
    return row;
  });
}

function assertBaseSheetLayout(headerRow: string[]): void {
  const checks: Array<[number, string]> = [
    [WING_COL.category, '카테고리'],
    [WING_COL.name, '등록상품명'],
    [WING_COL.brand, '브랜드'],
    [WING_COL.price, '판매가격'],
    [WING_COL.stock, '재고수량'],
    [WING_COL.barcode, '바코드'],
    [WING_COL.noticeCat, '상품고시정보 카테고리'],
    [WING_COL.detail, '상세 설명'],
  ];
  for (const [index, expected] of checks) {
    const actual = String(headerRow[index] ?? '').trim();
    if (actual !== expected) {
      throw new BadRequestException(
        `WING 양식 레이아웃 불일치: 컬럼 ${index} 는 "${expected}" 여야 하는데 "${actual}" 입니다. 양식 버전이 바뀌었는지 확인하세요.`,
      );
    }
  }
}

function normalizeFileName(requestedFileName?: string): string {
  const fallback = `${DEFAULT_FILE_PREFIX}${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;
  if (!requestedFileName) return fallback;
  if (
    requestedFileName.length > 180
    || requestedFileName !== requestedFileName.trim()
    || /[\r\n/\\]/.test(requestedFileName)
    || !requestedFileName.toLowerCase().endsWith('.xlsx')
  ) {
    throw new BadRequestException('WING 출력 파일명이 유효하지 않습니다.');
  }
  return requestedFileName;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function optionalString(value: unknown): string | undefined {
  return value == null ? undefined : stringValue(value);
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map(stringValue) : undefined;
}

function optionsValue(value: unknown): WingOption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isRecord).map((option) => ({
    type: stringValue(option.type),
    value: stringValue(option.value),
  }));
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0;
}

function optionalNumber(value: unknown): number | undefined {
  return value == null ? undefined : numberValue(value);
}
