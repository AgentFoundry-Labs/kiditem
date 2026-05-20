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
  priceRange?: string;
  offer?: Record<string, unknown>;
  skuProps?: unknown[];
  priceRanges?: unknown[];
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
