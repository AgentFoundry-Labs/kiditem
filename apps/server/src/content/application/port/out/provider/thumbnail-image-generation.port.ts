import type { ThumbnailPromptPart } from './thumbnail-reference-images.port';

export const THUMBNAIL_IMAGE_GENERATION_PORT = Symbol('THUMBNAIL_IMAGE_GENERATION_PORT');

export interface ThumbnailImageGenerationCommand {
  /** Explicitly selected by the caller; adapters never choose a fallback. */
  model: string;
  parts: ThumbnailPromptPart[];
  signal?: AbortSignal;
}

export interface ThumbnailImageGenerationPort {
  generateImageParts(
    command: ThumbnailImageGenerationCommand,
  ): Promise<ThumbnailPromptPart[]>;
}
