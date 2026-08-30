export const PRODUCTS_LISTING_GENERATION_CAPABILITY_PORT = Symbol(
  'PRODUCTS_LISTING_GENERATION_CAPABILITY_PORT',
);

export interface ProductsListingGenerationInput {
  organizationId: string;
  idempotencyKey: string;
  /** Exact canonical Agent capability input hash, bound with the owner key. */
  inputHash: string;
  triggeredByUserId?: string | null;
  /** Existing Sourcing candidate; Products never creates one as a side effect. */
  candidateId: string;
  productName?: string | null;
  imageUrls?: string[];
  category?: string | null;
  description?: string | null;
  target?: string | null;
  thumbnailUrl?: string | null;
  optionNames?: string[];
  templateId?: 'kids-playful' | 'bold-vertical';
  ageGroup?: 'age-8-plus' | 'age-14-plus';
  detailImageCount?: 'auto' | '1' | '2' | '3' | '4' | '5' | '6';
  usageSectionMode?: 'include' | 'exclude';
  kcCertificationStatus?: 'unknown' | 'none' | 'exists';
  kcCertificationNumber?: string | null;
  productSize?: string | null;
  colorVariantStatus?: string | null;
  colorVariantNames?: string | null;
  boxSetStatus?: string | null;
  boxSetQuantity?: string | null;
  task?: 'all' | 'detail' | 'thumbnail';
}

export interface ProductsListingGenerationResult {
  candidateId: string;
  operationRunId: string;
  status: string;
}

export interface ProductsListingGenerationCapabilityPort {
  createListingGenerationPackage(
    input: ProductsListingGenerationInput,
  ): Promise<ProductsListingGenerationResult>;
}
