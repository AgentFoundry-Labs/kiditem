import type { ContentWorkspaceHistoryItem } from './content-workspaces-api';

/** 이력 한 줄 — 상세 페이지 하나(`id` 는 상세 페이지 id, KID-313 W3b). */
export interface DetailGenerationHistoryItem {
  id: string;
  generatedTitle: string | null;
  status: string;
  templateId: string | null;
  detailPageData: Record<string, unknown> | null;
  imageUrls: string[];
  processedImages: Record<string, string>;
  /** 이 상세 페이지의 현재 revision(저장한 HTML). 아직 저장 전이면 null. */
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

export function contentWorkspaceHistoryToGenerationHistory(
  history: ContentWorkspaceHistoryItem[],
): DetailGenerationHistoryItem[] {
  return history.map((item) => ({
    id: item.id,
    generatedTitle: item.title,
    status: toLegacyGenerationStatus(item.status),
    templateId: item.templateId,
    detailPageData: item.detailPageData,
    imageUrls: item.imageUrls,
    processedImages: item.processedImages,
    detailPageRevisionId: item.currentRevisionId,
    errorMessage: item.errorMessage,
    productId: null,
    createdAt: item.createdAt,
  }));
}
