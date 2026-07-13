import { registeredProductDetailHref } from '../../_shared/lib/product-pipeline-routes';
import type { ContentWorkspaceSummary } from '../../_shared/lib/content-workspaces-api';

interface DetailGenerationInput {
  rawTitle?: unknown;
  rawCategory?: unknown;
  rawDescription?: unknown;
  imageUrls?: unknown;
}

export function contentWorkspaceTitle(workspace: ContentWorkspaceSummary): string {
  const latestInput = latestGenerationInput(workspace);
  return pickString(latestInput.rawTitle) ?? workspace.displayName;
}

export function contentWorkspaceSubtitle(workspace: ContentWorkspaceSummary): string {
  const latestInput = latestGenerationInput(workspace);
  const category = pickString(latestInput.rawCategory);
  if (workspace.channelListingId) return category ? `등록 상품 · ${category}` : '등록 상품';
  if (workspace.sourceCandidateId) return category ? `수집 상품 · ${category}` : '수집 상품';
  return category ? `상품 후보 · ${category}` : '상품 후보';
}

export function contentWorkspaceThumbnail(workspace: ContentWorkspaceSummary): string | null {
  return contentWorkspaceImageUrls(workspace)[0] ?? null;
}

export function contentWorkspaceImageUrls(workspace: ContentWorkspaceSummary): string[] {
  const latestInput = latestGenerationInput(workspace);
  return Array.isArray(latestInput.imageUrls)
    ? latestInput.imageUrls.filter((url): url is string => typeof url === 'string' && url.trim() !== '')
    : [];
}

export function latestGenerationInput(workspace: ContentWorkspaceSummary): DetailGenerationInput {
  const input = workspace.history[0]?.generationInput;
  return input && typeof input === 'object' ? input as DetailGenerationInput : {};
}

export function latestEditorHref(workspace: ContentWorkspaceSummary): string | null {
  return workspace.history[0]?.href ?? null;
}

export function contentWorkspaceDetailHref(
  workspace: Pick<ContentWorkspaceSummary, 'channelListingId'>,
): string | null {
  return workspace.channelListingId
    ? registeredProductDetailHref(workspace.channelListingId)
    : null;
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}
