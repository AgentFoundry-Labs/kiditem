export const PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT = Symbol(
  'PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT',
);

export interface ProductGenerationExistingDetailChild {
  generationId: string;
  requestHash: string | null;
  contentWorkspaceId: string;
  isDeleted: boolean;
}

export interface ProductGenerationExistingThumbnailChild {
  generationId: string;
  requestHash: string | null;
  isDeleted: boolean;
}

export interface ProductGenerationContextRepositoryPort {
  findExistingChildren(input: {
    organizationId: string;
    detailGenerationId: string;
    thumbnailGenerationId: string;
  }): Promise<{
    detail: ProductGenerationExistingDetailChild | null;
    thumbnail: ProductGenerationExistingThumbnailChild | null;
  }>;
}
