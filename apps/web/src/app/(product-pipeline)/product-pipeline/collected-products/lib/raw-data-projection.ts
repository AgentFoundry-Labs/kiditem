import { selectBestThumbnailImage } from './sourcing-api';

export interface RawDataField {
  key: string;
  value: string;
}

export interface RawDataFieldGroup {
  title: string;
  rows: RawDataField[];
}

export interface RawDataPrice {
  min: number;
  max: number;
  unit: string;
}

export interface RawDataProjection {
  title: string | null;
  category: string | null;
  moq: number | null;
  unit: string | null;
  price: RawDataPrice | null;
  productImages: string[];
  descriptionImages: string[];
  selectedThumbnail: string | null;
  specs: RawDataField[];
  fieldGroups: RawDataFieldGroup[];
}

interface ProjectRawDataArgs {
  rawData: Record<string, unknown> | null;
  imageUrls: string[];
  thumbnailUrl: string | null;
}

const PRODUCT_IMAGE_FIELD_KEYS = [
  'images',
  'imageUrls',
  'image_urls',
  'mainImages',
  'main_images',
  'mainImage',
  'main_image',
  'offerImgList',
  'thumbnails',
] as const;

const DESCRIPTION_IMAGE_FIELD_KEYS = [
  'description_images',
  'detail_images',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeImageUrl(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    return null;
  }

  if (isRecord(value)) {
    for (const key of ['url', 'src', 'imageUrl', 'image_url', 'fullPathImageURI', 'fullPathImageUrl']) {
      const normalized = normalizeImageUrl(value[key]);
      if (normalized) return normalized;
    }
  }

  return null;
}

function collectImages(values: unknown[]): string[] {
  const urls: string[] = [];
  const push = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(push);
      return;
    }
    const normalized = normalizeImageUrl(value);
    if (normalized) urls.push(normalized);
  };
  values.forEach(push);
  return Array.from(new Set(urls));
}

function toDisplayString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    const items = value.map(toDisplayString).filter((item): item is string => !!item);
    return items.length > 0 ? items.join(', ') : null;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) return null;
    return JSON.stringify(value, null, 2);
  }
  return null;
}

function pickString(sources: Array<Record<string, unknown> | null | undefined>, keys: string[]): string | null {
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const value = toDisplayString(source[key]);
      if (value) return value;
    }
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickNumber(sources: Array<Record<string, unknown> | null | undefined>, keys: string[]): number | null {
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const value = toNumber(source[key]);
      if (value != null) return value;
    }
  }
  return null;
}

function projectPrice(rawData: Record<string, unknown>, representativeRow: Record<string, unknown> | null): RawDataPrice | null {
  const rawPrice = rawData.price;
  if (isRecord(rawPrice)) {
    const min = toNumber(rawPrice.min) ?? toNumber(rawPrice.value) ?? toNumber(rawPrice.amount);
    const max = toNumber(rawPrice.max) ?? min;
    if (min != null && max != null) {
      return {
        min,
        max,
        unit: pickString([rawPrice], ['unit', 'currency']) ?? 'CNY',
      };
    }
  }

  const min = pickNumber([rawData], ['minPrice', 'min_price', 'price']);
  const max = pickNumber([rawData], ['maxPrice', 'max_price']) ?? min;
  if (min != null && max != null) {
    return { min, max, unit: pickString([rawData], ['currency', 'priceUnit', 'price_unit']) ?? 'CNY' };
  }

  const salePrice = pickNumber([representativeRow], ['판매가']);
  if (salePrice != null) return { min: salePrice, max: salePrice, unit: 'KRW' };

  const purchasePrice = pickNumber([representativeRow], ['매입가']);
  if (purchasePrice != null) return { min: purchasePrice, max: purchasePrice, unit: 'KRW' };

  return null;
}

function projectSpecs(rawData: Record<string, unknown>): RawDataField[] {
  if (!Array.isArray(rawData.specs)) return [];
  return rawData.specs
    .map((item) => {
      if (!isRecord(item)) return null;
      const key = pickString([item], ['key', 'name', 'label']);
      const value = pickString([item], ['value', 'text', 'content']);
      return key && value ? { key, value } : null;
    })
    .filter((item): item is RawDataField => !!item);
}

function projectFieldGroup(title: string, source: Record<string, unknown> | null, excludedKeys = new Set<string>()): RawDataFieldGroup | null {
  if (!source) return null;
  const rows = Object.entries(source)
    .filter(([key]) => !excludedKeys.has(key))
    .map(([key, value]) => {
      const rendered = toDisplayString(value);
      return rendered ? { key, value: rendered } : null;
    })
    .filter((row): row is RawDataField => !!row);

  return rows.length > 0 ? { title, rows } : null;
}

export function projectRawData({ rawData, imageUrls, thumbnailUrl }: ProjectRawDataArgs): RawDataProjection {
  const safeRawData = rawData ?? {};
  const representativeRow = isRecord(safeRawData.representativeRow) ? safeRawData.representativeRow : null;
  const productImages = collectImages([
    ...PRODUCT_IMAGE_FIELD_KEYS.map((key) => safeRawData[key]),
    imageUrls,
  ]);
  const descriptionImages = collectImages(DESCRIPTION_IMAGE_FIELD_KEYS.map((key) => safeRawData[key]));
  const title = pickString(
    [safeRawData, representativeRow],
    ['title', 'productName', 'product_name', 'name', 'rawTitle', '상품명', '매입상품명', '제품명'],
  );
  const category = pickString(
    [safeRawData, representativeRow],
    ['category_name', 'category', 'rawCategory', '상품분류', '상품구분', '카테고리'],
  );
  const unit = pickString([safeRawData, representativeRow], ['unit', '단위', '중량단위']);
  const moq = pickNumber([safeRawData, representativeRow], ['moq', 'minOrderQuantity', 'min_order_quantity', '최소발주수량']);
  const price = projectPrice(safeRawData, representativeRow);
  const specs = projectSpecs(safeRawData);
  const fieldGroups = [
    projectFieldGroup('원본 행 데이터', representativeRow),
  ].filter((group): group is RawDataFieldGroup => !!group);

  return {
    title,
    category,
    moq,
    unit,
    price,
    productImages,
    descriptionImages,
    selectedThumbnail: selectBestThumbnailImage(safeRawData, productImages, thumbnailUrl),
    specs,
    fieldGroups,
  };
}
