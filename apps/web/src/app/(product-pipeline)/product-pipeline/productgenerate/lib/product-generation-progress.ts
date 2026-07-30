import type { PanelAlertItem, PanelItem } from '@kiditem/shared/panel';
import type {
  GenerationDialogPhase,
  GenerationDialogState,
} from '../../detail-template-generation/hooks/useGenerateForm';

type ChildKind = 'detail_page' | 'thumbnail';
type ChildStatus = 'queued' | 'running' | 'succeeded' | 'failed';

const PRODUCT_GENERATION_OPERATION_KEY_PREFIX = 'product-generation:';

export function projectProductGenerationDialog(
  state: GenerationDialogState | null,
  itemsById: Record<string, PanelItem>,
): GenerationDialogState | null {
  if (!state?.operationKey?.startsWith(PRODUCT_GENERATION_OPERATION_KEY_PREFIX)) {
    return state;
  }

  const alert = Object.values(itemsById).find(
    (item): item is PanelAlertItem =>
      item.kind === 'alert' &&
      item.alertKind === 'operation' &&
      item.type === 'product_generation' &&
      item.operationKey === state.operationKey,
  );
  if (!alert) return state;

  const phase = alertStatusToDialogPhase(alert.status);
  const progress = normalizeProgress(alert.progress, phase, state.progress);
  const progressLabel = buildProgressLabel(alert, state, phase);

  return {
    ...state,
    phase,
    progress,
    progressLabel,
    description: alert.message ?? state.description,
    errorMessage: phase === 'failed' ? alert.message ?? state.errorMessage : state.errorMessage,
  };
}

function alertStatusToDialogPhase(status: PanelAlertItem['status']): GenerationDialogPhase {
  if (status === 'succeeded' || status === 'resolved') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  return 'started';
}

function normalizeProgress(
  progress: number | null,
  phase: GenerationDialogPhase,
  fallback: number | null | undefined,
): number {
  if (phase === 'completed' || phase === 'failed') return 1;
  if (typeof progress === 'number') return Math.max(0, Math.min(1, progress));
  if (typeof fallback === 'number') return Math.max(0, Math.min(1, fallback));
  return phase === 'submitting' ? 0.1 : 0.25;
}

function buildProgressLabel(
  alert: PanelAlertItem,
  state: GenerationDialogState,
  phase: GenerationDialogPhase,
): string {
  if (phase === 'completed') return '상세페이지 · 썸네일 생성 완료';
  if (phase === 'cancelled') return '상품 생성 중단됨';

  const detailStatus = childStatus(alert, state, 'detail_page');
  const thumbnailStatus = childStatus(alert, state, 'thumbnail');
  return [
    childLabel('상세페이지', detailStatus),
    childLabel('썸네일', thumbnailStatus),
  ].join(' · ');
}

function childStatus(
  alert: PanelAlertItem,
  state: GenerationDialogState,
  kind: ChildKind,
): ChildStatus {
  const metadata = alert.metadata;
  const children = asRecord(metadata.children);
  const rawStatus = children[kind];
  if (rawStatus === 'succeeded' || rawStatus === 'failed') return rawStatus;

  const childIds = asRecord(metadata.childIds);
  const childIdKey = kind === 'detail_page' ? 'detailPageGenerationId' : 'thumbnailGenerationId';
  const stateId = kind === 'detail_page' ? state.detailGenerationId : state.thumbnailGenerationId;
  if (typeof childIds[childIdKey] === 'string' || stateId) return 'running';
  return 'queued';
}

function childLabel(label: string, status: ChildStatus): string {
  if (status === 'succeeded') return `${label} 완료`;
  if (status === 'failed') return `${label} 실패`;
  if (status === 'running') return `${label} 생성 중`;
  return `${label} 대기 중`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
