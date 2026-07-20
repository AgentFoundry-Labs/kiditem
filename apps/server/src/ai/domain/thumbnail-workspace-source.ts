/**
 * Pure URL precedence rules for resolving a displayable thumbnail source from
 * a content workspace. Analysis, recomposition, and generation share this
 * policy so the fallback order has one owner.
 *
 * Precedence:
 * source imageUrl > primary candidate > first candidate > thumbnailUrl.
 */

export interface ThumbnailWorkspaceSourceImage {
  url: string;
  role: string;
  sortOrder: number;
  isPrimary: boolean;
}

export function isDisplayableThumbnailUrl(url: string | null | undefined): url is string {
  return (
    !!url &&
    (url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('/generated-thumbnails/'))
  );
}

export function resolveWorkspaceThumbnailSource(workspace: {
  imageUrl: string | null;
  thumbnailUrl: string | null;
  images: ThumbnailWorkspaceSourceImage[];
}): string | null {
  if (isDisplayableThumbnailUrl(workspace.imageUrl)) return workspace.imageUrl;
  const primary = workspace.images.find(
    (image) => image.isPrimary && isDisplayableThumbnailUrl(image.url),
  );
  if (primary) return primary.url;
  const first = workspace.images.find((image) => isDisplayableThumbnailUrl(image.url));
  if (first) return first.url;
  if (isDisplayableThumbnailUrl(workspace.thumbnailUrl)) return workspace.thumbnailUrl;
  return null;
}
