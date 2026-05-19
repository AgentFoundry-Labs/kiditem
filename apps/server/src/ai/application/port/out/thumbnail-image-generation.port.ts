import type { ThumbnailPromptPart } from './thumbnail-reference-images.port';

export const THUMBNAIL_IMAGE_GENERATION_PORT = Symbol('THUMBNAIL_IMAGE_GENERATION_PORT');

export interface ThumbnailImageGenerationCommand {
  /**
   * Agent OS handlers pass the selected run model here. Legacy non-Agent
   * re-edit paths leave it empty and rely on the configured image model.
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
