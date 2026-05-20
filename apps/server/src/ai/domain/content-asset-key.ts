import { createHash } from 'node:crypto';

export function groupUrlAssetKey(generationGroupId: string, url: string): string {
  return `group-url:${generationGroupId}:${hashContentAssetUrl(url).slice(0, 32)}`;
}

export function hashContentAssetUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}
