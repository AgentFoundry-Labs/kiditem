import { createHash } from 'node:crypto';

export function groupUrlAssetKey(generationGroupId: string, url: string): string {
  return `group-url:${generationGroupId}:${hashContentAssetUrl(url).slice(0, 32)}`;
}

/**
 * Key for one entry of a workspace's `role='thumbnail'` gallery.
 *
 * It is deliberately its own namespace, separate from `group-url:` (generation
 * inputs/outputs) and `managed-url:` (the current-thumbnail selection asset).
 * Reusing a `group-url:` asset would silently keep its original role — the
 * gallery would then never show up in `registrationImages.thumbnail`, and the
 * save would look successful while changing nothing.
 */
export function workspaceThumbnailAssetKey(contentWorkspaceId: string, url: string): string {
  return `workspace-thumbnail:${contentWorkspaceId}:${hashContentAssetUrl(url).slice(0, 32)}`;
}

export function hashContentAssetUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}
