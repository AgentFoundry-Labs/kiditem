export const PRODUCTS_LISTING_GENERATION_CAPABILITY_PORT = Symbol(
  'PRODUCTS_LISTING_GENERATION_CAPABILITY_PORT',
);

export interface ProductsListingGenerationInput {
  organizationId: string;
  idempotencyKey: string;
  triggeredByUserId?: string | null;
  productName: string;
  imageUrls: string[];
  category?: string | null;
  description?: string | null;
}

export interface ProductsListingGenerationResult {
  candidateId: string;
  operation_ref: string;
  href: string;
}

export interface ProductsListingGenerationCapabilityPort {
  createListingGenerationPackage(
    input: ProductsListingGenerationInput,
  ): Promise<ProductsListingGenerationResult>;
}
