export const IMAGE_EDIT_MEDIA_PORT = Symbol('IMAGE_EDIT_MEDIA_PORT');

export interface ImageEditMediaCommand {
  organizationId: string;
  model: string;
  preset: string;
  imageUrl?: string;
  imageUrls?: string[];
  userPrompt?: string;
  signal?: AbortSignal;
}

export interface ImageEditMediaResult {
  buffer: Buffer;
  mimeType: string;
}

export interface ImageEditMediaPort {
  editImage(command: ImageEditMediaCommand): Promise<ImageEditMediaResult>;
}
