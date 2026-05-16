interface ResolveOriginalPreviewImageOptions {
  initialGenerationOriginalUrl?: string | null;
  initialImageUrl?: string | null;
  originalImageUrl?: string | null;
}

export function resolveOriginalPreviewImage({
  initialGenerationOriginalUrl,
  initialImageUrl,
  originalImageUrl,
}: ResolveOriginalPreviewImageOptions): string | null {
  return initialGenerationOriginalUrl ?? initialImageUrl ?? originalImageUrl ?? null;
}
