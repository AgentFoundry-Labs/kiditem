import type { SabangnetImportIssue } from '@kiditem/shared/sales-product';
export type ParsedWingCatalogRow = {
  rowNumber: number;
  externalProductId: string;
  registeredName: string | null;
  displayName: string | null;
  category: string | null;
  manufacturer: string | null;
  brand: string | null;
  productStatus: string | null;
  externalSkuId: string;
  optionName: string | null;
  skuStatus: string | null;
  modelNumber: string | null;
  barcode: string | null;
  attributesJson: Array<{ type: string; value: string }>;
  rawJson: Record<string, unknown>;
};

export type ParsedWingCatalogSkippedRow = {
  rowNumber: number;
  reason: 'missing_product_id' | 'missing_sku_id';
  externalProductId: string | null;
  externalSkuId: string | null;
};

export type ParsedWingCatalogWorkbook = {
  rows: ParsedWingCatalogRow[];
  skippedRows: ParsedWingCatalogSkippedRow[];
  headers: string[];
};


export type ParsedRocketSellpiaMatchingCsvRow = {
  rowNumber: number;
  externalSkuId: string;
  vendorItemId: string | null;
  productName: string;
  supplierStatus: string | null;
  channelBarcode: string | null;
  sellpiaProductName: string | null;
  sellpiaBarcode: string | null;
  matchMethod: string | null;
  confidence: string | null;
  sellpiaStoredMatch: boolean;
  kiditemSynchronized: boolean;
  matchStatus: string | null;
  evidence: string | null;
  rawJson: Record<string, string>;
};

export type ParsedRocketSellpiaMatchingCsv = {
  headers: string[];
  rows: ParsedRocketSellpiaMatchingCsvRow[];
};


export interface SabangnetProductRow {
  row: number;
  goodsNo: string | null;
  ownCode: string | null;
  name: string;
  shortName: string | null;
  modelName: string | null;
  modelNo: string | null;
  brand: string | null;
  keywords: string[];
  standardCategory: string | null;
  manufacturer: string | null;
  originCountry: string | null;
  originRegion: string | null;
  statusCode: string | null;
  taxCode: string | null;
  deliveryCode: string | null;
  deliveryFee: number | null;
  costPrice: number | null;
  salePrice: number | null;
  tagPrice: number | null;
  optionTitles: string[];
  optionValueLists: string[][];
  stockManaged: boolean;
  imageUrls: string[];
  detailHtml: string | null;
  extraDetailHtml: string[];
  certification: {
    number: string;
    issuer: string | null;
    field: string | null;
    validFrom: string | null;
    validTo: string | null;
    issuedAt: string | null;
    certifiedAt: string | null;
    imageUrl: string | null;
  } | null;
  noticeCategory: string | null;
  noticeValues: string[];
  englishName: string | null;
  printName: string | null;
  importDeclarationNo: string | null;
  adminMemo: string | null;
  /** 상세 · 이미지를 뺀 원문 칸(빈 칸 제외). */
  raw: Record<string, string>;
}

export interface SabangnetOptionRow {
  row: number;
  optionCode: string;
  goodsNo: string;
  optionTitle: string | null;
  optionValue: string | null;
  extraPrice: number;
  supplyStatusCode: string | null;
  safetyStock: number | null;
  alias: string | null;
  modelName: string | null;
  ownCode: string | null;
}

export interface SabangnetChannelOverrideRow {
  row: number;
  goodsNo: string;
  shopCode: string;
  shopName: string | null;
  salePrice: number | null;
  /** 사방넷 `적용율(%)`을 저장소 계약의 만분율로 바꾼 값. */
  priceRateBp: number | null;
  name: string | null;
  detailHtml: string | null;
  promoText: string | null;
  noticeCategory: string | null;
  costPrice: number | null;
  stockPercent: number | null;
  raw: Record<string, string>;
}

/**
 * 사방넷 쇼핑몰상품수정 다운로드 한 줄 — 몰 × 상품 송신 기록. 몰 로그인 ID(쇼핑몰ID) 칸은 읽지 않는다.
 */
export interface SabangnetSendRecordRow {
  row: number;
  shopCode: string;
  mallProductCode: string;
  goodsNo: string;
  additionCode: string | null;
  categoryCode: string | null;
  sentStatus: string | null;
  sentPrice: number | null;
}

/** 쇼핑몰카테고리 수정파일 한 줄 — 사방넷 카테고리코드 → 그 몰의 분류 경로. */
export interface SabangnetMallCategoryRow {
  row: number;
  code: string;
  mallName: string | null;
  title: string | null;
  path: string | null;
  active: boolean;
}

/** 쇼핑몰부가정보 수정파일 한 줄 — 몰별 등록 틀(배송 조건 이름 · 기본 분류 · 상품명 앞뒤 문구 · 상세 위아래 문구). */
export interface SabangnetMallTemplateRow {
  row: number;
  code: string;
  mallName: string | null;
  title: string | null;
  path: string | null;
  active: boolean;
  namePrefix: string | null;
  nameSuffix: string | null;
  detailTop: string | null;
  detailBottom: string | null;
}

export type ParsedSabangnetWorkbook =
  | { kind: 'products'; name: string; rows: SabangnetProductRow[]; issues: SabangnetImportIssue[] }
  | { kind: 'send_records'; name: string; rows: SabangnetSendRecordRow[]; issues: SabangnetImportIssue[] }
  | { kind: 'options'; name: string; rows: SabangnetOptionRow[]; issues: SabangnetImportIssue[] }
  | { kind: 'channel_overrides'; name: string; rows: SabangnetChannelOverrideRow[]; issues: SabangnetImportIssue[] }
  | { kind: 'mall_categories'; name: string; rows: SabangnetMallCategoryRow[]; issues: SabangnetImportIssue[] }
  | { kind: 'mall_templates'; name: string; rows: SabangnetMallTemplateRow[]; issues: SabangnetImportIssue[] };
