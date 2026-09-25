import type {
  CoupangCatalogBasicOptionV1,
  CoupangCatalogBasicProductV1,
  CoupangCatalogDetailProductV1,
} from '@kiditem/shared/coupang-catalog-snapshot';

/**
 * Wing 목록·상세 응답 → 서버 청크 원소(`WingCatalogListingBasicsItemSchema`·`WingCatalogFullDetailsItemSchema`).
 * 옛 `kiditem-os/shared/coupang-catalog-collector.js`의 순수 함수를 옮겼다(KID-354). 모양이 틀린 응답은 추측하지
 * 않고 던진다 — 불완전한 목록을 완결로 올리지 않는다.
 */

const MAX_ATTRIBUTES_PER_OPTION = 100;
const MAX_MEDIA_PER_OWNER = 100;
const MAX_DOCUMENTS_PER_PRODUCT = 2_000;
const MAX_DOCUMENT_BYTES = 64 * 1024;
const MAX_RAW_BYTES = 64 * 1024;
const MAX_PRODUCT_BYTES = 512 * 1024;
export const WING_CATALOG_PAGE_SIZE = 500;

type JsonRecord = Record<string, unknown>;

export class WingPayloadError extends Error {
  constructor(message: string, readonly code = 'WING_CATALOG_PAYLOAD_INVALID') {
    super(message);
    this.name = 'WingPayloadError';
  }
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  return `{${Object.entries(value as JsonRecord)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
    .join(',')}}`;
}

const encoder = new TextEncoder();
export function jsonByteLength(value: unknown): number {
  return encoder.encode(stableStringify(value)).byteLength;
}

function assertJsonBytes<T>(value: T, maxBytes: number, message: string): T {
  const bytes = jsonByteLength(value);
  if (bytes > maxBytes) throw new WingPayloadError(`${message} (${bytes}/${maxBytes} bytes)`, 'WING_CATALOG_PAYLOAD_TOO_LARGE');
  return value;
}

/** Wing 목록 검색(`POST /tenants/seller-web/v2/vendor-inventory/search`) 본문. 삭제 상품은 빼고 500개씩. */
export function buildWingCatalogSearchBody(page: number): JsonRecord {
  return {
    ...searchBase(),
    displayDeletedProduct: false,
    countPerPage: WING_CATALOG_PAGE_SIZE,
    page: requiredPositiveInteger(page, 'Wing 페이지'),
  };
}

/**
 * 사라진 상품 확인용 검색 본문(KID-351 실측): `PRODUCT_ID`로 최대 100개를 묻는다. `displayDeletedProduct: true`면
 * 삭제된 상품만, `false`면 삭제되지 않은 상품만 돌려준다.
 */
export function buildWingProductIdSearchBody(ids: readonly string[], displayDeletedProduct: boolean): JsonRecord {
  if (ids.length === 0 || ids.length > 100) throw new WingPayloadError('Wing 상품 ID 검색은 1~100개입니다');
  return {
    ...searchBase(),
    searchKeywordType: 'PRODUCT_ID',
    searchKeywords: ids.join(','),
    displayDeletedProduct,
    countPerPage: WING_CATALOG_PAGE_SIZE,
    page: 1,
  };
}

function searchBase(): JsonRecord {
  return {
    searchKeywordType: 'ALL',
    searchKeywords: '',
    salesMethod: 'ALL',
    productStatus: ['ALL'],
    stockSearchType: 'ALL',
    shippingFeeSearchType: 'ALL',
    displayCategoryCodes: [],
    listingStartTime: null,
    listingEndTime: null,
    saleEndDateSearchType: 'ALL',
    bundledShippingSearchType: 'ALL',
    shippingMethod: 'ALL',
    exposureStatus: 'ALL',
    sortMethod: 'SORT_BY_ITEM_LEVEL_UNIT_SOLD',
    locale: 'ko_KR',
    coupangAttributeOptimized: false,
    upBundleSearchOption: 'ALL',
    exposureStatuses: [],
    qualityEnhanceTypes: [],
  };
}

export interface WingInventoryPage {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  products: CoupangCatalogBasicProductV1[];
}

/**
 * 목록 한 페이지를 검증해 목록 원소로 바꾼다. 페이지 크기·전체 수·페이지 수가 서로 맞고, 이 페이지의 행 수가
 * 전체 수에서 기대한 값과 같아야 한다. `expectedVendorId`가 있으면 다른 판매자의 행을 거절한다.
 */
export function normalizeWingCatalogSearchResponse(payload: unknown, page: number, expectedVendorId: string | null): WingInventoryPage {
  const requestedPage = requiredPositiveInteger(page, 'Wing 페이지');
  if (!isRecord(payload)) throw new WingPayloadError('Wing 상품 목록 API 응답이 올바르지 않습니다');
  if (Object.hasOwn(payload, 'success') && (payload.success !== true || payload.message !== null)) {
    throw new WingPayloadError('Wing 상품 목록 API 응답이 올바르지 않습니다');
  }
  const data = payload.data;
  const pagination = isRecord(data) ? data.pagination : undefined;
  const productList = isRecord(data) ? data.productList : undefined;
  if (!isRecord(data) || !Array.isArray(productList) || !isRecord(pagination)) {
    throw new WingPayloadError('Wing 상품 목록 API 데이터가 올바르지 않습니다');
  }
  const responsePage = requiredPositiveInteger(pagination.page, 'Wing 응답 페이지');
  const pageSize = requiredPositiveInteger(pagination.countPerPage, 'Wing 응답 페이지 크기');
  const totalItems = requiredNonNegativeInteger(pagination.totalCount, 'Wing 전체 상품 수');
  const totalPages = requiredNonNegativeInteger(pagination.totalPages, 'Wing 전체 페이지 수');
  if (responsePage !== requestedPage || pageSize !== WING_CATALOG_PAGE_SIZE) {
    throw new WingPayloadError('Wing 상품 목록 API 페이지 정보가 요청과 다릅니다');
  }
  const expectedPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
  if (totalPages !== expectedPages) throw new WingPayloadError('Wing 상품 목록 API 페이지 수가 전체 상품 수와 다릅니다');
  if (totalItems === 0) {
    if (requestedPage !== 1 || productList.length !== 0) throw new WingPayloadError('Wing 빈 상품 목록 API 응답이 올바르지 않습니다');
  } else {
    if (requestedPage > totalPages) throw new WingPayloadError('Wing 상품 목록 API 페이지가 범위를 벗어났습니다');
    const expectedRows = Math.min(pageSize, totalItems - ((requestedPage - 1) * pageSize));
    if (productList.length !== expectedRows) {
      throw new WingPayloadError(`Wing ${requestedPage}페이지 상품 수가 불완전합니다 (${productList.length}/${expectedRows})`);
    }
  }
  const seen = new Set<string>();
  const products = productList.map((row) => {
    if (!isRecord(row)) throw new WingPayloadError('Wing 상품 목록 행이 올바르지 않습니다');
    if (!Number.isSafeInteger(row.vendorInventoryId) || (row.vendorInventoryId as number) <= 0) {
      throw new WingPayloadError('Wing 상품 ID가 올바르지 않습니다');
    }
    const externalProductId = String(row.vendorInventoryId);
    if (seen.has(externalProductId)) throw new WingPayloadError(`Wing 상품 ID가 중복되었습니다: ${externalProductId}`);
    seen.add(externalProductId);
    if (row.vendorId !== undefined && (typeof row.vendorId !== 'string' || (expectedVendorId && row.vendorId !== expectedVendorId))) {
      throw new WingPayloadError(`Wing 판매자 ID가 수집 계정과 다릅니다: ${externalProductId}`);
    }
    requiredText(row.productName, 'Wing 상품명');
    return buildCatalogBasicProduct(row);
  });
  return { page: requestedPage, pageSize, totalItems, totalPages, products };
}

/** Wing 목록 행 하나 → 목록 원소. 목록이 판매 상태·재고·가격·SKU·바코드의 원천이다. */
export function buildCatalogBasicProduct(inventoryProduct: unknown): CoupangCatalogBasicProductV1 {
  if (!isRecord(inventoryProduct)) throw new WingPayloadError('Wing 상품 목록 행이 없습니다');
  const externalProductId = strictRequiredId(inventoryProduct.vendorInventoryId, 'vendorInventoryId');
  const items = Array.isArray(inventoryProduct.vendorInventoryItems) ? inventoryProduct.vendorInventoryItems : [];
  if (items.length === 0) throw new WingPayloadError(`Wing 상품 ${externalProductId}에 vendorInventoryItems가 없습니다`);
  const saleStatus = saleStatusFromWingProductStatus(requiredText(inventoryProduct.productStatus, 'Wing 판매 상태'));
  const optionIds = new Set<string>();
  const options = items.map((item) => {
    const option = buildCatalogBasicOption(item);
    if (optionIds.has(option.externalOptionId)) {
      throw new WingPayloadError(`Wing 상품 ${externalProductId} 옵션 identity conflict: ${option.externalOptionId}`);
    }
    optionIds.add(option.externalOptionId);
    return option;
  });
  const primary = normalizeImageUrl(inventoryProduct.representativeImage);
  const raw = assertJsonBytes({
    source: 'wing_inventory_list',
    vendorInventoryId: externalProductId,
    productStatus: nullableText(inventoryProduct.productStatus),
    saleStatus,
    categoryName: nullableText(inventoryProduct.categoryName),
    displayCategoryCode: optionalId(inventoryProduct.displayCategoryCode),
    categoryId: optionalId(inventoryProduct.categoryId),
    manufacture: nullableText(inventoryProduct.manufacture),
    brand: nullableText(inventoryProduct.brand),
    saleDates: inventoryProduct.saleDates ?? null,
    createdOn: nullableText(inventoryProduct.createdOn),
    modifiedOn: nullableText(inventoryProduct.modifiedOn),
    itemCount: items.length,
  }, MAX_RAW_BYTES, `Wing 기본 상품 ${externalProductId} raw 데이터가 허용 크기를 초과했습니다`);
  const productName = nullableText(inventoryProduct.productName)?.replace(/\s+/g, ' ') ?? null;
  return assertJsonBytes({
    externalProductId,
    registeredName: productName,
    displayName: productName,
    category: nullableText(inventoryProduct.categoryName) ?? categoryCode(inventoryProduct),
    manufacturer: nullableText(inventoryProduct.manufacture),
    brand: nullableText(inventoryProduct.brand),
    // 공급자 코드는 productStatus에 두고, 판매 상태 라벨은 raw.saleStatus에만 둔다.
    productStatus: nullableText(inventoryProduct.productStatus),
    options,
    media: primary ? [{ sourceUrl: primary, role: 'primary' as const, sortOrder: 0, externalOptionId: null }] : [],
    raw,
  }, MAX_PRODUCT_BYTES, `Wing 기본 상품 ${externalProductId}가 허용 크기를 초과했습니다`);
}

function buildCatalogBasicOption(item: unknown): CoupangCatalogBasicOptionV1 {
  if (!isRecord(item)) throw new WingPayloadError('Wing vendorInventoryItem 행이 올바르지 않습니다');
  const externalOptionId = requiredOptionId(item, 'basic');
  const vendorItemId = strictOptionalId(item.vendorItemId, 'vendorItemId');
  const vendorInventoryItemId = strictRequiredId(item.vendorInventoryItemId, 'vendorInventoryItemId');
  const skuId = strictOptionalId(item.skuId, 'skuId');
  const soldOut = strictNullableBoolean(item.soldOut, 'soldOut');
  const raw = assertJsonBytes({
    vendorInventoryItemId,
    vendorItemId,
    skuId,
    itemName: nullableText(item.itemName),
    externalSkuCode: nullableText(item.externalSkuCode),
    barcode: nullableText(item.barcode),
    status: nullableText(item.status),
    soldOut,
    qcOperationStatus: nullableText(item.qcOperationStatus),
    approvalStatus: nullableText(item.approvalStatus),
    stockQuantity: nullableInteger(item.stockQuantity),
    salePrice: nullableInteger(item.salePrice),
    autoPricingActive: strictNullableBoolean(item.autoPricingActive, 'autoPricingActive'),
    exposureStatuses: item.exposureStatuses ?? null,
    externalOptionIdentitySource: vendorItemId ? 'vendor_item' : 'inventory_item',
  }, MAX_RAW_BYTES, `Wing 기본 옵션 ${externalOptionId} raw 데이터가 허용 크기를 초과했습니다`);
  return {
    externalOptionId,
    optionName: nullableText(item.itemName),
    skuStatus: nullableText(item.status || item.approvalStatus),
    salePrice: nullableInteger(item.salePrice),
    sellerSku: nullableText(item.externalSkuCode),
    modelNumber: null,
    barcode: nullableText(item.barcode),
    stock: nullableInteger(item.stockQuantity),
    stockQuantity: nullableInteger(item.stockQuantity),
    vendorInventoryItemId,
    vendorItemId,
    skuId,
    externalSkuCode: nullableText(item.externalSkuCode),
    soldOut,
    attributes: [],
    media: [],
    raw,
  };
}

const DETAIL_DOCUMENT_FIELDS = [
  'contents',
  'notices',
  'additionalNotices',
  'searchTags',
  'internalAttributes',
  'certifications',
  'extraProperties',
] as const;

type DetailMediaEntry = { sourceUrl: string; role: 'detail' | 'option'; externalOptionIds: Set<string> };

/**
 * Wing 상세 JSON(`GET …/seller-product/{id}`) → 상세 원소. 문서는 상품 안에서 값으로 한 번만 두고 옵션마다 연결을
 * 남긴다. 미디어는 역할+URL로 합치고 모든 옵션 주인을 남긴다.
 */
export function buildCatalogDetailProduct(sellerProduct: unknown): CoupangCatalogDetailProductV1 {
  if (!isRecord(sellerProduct)) throw new WingPayloadError('Wing 상품 상세 JSON이 없습니다');
  const externalProductId = strictRequiredId(sellerProduct.sellerProductId, 'sellerProductId');
  const items = Array.isArray(sellerProduct.items) ? sellerProduct.items : [];
  if (items.length === 0) throw new WingPayloadError(`Wing 상품 ${externalProductId}에 옵션이 없습니다`);

  const documents: CoupangCatalogDetailProductV1['documents'] = [];
  const documentByKey = new Map<string, CoupangCatalogDetailProductV1['documents'][number]>();
  const mediaByKey = new Map<string, DetailMediaEntry>();
  const options: CoupangCatalogDetailProductV1['options'] = [];
  const optionIds = new Set<string>();
  for (const rawItem of items) {
    const item = isRecord(rawItem) ? rawItem : {};
    const externalOptionId = requiredOptionId(item, 'detail');
    if (optionIds.has(externalOptionId)) {
      throw new WingPayloadError(`Wing 상세 상품 ${externalProductId} 옵션 identity conflict: ${externalOptionId}`);
    }
    optionIds.add(externalOptionId);
    const documentIds: string[] = [];
    for (const field of DETAIL_DOCUMENT_FIELDS) {
      // 공급자 칸 하나를 JSON 값 하나로 지킨다: 빈 배열·명시적 null·순서·중복도 관측이다. 없는 칸만 뺀다.
      if (!Object.hasOwn(item, field) || item[field] === undefined) continue;
      const value = item[field];
      const key = `${field}\u0000${stableStringify(value)}`;
      let document = documentByKey.get(key);
      if (!document) {
        document = { id: makeStableDocumentId(field, value, documents.length), kind: field, value };
        assertJsonBytes(document.value, MAX_DOCUMENT_BYTES, `Wing 상세 문서 ${field}가 허용 크기를 초과했습니다`);
        documentByKey.set(key, document);
        documents.push(document);
      }
      documentIds.push(document.id);
    }
    for (const image of Array.isArray(item.images) ? item.images : []) {
      const record = isRecord(image) ? image : {};
      addDetailMedia(mediaByKey, 'option', normalizeImageUrl(record.cdnPath || record.vendorPath), externalOptionId);
    }
    for (const sourceUrl of extractDetailImageUrls(item.contents)) {
      addDetailMedia(mediaByKey, 'detail', sourceUrl, externalOptionId);
    }
    options.push({
      externalOptionId,
      sellerProductItemId: strictOptionalId(item.sellerProductItemId, 'sellerProductItemId'),
      vendorItemId: strictOptionalId(item.vendorItemId, 'vendorItemId'),
      externalVendorSku: nullableText(item.externalVendorSku),
      barcode: nullableText(item.barcode),
      modelNumber: nullableText(item.modelNo),
      attributes: normalizeDetailAttributes(item.attributes),
      documentIds,
      raw: buildDetailOptionRaw(item),
    });
  }
  const media = [...mediaByKey.values()].map((entry, index) => ({
    sourceUrl: entry.sourceUrl,
    role: entry.role,
    sortOrder: index,
    externalOptionIds: [...entry.externalOptionIds].sort(),
  }));
  const mediaCountByOption = new Map<string, number>();
  for (const entry of media) {
    for (const owner of entry.externalOptionIds) {
      const count = (mediaCountByOption.get(owner) ?? 0) + 1;
      if (count > MAX_MEDIA_PER_OWNER) {
        throw new WingPayloadError(`Wing 상세 상품 ${externalProductId} 옵션 ${owner}의 미디어가 허용 개수를 초과했습니다`);
      }
      mediaCountByOption.set(owner, count);
    }
  }
  if (documents.length > MAX_DOCUMENTS_PER_PRODUCT) {
    throw new WingPayloadError(`Wing 상세 상품 ${externalProductId}의 문서가 허용 개수를 초과했습니다`);
  }
  const raw = assertJsonBytes({
    source: 'wing_seller_product_json',
    sellerProductId: externalProductId,
    productId: optionalId(sellerProduct.productId),
    status: nullableText(sellerProduct.status),
    statusName: nullableText(sellerProduct.statusName),
    saleStartedAt: nullableText(sellerProduct.saleStartedAt),
    displayCategoryCode: optionalId(sellerProduct.displayCategoryCode),
    categoryId: optionalId(sellerProduct.categoryId),
    itemCount: items.length,
  }, MAX_RAW_BYTES, `Wing 상세 상품 ${externalProductId} raw 데이터가 허용 크기를 초과했습니다`);
  return assertJsonBytes(
    { externalProductId, options, documents, media, raw },
    MAX_PRODUCT_BYTES,
    `Wing 상세 상품 ${externalProductId}가 허용 크기를 초과했습니다`,
  );
}

function extractDetailImageUrls(contents: unknown): string[] {
  const urls: string[] = [];
  for (const content of Array.isArray(contents) ? contents : []) {
    const details = isRecord(content) && Array.isArray(content.contentDetails) ? content.contentDetails : [];
    for (const detail of details) {
      const html = String(isRecord(detail) ? detail.content ?? '' : '');
      for (const match of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
        const url = normalizeImageUrl(match[1]);
        if (url) urls.push(url);
      }
    }
  }
  return [...new Set(urls)];
}

function normalizeDetailAttributes(attributes: unknown): Array<{ type: string; value: string }> {
  return (Array.isArray(attributes) ? attributes : [])
    .map((attribute) => {
      const record = isRecord(attribute) ? attribute : {};
      return {
        type: nullableText(record.attributeTypeName || record.attributeTypeId),
        value: nullableText(record.attributeValueName),
      };
    })
    .filter((attribute): attribute is { type: string; value: string } => Boolean(attribute.type && attribute.value))
    .slice(0, MAX_ATTRIBUTES_PER_OPTION);
}

function buildDetailOptionRaw(item: JsonRecord): JsonRecord {
  return assertJsonBytes({
    ...(nullableText(item.registrationType) ? { registrationType: nullableText(item.registrationType) } : {}),
    sellerProductItemId: strictOptionalId(item.sellerProductItemId, 'sellerProductItemId'),
    vendorItemId: strictOptionalId(item.vendorItemId, 'vendorItemId'),
    itemId: strictOptionalId(item.itemId, 'itemId'),
    skuId: strictOptionalId(item.skuId, 'skuId'),
    externalVendorSku: nullableText(item.externalVendorSku),
    barcode: nullableText(item.barcode),
    modelNo: nullableText(item.modelNo),
    originalPrice: nullableInteger(item.originalPrice),
    salePrice: nullableInteger(item.salePrice),
    supplyPrice: nullableInteger(item.supplyPrice),
    externalOptionIdentitySource: item.vendorItemId === null || item.vendorItemId === undefined ? 'inventory_item' : 'vendor_item',
  }, MAX_RAW_BYTES, 'Wing 상세 옵션 raw 데이터가 허용 크기를 초과했습니다');
}

function addDetailMedia(mediaByKey: Map<string, DetailMediaEntry>, role: 'detail' | 'option', sourceUrl: string | null, externalOptionId: string) {
  if (!sourceUrl) return;
  const key = `${role}:${sourceUrl}`;
  const existing = mediaByKey.get(key);
  if (existing) {
    existing.externalOptionIds.add(externalOptionId);
    return;
  }
  mediaByKey.set(key, { sourceUrl, role, externalOptionIds: new Set([externalOptionId]) });
}

function makeStableDocumentId(field: string, value: unknown, ordinal: number): string {
  const text = `${field}\u0000${stableStringify(value)}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `doc:${field}:${(hash >>> 0).toString(16).padStart(8, '0')}:${ordinal}`;
}

function categoryCode(product: JsonRecord): string | null {
  const parts = [optionalId(product.displayCategoryCode), optionalId(product.categoryId)].filter(Boolean);
  return parts.length > 0 ? parts.join('/') : null;
}

/** Wing 목록의 판매 상태 코드 → 한국어 판매 상태. 모르는 코드는 추측하지 않는다. */
export function saleStatusFromWingProductStatus(value: string): string | null {
  switch (value) {
    case 'ON_SALE':
    case 'PARTIAL_ON_SALE':
      return '판매중';
    case 'SUSPENDED':
      return '판매중지';
    case 'REJECTED':
      return null;
    default:
      throw new WingPayloadError(`Wing 판매 상태를 해석할 수 없습니다: ${value}`);
  }
}

export function normalizeImageUrl(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  if (text.startsWith('//')) return `https:${text}`;
  if (/^https?:\/\//i.test(text)) return text;
  return `https://image1.coupangcdn.com/image/${text.replace(/^\/+/, '')}`;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function optionalId(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function strictOptionalId(value: unknown, name: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  throw new WingPayloadError(`Wing ${name} 값이 올바르지 않습니다`);
}

function strictRequiredId(value: unknown, name: string): string {
  const id = strictOptionalId(value, name);
  if (!id) throw new WingPayloadError(`Wing ${name} 값이 없습니다`);
  return id;
}

function strictNullableBoolean(value: unknown, name: string): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  throw new WingPayloadError(`Wing ${name} 값이 올바르지 않습니다`);
}

function requiredOptionId(item: JsonRecord, stage: 'basic' | 'detail'): string {
  const vendorItemId = strictOptionalId(item.vendorItemId, 'vendorItemId');
  if (vendorItemId) return vendorItemId;
  const relationId = stage === 'basic'
    ? strictOptionalId(item.vendorInventoryItemId, 'vendorInventoryItemId')
    : strictOptionalId(item.sellerProductItemId, 'sellerProductItemId');
  if (relationId) return relationId;
  if (stage === 'detail') {
    const itemId = strictOptionalId(item.itemId, 'itemId');
    if (itemId) return itemId;
  }
  throw new WingPayloadError('Wing 옵션 식별자가 없습니다');
}

function nullableInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function requiredText(value: unknown, name: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new WingPayloadError(`${name} 값이 없습니다`);
  return text;
}

function requiredPositiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new WingPayloadError(`${name} 값이 올바르지 않습니다`);
  return value as number;
}

function requiredNonNegativeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new WingPayloadError(`${name} 값이 올바르지 않습니다`);
  return value as number;
}
