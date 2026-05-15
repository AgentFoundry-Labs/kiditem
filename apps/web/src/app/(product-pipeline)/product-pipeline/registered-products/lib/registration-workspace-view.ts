import { registeredProductDetailHref } from '../../_shared/lib/product-pipeline-routes';
import type { RegistrationWorkspaceSummary } from '../../_shared/lib/registration-workspaces-api';

interface DetailGenerationInput {
  rawTitle?: unknown;
  rawCategory?: unknown;
  rawDescription?: unknown;
  imageUrls?: unknown;
}

export function registrationWorkspaceTitle(workspace: RegistrationWorkspaceSummary): string {
  const latestInput = latestGenerationInput(workspace);
  return pickString(latestInput.rawTitle) ?? workspace.displayName;
}

export function registrationWorkspaceSubtitle(workspace: RegistrationWorkspaceSummary): string {
  const latestInput = latestGenerationInput(workspace);
  const category = pickString(latestInput.rawCategory);
  if (workspace.targetMasterId) return category ? `상품 연결 · ${category}` : '상품 연결';
  if (workspace.sourceCandidateId) return category ? `수집 상품 · ${category}` : '수집 상품';
  return category ? `상품 후보 · ${category}` : '상품 후보';
}

export function registrationWorkspaceThumbnail(workspace: RegistrationWorkspaceSummary): string | null {
  return registrationWorkspaceImageUrls(workspace)[0] ?? null;
}

export function registrationWorkspaceImageUrls(workspace: RegistrationWorkspaceSummary): string[] {
  const latestInput = latestGenerationInput(workspace);
  return Array.isArray(latestInput.imageUrls)
    ? latestInput.imageUrls.filter((url): url is string => typeof url === 'string' && url.trim() !== '')
    : [];
}

export function latestGenerationInput(workspace: RegistrationWorkspaceSummary): DetailGenerationInput {
  const input = workspace.history[0]?.generationInput;
  return input && typeof input === 'object' ? input as DetailGenerationInput : {};
}

export function latestEditorHref(workspace: RegistrationWorkspaceSummary): string | null {
  return workspace.history[0]?.href ?? null;
}

export function registrationWorkspaceDetailHref(
  workspace: Pick<RegistrationWorkspaceSummary, 'id' | 'sourceCandidateId'>,
): string {
  return registeredProductDetailHref(workspace.id);
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}
