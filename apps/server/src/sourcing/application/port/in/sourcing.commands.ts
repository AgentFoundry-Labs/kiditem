export interface ReceiveExtensionDataInput extends Record<string, unknown> {
  page_type?: 'detail' | 'description' | 'search' | string;
  source_url?: string;
  source_platform?: string;
  title?: string;
  description?: string;
  description_text?: string;
  images?: string[];
  description_images?: string[];
  detail_images?: string[];
  category_name?: string;
  tags?: string[];
  price?: number | string;
  price_min?: number | string;
  price_max?: number | string;
  priceRange?: string;
  offer?: Record<string, unknown>;
  skuProps?: unknown[];
  priceRanges?: unknown[];
  moq?: number | string;
  supplier_name?: string;
  product_id?: string;
  specs?: Array<{ key?: string; value?: string }>;
  sku_attrs?: unknown[];
  sku_list?: unknown[];
  price_tiers?: unknown[];
  total_found?: number;
}

export interface RegisterManualProductCommand {
  title: string;
  category?: string;
  description?: string;
  target?: string;
  thumbnailUrl?: string;
  thumbnailUrls?: string[];
  imageUrls: string[];
  optionNames?: string[];
  keywords?: string[];
  ageGroup?: 'age-8-plus' | 'age-14-plus';
  kcCertificationStatus?: 'unknown' | 'none' | 'exists';
  kcCertificationNumber?: string;
  productSize?: string;
  colorVariantStatus?: string;
  colorVariantNames?: string;
  boxSetStatus?: string;
  boxSetQuantity?: string;
  // 사방넷 신규등록의 가격정보 · 기본정보와 같은 칸. 수집상품을 거쳐 판매상품까지 간다.
  salePrice?: number;
  tagPrice?: number;
  /** 사방넷 `원가`(공급가). */
  costPrice?: number;
  brand?: string;
  manufacturer?: string;
  originCountry?: string;
  modelName?: string;
  ownCode?: string;
  /** `taxable` 과세 · `tax_free` 면세. */
  taxType?: string;
}

export interface CreateProductGenerationCommand extends RegisterManualProductCommand {
  templateId?: 'kids-playful' | 'bold-vertical';
  detailImageCount?: '2' | '3' | '4' | '5' | '6';
  usageSectionMode?: 'include' | 'exclude';
}

export interface PromoteCandidateCommand {
  options: Array<{
    optionName: string;
    legacyCode?: string;
    barcode?: string;
  }>;
  selectedThumbnailUrl?: string;
  selectedThumbnailGenerationCandidateId?: string;
  selectedDetailPageGenerationId?: string;
  selectedDetailPageArtifactId?: string;
  selectedDetailPageRevisionId?: string;
  skipPostPromotionHooks?: boolean;
}

export interface RejectCandidateCommand {
  reason?: string;
}
