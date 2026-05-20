import type { ThumbnailPromptPart } from './thumbnail-reference-images.port';

export const THUMBNAIL_IMAGE_GENERATION_PORT = Symbol('THUMBNAIL_IMAGE_GENERATION_PORT');

export interface ThumbnailImageGenerationCommand {
  /**
   * Direct jobs pass the selected image model here. Legacy inline re-edit
   * paths leave it empty and rely on the configured image model.
   */
  model?: string;
  parts: ThumbnailPromptPart[];
  signal?: AbortSignal;
}

export interface ThumbnailImageGenerationPort {
  generateImageParts(
    command: ThumbnailImageGenerationCommand,
  ): Promise<ThumbnailPromptPart[]>;
}
