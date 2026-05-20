import { describe, expect, it } from 'vitest';
import {
  buildDetailGenerationRows,
  getCompletedDetailVersionRows,
} from './detail-generation-rows';
import type { GenerationHistoryItem } from '../../../hooks/useGenerationHistory';
import type { KidsPlayfulGenerationItem } from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate';

const completed: GenerationHistoryItem = {
  id: 'completed-1',
  generatedTitle: '완성 상세페이지',
  status: 'COMPLETED',
  templateId: 'kids-playful',
  detailPageData: null,
  imageUrls: [],
  processedImages: {},
  detailPageArtifactId: 'artifact-1',
  detailPageRevisionId: null,
  errorMessage: null,
  productId: null,
  createdAt: '2026-05-16T01:00:00.000Z',
};

const failed: GenerationHistoryItem = {
  ...completed,
  id: 'failed-1',
  generatedTitle: '실패 상세페이지',
  status: 'FAILED',
  errorMessage: 'agent failed',
  createdAt: '2026-05-16T02:00:00.000Z',
};

describe('detail generation rows', () => {
  it('keeps only completed generations in the selectable version rows', () => {
    const rows = buildDetailGenerationRows({
      agentHistory: [completed, failed],
      kidsPlayfulEntries: [],
      boldEntries: [],
      savedDetailPageGenerationId: 'completed-1',
    });

    expect(getCompletedDetailVersionRows(rows).map((row) => row.id)).toEqual(['completed-1']);
    expect(getCompletedDetailVersionRows(rows)[0].isRegistrationDetail).toBe(true);
  });

  it('sorts newest rows first', () => {
    const rows = buildDetailGenerationRows({
      agentHistory: [
        { ...completed, id: 'old', createdAt: '2026-05-15T01:00:00.000Z' },
        { ...completed, id: 'new', createdAt: '2026-05-16T01:00:00.000Z' },
      ],
      kidsPlayfulEntries: [],
      boldEntries: [],
      savedDetailPageGenerationId: null,
    });

    expect(rows.map((row) => row.id)).toEqual(['new', 'old']);
  });

  it('deduplicates generated detail versions by generation id and keeps the template-specific row', () => {
    const boldEntry: KidsPlayfulGenerationItem = {
      id: 'completed-1',
      productId: null,
      sourceCandidateId: null,
      contentWorkspaceId: 'workspace-1',
      templateId: 'bold-vertical',
      productName: 'KIDITEM 생성 결과',
      rawInput: {},
      result: {
        hook: {
          text: '템플릿 제목',
          subtext: '템플릿 부제목',
        },
      } as never,
      imageUrls: [],
      processedImages: {},
      imageProcessingStatus: 'completed',
      imageProcessingError: null,
      createdAt: '2026-05-16T01:00:00.000Z',
    };

    const rows = buildDetailGenerationRows({
      agentHistory: [completed],
      kidsPlayfulEntries: [],
      boldEntries: [boldEntry],
      savedDetailPageGenerationId: 'completed-1',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'completed-1',
      kind: 'bold-vertical',
      templateLabel: 'KIDITEM DESIGN',
      isRegistrationDetail: true,
    });
  });
});
