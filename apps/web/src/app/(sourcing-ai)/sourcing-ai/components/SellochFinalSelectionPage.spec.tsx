import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';
import { runSourcing1688NewProductModel } from '../lib/sourcing-1688-new-product-model-api';
import { SellochFinalSelectionPage } from './SellochFinalSelectionPage';

const SOURCE_URL = 'https://detail.1688.com/offer/123456789.html';
let storedSelection: string | null = null;

vi.mock('@/lib/browser-storage', () => ({
  safeStorageGet: vi.fn(),
  safeStorageSet: vi.fn(),
}));

vi.mock('@/lib/session-cache-key', () => ({
  sessionScopedDailyCacheKey: vi.fn(() => 'final-selection-test-key'),
}));

vi.mock('../lib/final-selection-chat', () => ({
  buildFinalSelectionAgentResponse: vi.fn(),
}));

vi.mock('../lib/1688-new-product-snapshot', () => ({
  appendCached1688ImageMatchesToSnapshot: vi.fn().mockResolvedValue(0),
  buildCached1688ImageMatchCandidates: vi.fn(() => []),
}));

vi.mock('../lib/sourcing-1688-new-product-model-api', () => ({
  runSourcing1688NewProductModel: vi.fn(),
}));

vi.mock('../lib/sourcing-agent-rag-api', () => ({
  querySourcingAgentRag: vi.fn(),
}));

vi.mock('../lib/sourcing-interest-tracking', () => ({
  loadLatestInterestTrackingPayload: vi.fn().mockResolvedValue({
    result: { targets: [] },
  }),
}));

vi.mock('../lib/sourcing-workspace-snapshot-api', () => ({
  getTodaySourcingWorkspaceSnapshot: vi.fn().mockResolvedValue({ snapshot: null }),
}));

vi.mock('../lib/use-today-recommendation-rows', () => ({
  useTodayRecommendationRows: vi.fn(() => []),
}));

vi.mock('./SellochFinalSelectionParts', () => ({
  FinalCandidateCard: ({
    row,
    selected,
    onToggleSelection,
  }: {
    row: { title: string };
    selected: boolean;
    onToggleSelection: (row: unknown) => void;
  }) => (
    <button type="button" onClick={() => onToggleSelection(row)}>
      {selected ? '선택됨' : '선택'}
    </button>
  ),
}));

describe('SellochFinalSelectionPage persisted selections', () => {
  beforeEach(() => {
    vi.mocked(safeStorageGet).mockReset();
    vi.mocked(safeStorageSet).mockReset();
    storedSelection = JSON.stringify({ [SOURCE_URL]: true });
    vi.mocked(safeStorageGet).mockImplementation(() => storedSelection);
    vi.mocked(safeStorageSet).mockImplementation((_, __, value) => {
      storedSelection = value;
      return true;
    });
    vi.mocked(runSourcing1688NewProductModel).mockReset();
    vi.mocked(runSourcing1688NewProductModel).mockResolvedValue({
      generatedAt: '2026-08-10T00:00:00.000Z',
      result: {
        candidates: [
          {
            id: 'server-candidate-id',
            rank: 1,
            offerId: '123456789',
            title: '테스트 1688 상품',
            imageUrl: null,
            sourceUrl: SOURCE_URL,
            keyword: '테스트',
            matchMethod: 'image',
            score: 80,
            grade: 'A',
            decision: 'order',
            components: {
              newProductSignal: 80,
              supplyQuality: 80,
              coupangMatch: 80,
              marketReaction: 80,
              threeDayValidation: 80,
              marginPotential: 80,
              riskPenalty: 0,
            },
            wholesale: {
              priceCny: 10,
              monthlySales: 100,
              tradeScore: 90,
              repurchaseRate: null,
              supplierName: '테스트 공급사',
              shippingFulfillmentRate: '99%',
              shippingPickupRate: '99%',
              serviceScore: 90,
              landedCostKrw: 3000,
              estimatedProfitKrw: 5000,
              estimatedMarginRate: 40,
              sourceDate: '2026-08-10',
            },
            matchedCoupang: {
              productId: 'coupang-product-1',
              productName: '테스트 쿠팡 상품',
              primaryKeyword: '테스트',
              score: 80,
              grade: 'A',
              salePrice: 10000,
              salesLast3d: 20,
              salesLast28d: 100,
              reviews: 10,
              matchScore: 95,
            },
            reasons: [],
            risks: [],
            modelTags: [],
            sourceSnapshotId: 'snapshot-1',
            sourceDate: '2026-08-10',
          },
        ],
        stats: {
          candidateCount: 1,
          sourceSnapshotCount: 1,
          orderCount: 1,
          observeCount: 0,
          excludedCount: 0,
          averageScore: 80,
          topKeyword: '테스트',
        },
        model: {
          pipeline: '1688_first_new_product_validation',
          version: 1,
          generatorVersion: 'test',
          weights: {},
        },
      },
    });
  });

  it('restores a selection when the current model row has a different transient id', async () => {
    render(
      <StrictMode>
        <SellochFinalSelectionPage />
      </StrictMode>,
    );

    expect(
      await screen.findByRole('button', { name: '선택됨' }),
    ).toBeInTheDocument();
  });
});
