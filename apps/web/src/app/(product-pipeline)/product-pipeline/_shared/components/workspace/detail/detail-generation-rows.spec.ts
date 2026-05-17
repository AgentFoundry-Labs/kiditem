import { describe, expect, it } from 'vitest';
import {
  buildDetailGenerationRows,
  getCompletedDetailVersionRows,
  getDetailGenerationStatusRows,
} from './detail-generation-rows';
import type { GenerationHistoryItem } from '../../../hooks/useGenerationHistory';

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
  it('splits completed versions from running and failed status rows', () => {
    const rows = buildDetailGenerationRows({
      agentHistory: [completed, failed],
      kidsPlayfulEntries: [],
      boldEntries: [],
      savedDetailPageGenerationId: 'completed-1',
    });

    expect(getCompletedDetailVersionRows(rows).map((row) => row.id)).toEqual(['completed-1']);
    expect(getDetailGenerationStatusRows(rows).map((row) => row.id)).toEqual(['failed-1']);
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
});
