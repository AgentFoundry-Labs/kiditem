export const PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT = Symbol(
  'PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT',
);

export interface ProductGenerationCandidateImage {
  url: string;
  sortOrder: number;
}

export interface ProductGenerationCandidateContext {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  images: ProductGenerationCandidateImage[];
}

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
  findCandidate(input: {
    organizationId: string;
    candidateId: string;
  }): Promise<ProductGenerationCandidateContext | null>;
  findExistingChildren(input: {
    organizationId: string;
    detailGenerationId: string;
    thumbnailGenerationId: string;
  }): Promise<{
    detail: ProductGenerationExistingDetailChild | null;
    thumbnail: ProductGenerationExistingThumbnailChild | null;
  }>;
}
