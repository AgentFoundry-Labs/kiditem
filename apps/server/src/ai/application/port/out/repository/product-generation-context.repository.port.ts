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

export interface ProductGenerationContextRepositoryPort {
  findCandidate(input: {
    organizationId: string;
    candidateId: string;
  }): Promise<ProductGenerationCandidateContext | null>;
}
