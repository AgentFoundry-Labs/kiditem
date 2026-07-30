import { describe, expect, it } from 'vitest';
import { projectProductGenerationDialog } from './product-generation-progress';
import type { PanelAlertItem, PanelItem } from '@kiditem/shared/panel';
import type { GenerationDialogState } from '../../detail-template-generation/hooks/useGenerateForm';

const operationKey = 'product-generation:batch-1';
const baseState: GenerationDialogState = {
  open: true,
  phase: 'started',
  startedAt: '2026-07-29T00:00:00.000Z',
  productName: '자석 다트게임',
  templateId: 'bold-vertical',
  operationKey,
  detailGenerationId: 'detail-1',
  thumbnailGenerationId: 'thumbnail-1',
};

function alert(overrides: Partial<PanelAlertItem> = {}): PanelAlertItem {
  return {
    kind: 'alert',
    id: '44444444-4444-4444-8444-444444444444',
    alertKind: 'operation',
    status: 'running',
    severity: 'info',
    type: 'product_generation',
    title: '상품 생성 중: 자석 다트게임',
    message: '상세페이지와 썸네일을 생성하고 있습니다.',
    targetType: 'sourcing_candidate',
    targetId: '00000000-0000-4000-8000-000000000003',
    operationKey,
    sourceType: 'sourcing_candidate',
    sourceId: '00000000-0000-4000-8000-000000000003',
    isRead: false,
    actionTaskId: null,
    actorUserId: null,
    href: '/product-pipeline/collected-products/candidate-1',
    progress: 0.6,
    metadata: {
      children: { detail_page: 'succeeded', thumbnail: 'queued' },
      childIds: {
        detailPageGenerationId: 'detail-1',
        thumbnailGenerationId: 'thumbnail-1',
      },
    },
    readAt: null,
    startedAt: '2026-07-29T00:00:00.000Z',
    finishedAt: null,
    createdAt: '2026-07-29T00:00:00.000Z',
    ...overrides,
  };
}

describe('projectProductGenerationDialog', () => {
  it('uses the parent operation milestone and child states', () => {
    const item = alert();

    expect(
      projectProductGenerationDialog(baseState, { [item.id]: item }),
    ).toMatchObject({
      phase: 'started',
      progress: 0.6,
      progressLabel: '상세페이지 완료 · 썸네일 생성 중',
    });
  });

  it('makes a terminal parent failure authoritative', () => {
    const item = alert({
      status: 'failed',
      progress: 1,
      message: '상품 생성 일부 실패: 상세페이지 생성 실패',
      metadata: {
        children: { detail_page: 'failed', thumbnail: 'succeeded' },
      },
    });

    expect(
      projectProductGenerationDialog(
        { ...baseState, phase: 'completed' },
        { [item.id]: item },
      ),
    ).toMatchObject({
      phase: 'failed',
      progress: 1,
      progressLabel: '상세페이지 실패 · 썸네일 완료',
      errorMessage: '상품 생성 일부 실패: 상세페이지 생성 실패',
    });
  });

  it('ignores unrelated panel items', () => {
    const item = alert({ operationKey: 'product-generation:another-batch' });

    expect(
      projectProductGenerationDialog(baseState, { [item.id]: item } as Record<string, PanelItem>),
    ).toBe(baseState);
  });
});
