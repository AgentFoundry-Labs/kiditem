import { createHash } from 'node:crypto';

/**
 * Key for one entry of a workspace's uploaded `role='thumbnail'` gallery.
 *
 * It is its own namespace so a gallery entry never reuses a detail-page image
 * row (which would keep its original role and silently drop out of
 * `registrationImages.thumbnail`).
 */
export function workspaceThumbnailAssetKey(contentWorkspaceId: string, url: string): string {
  return `workspace-thumbnail:${contentWorkspaceId}:${hashContentAssetUrl(url).slice(0, 32)}`;
}

/** Key for a workspace image recorded under one role (detail-page inputs and outputs). */
export function workspaceImageAssetKey(contentWorkspaceId: string, role: string, url: string): string {
  return `workspace-image:${contentWorkspaceId}:${role}:${hashContentAssetUrl(url).slice(0, 32)}`;
}

/** Key for one AI candidate image of one thumbnail job. */
export function thumbnailCandidateAssetKey(thumbnailGenerationId: string, url: string): string {
  return `ai-candidate:${thumbnailGenerationId}:${hashContentAssetUrl(url).slice(0, 32)}`;
}

export function hashContentAssetUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}
