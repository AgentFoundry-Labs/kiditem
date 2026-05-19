export const POST_PROMOTION_GENERATION_REPOSITORY_PORT = Symbol(
  'POST_PROMOTION_GENERATION_REPOSITORY_PORT',
);

export interface PostPromotionMasterContext {
  id: string;
  name: string;
  category: string | null;
  description: string;
  imageUrl: string | null;
  imageUrls: string[];
}

export interface PostPromotionDetailGenerationInput {
  organizationId: string;
  generationGroupId: string;
  rawInput: unknown;
  generationResult: unknown;
  generatedTitle: string;
}

export interface PostPromotionThumbnailGenerationInput {
  organizationId: string;
  masterId: string;
  originalUrl: string;
  inputMeta: unknown;
  inputImage: {
    url: string;
    storageKey: string | null;
    role: string;
    label: string | null;
    sortOrder: number;
    source: string;
    mimeType: string | null;
    fileSize: number | null;
  };
}

export interface PostPromotionGenerationRepositoryPort {
  findMasterContext(input: {
    organizationId: string;
    masterId: string;
  }): Promise<PostPromotionMasterContext | null>;
  createDetailPageGeneration(input: PostPromotionDetailGenerationInput): Promise<{ id: string }>;
  markDetailPageFailed(input: {
    organizationId: string;
    contentGenerationId: string;
    errorMessage: string;
  }): Promise<void>;
  createThumbnailGeneration(input: PostPromotionThumbnailGenerationInput): Promise<{ id: string }>;
  markThumbnailFailed(input: {
    organizationId: string;
    generationId: string;
    errorMessage: string;
  }): Promise<void>;
}
