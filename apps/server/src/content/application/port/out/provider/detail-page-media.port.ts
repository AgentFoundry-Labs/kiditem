export const DETAIL_PAGE_MEDIA_PORT = Symbol('DETAIL_PAGE_MEDIA_PORT');

export interface DetailPageMediaImage {
  data: string;
  mimeType: string;
  label: string;
}

export interface GenerateDetailPageImageInput {
  images: DetailPageMediaImage[];
  prompt: string;
  model: string;
  aspectRatio: '16:9' | '4:3' | '1:1';
  imageSize: '2K';
  noImageErrorCode: string;
  logContext: string;
  signal?: AbortSignal;
}

export interface GeneratedDetailPageImage {
  buffer: Buffer;
  mimeType: string;
}

export interface CompleteDetailPageVisionJsonInput {
  images: DetailPageMediaImage[];
  prompt: string;
  model: string;
  signal?: AbortSignal;
}

export interface DetailPageMediaPort {
  generateImage(input: GenerateDetailPageImageInput): Promise<GeneratedDetailPageImage>;
  completeVisionJson(input: CompleteDetailPageVisionJsonInput): Promise<string | null>;
}
