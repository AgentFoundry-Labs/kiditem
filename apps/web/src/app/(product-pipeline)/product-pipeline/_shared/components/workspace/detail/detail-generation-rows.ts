import type { KidsPlayfulGenerationItem } from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate';
import type { GenerationHistoryItem } from '../../../hooks/useGenerationHistory';
import { generatedDetailTemplateLabel } from '../../../lib/generated-detail-html';

export type DetailGenerationKind = 'agent' | 'kids-playful' | 'bold-vertical';

export interface DetailGenerationRow {
  key: string;
  kind: DetailGenerationKind;
  id: string;
  title: string;
  status: string;
  createdAt: string;
  templateLabel: string;
  isCompletedVersion: boolean;
  isRegistrationDetail: boolean;
  errorMessage: string | null;
  agentItem?: GenerationHistoryItem;
  kidsPlayfulEntry?: KidsPlayfulGenerationItem;
}

export function isCompletedDetailGenerationStatus(status: string): boolean {
  const normalized = status.toUpperCase();
  return normalized === 'COMPLETED' || normalized === 'READY';
}

export function buildDetailGenerationRows(input: {
  agentHistory: GenerationHistoryItem[];
  kidsPlayfulEntries: KidsPlayfulGenerationItem[];
  boldEntries: KidsPlayfulGenerationItem[];
  savedDetailPageGenerationId?: string | null;
}): DetailGenerationRow[] {
  const agentRows = input.agentHistory.map((item): DetailGenerationRow => ({
    key: `agent:${item.id}`,
    kind: 'agent',
    id: item.id,
    title: item.generatedTitle || '상세페이지 생성 결과',
    status: item.status,
    createdAt: item.createdAt,
    templateLabel: generatedDetailTemplateLabel(item),
    isCompletedVersion: isCompletedDetailGenerationStatus(item.status),
    isRegistrationDetail: item.id === input.savedDetailPageGenerationId,
    errorMessage: item.errorMessage ?? null,
    agentItem: item,
  }));
  const kidsRows = input.kidsPlayfulEntries.map((entry): DetailGenerationRow => ({
    key: `kids-playful:${entry.id}`,
    kind: 'kids-playful',
    id: entry.id,
    title: entry.productName || 'KidsPlayful 상세페이지',
    status: entry.imageProcessingStatus,
    createdAt: entry.createdAt,
    templateLabel: 'KidsPlayful',
    isCompletedVersion: isCompletedDetailGenerationStatus(entry.imageProcessingStatus),
    isRegistrationDetail: entry.id === input.savedDetailPageGenerationId,
    errorMessage: entry.imageProcessingError ?? null,
    kidsPlayfulEntry: entry,
  }));
  const boldRows = input.boldEntries.map((entry): DetailGenerationRow => ({
    key: `bold-vertical:${entry.id}`,
    kind: 'bold-vertical',
    id: entry.id,
    title: entry.productName || 'KIDITEM DESIGN 상세페이지',
    status: entry.imageProcessingStatus,
    createdAt: entry.createdAt,
    templateLabel: 'KIDITEM DESIGN',
    isCompletedVersion: isCompletedDetailGenerationStatus(entry.imageProcessingStatus),
    isRegistrationDetail: entry.id === input.savedDetailPageGenerationId,
    errorMessage: entry.imageProcessingError ?? null,
    kidsPlayfulEntry: entry,
  }));
  const byGenerationId = new Map<string, DetailGenerationRow>();
  for (const row of [...agentRows, ...kidsRows, ...boldRows]) {
    const existing = byGenerationId.get(row.id);
    if (!existing || (existing.kind === 'agent' && row.kind !== 'agent')) {
      byGenerationId.set(row.id, row);
    }
  }
  return [...byGenerationId.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function getCompletedDetailVersionRows(
  rows: DetailGenerationRow[],
): DetailGenerationRow[] {
  return rows.filter((row) => row.isCompletedVersion);
}
