export const THUMBNAIL_REFERENCE_IMAGES_PORT = Symbol('THUMBNAIL_REFERENCE_IMAGES_PORT');

export type ThumbnailPromptPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } };

export interface ThumbnailReferenceImagesPort {
  generationParts(header: string): ThumbnailPromptPart[];
  complianceParts(header: string): ThumbnailPromptPart[];
}
