/**
 * Pure URL precedence rules for resolving the displayable master thumbnail
 * image. Used by analysis/recompose/generation flows so that changes to the
 * fallback chain happen in exactly one place.
 *
 * Precedence:
 *   master.imageUrl > primary MasterProductImage > first MasterProductImage > master.thumbnailUrl
 *
 * URLs are only considered displayable if they are absolute http(s) URLs or
 * relative `/generated-thumbnails/...` paths produced by StorageService.
 *
 * No Prisma/Nest dependency. The Prisma include preset that produces the
 * `images` row shape consumed here lives in
 * `adapter/out/prisma/master-image-select.preset.ts`.
 */

export type ThumbnailMasterImageRow = {
  url: string;
  role: string;
  sortOrder: number;
  isPrimary: boolean;
};

export function isDisplayableThumbnailUrl(url: string | null | undefined): url is string {
  return (
    !!url &&
    (url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('/generated-thumbnails/'))
  );
}

export function resolveMasterThumbnailImage(master: {
  imageUrl: string | null;
  thumbnailUrl: string | null;
  images: ThumbnailMasterImageRow[];
}): string | null {
  if (isDisplayableThumbnailUrl(master.imageUrl)) return master.imageUrl;
  const primary = master.images.find((img) => img.isPrimary && isDisplayableThumbnailUrl(img.url));
  if (primary) return primary.url;
  const first = master.images.find((img) => isDisplayableThumbnailUrl(img.url));
  if (first) return first.url;
  if (isDisplayableThumbnailUrl(master.thumbnailUrl)) return master.thumbnailUrl;
  return null;
}
