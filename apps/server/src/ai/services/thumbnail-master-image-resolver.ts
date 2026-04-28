import { Prisma } from '@prisma/client';

/**
 * Shared current-schema master-image select preset and resolver helpers.
 *
 * Multiple thumbnail-ai services (analysis, recompose, generation) used to
 * re-implement slightly different image precedence rules. This helper unifies
 * them so changes to the master-image fallback chain happen in exactly one
 * place.
 *
 * Precedence:
 *   master.imageUrl > primary MasterProductImage > first MasterProductImage > master.thumbnailUrl
 *
 * URLs are only considered displayable if they are absolute http(s) URLs or
 * relative `/generated-thumbnails/...` paths produced by StorageService.
 */
export const THUMBNAIL_MASTER_IMAGE_SELECT: Prisma.MasterProduct$imagesArgs = {
  where: { isDeleted: false },
  select: { url: true, role: true, sortOrder: true, isPrimary: true },
  orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
};

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
