import type { RegistrationWorkspaceHistoryItem } from './registration-workspaces-api';

export interface DetailGenerationHistoryItem {
  id: string;
  generatedTitle: string | null;
  status: string;
  templateId: string | null;
  detailPageData: Record<string, unknown> | null;
  imageUrls: string[];
  processedImages: Record<string, string>;
  detailPageArtifactId: string | null;
  detailPageRevisionId: string | null;
  errorMessage: string | null;
  productId: string | null;
  createdAt: string;
}

export function toLegacyGenerationStatus(status: string): string {
  if (status === 'completed') return 'COMPLETED';
  if (status === 'failed') return 'FAILED';
  if (status === 'cancelled') return 'CANCELLED';
  if (status === 'processing') return 'PROCESSING';
  return status.toUpperCase();
}

export function registrationWorkspaceHistoryToGenerationHistory(
  history: RegistrationWorkspaceHistoryItem[],
): DetailGenerationHistoryItem[] {
  return history.map((item) => ({
    id: item.id,
    generatedTitle: item.generatedTitle,
    status: toLegacyGenerationStatus(item.status),
    templateId: item.templateId,
    detailPageData: item.detailPageData,
    imageUrls: item.imageUrls,
    processedImages: item.processedImages,
    detailPageArtifactId: item.detailPageArtifactId,
    detailPageRevisionId: null,
    errorMessage: null,
    productId: null,
    createdAt: item.createdAt,
  }));
}
