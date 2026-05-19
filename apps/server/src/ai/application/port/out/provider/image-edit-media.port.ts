export const IMAGE_EDIT_MEDIA_PORT = Symbol('IMAGE_EDIT_MEDIA_PORT');

export interface ImageEditMediaCommand {
  organizationId: string;
  model: string;
  preset: string;
  imageUrl?: string;
  imageUrls?: string[];
  userPrompt?: string;
}

export interface ImageEditMediaResult {
  imageUrl: string;
  storageKey: string | null;
  mimeType: string;
  fileSize: number;
}

export interface ImageEditMediaPort {
  editImage(command: ImageEditMediaCommand): Promise<ImageEditMediaResult>;
}
