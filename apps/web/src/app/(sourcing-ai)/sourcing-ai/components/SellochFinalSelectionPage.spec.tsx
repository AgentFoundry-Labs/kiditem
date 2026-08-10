import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCreateSourcingReviewBatch,
  useSaveSourcingReviewSelection,
  useSourcingInterestTargets,
  useSourcingRecommendations,
  useSourcingReviewSelections,
} from '../hooks/use-sourcing-workspace';
import { SellochFinalSelectionPage } from './SellochFinalSelectionPage';

const RUN_ID = '00000000-0000-4000-8000-000000000001';
const ITEM_KEY = 'a'.repeat(64);

vi.mock('../hooks/use-sourcing-workspace', () => ({
  useCreateSourcingReviewBatch: vi.fn(),
  useSaveSourcingReviewSelection: vi.fn(),
  useSourcingInterestTargets: vi.fn(),
  useSourcingRecommendations: vi.fn(),
  useSourcingReviewSelections: vi.fn(),
}));

vi.mock('../lib/sourcing-agent-rag-api', () => ({
  querySourcingAgentRag: vi.fn(),
}));

vi.mock('./SellochFinalSelectionParts', () => ({
  FinalCandidateCard: ({ selected }: { selected: boolean }) => (
    <button type="button">{selected ? '선택됨' : '선택'}</button>
  ),
}));

describe('SellochFinalSelectionPage review state', () => {
  beforeEach(() => {
    vi.mocked(useSourcingInterestTargets).mockReturnValue({ data: [] } as never);
    vi.mocked(useSourcingRecommendations).mockReturnValue({
      data: {
        status: 'ready',
        generatedAt: '2026-08-10T00:00:00.000Z',
        lastSuccessfulAt: '2026-08-10T00:00:00.000Z',
        freshUntil: null,
        operationId: null,
        warnings: [],
        error: null,
        data: {
          runId: RUN_ID,
          nextCursor: null,
          items: [{
            itemKey: ITEM_KEY,
            sourcePlatform: '1688',
            externalOfferId: '123456789',
            variantKey: '',
            rank: 1,
            score: 80,
            grade: 'A',
            baselineAction: 'order',
            reasonCodes: [],
            riskCodes: [],
            displayName: '테스트 1688 상품',
            keyword: '테스트',
            isNewKeyword: false,
            imageUrl: null,
            sourceUrl: 'https://detail.1688.com/offer/123456789.html',
            overseasPriceCny: 10,
            overseasPriceKrw: 2000,
            salePriceKrw: 10000,
            supplierName: '테스트 공급사',
            monthlySales: 100,
            repurchaseRate: null,
            tradeScore: null,
            minOrderQuantity: 2,
            estimatedMarginRate: 40,
            estimatedProfitKrw: 5000,
            shippingLabel: null,
            rating: null,
            tags: [],
            sourceKeywords: ['테스트'],
            offerObservationIds: [],
            evidenceObservationIds: [],
            scoreComponents: { momentum: 60 },
            coupang: null,
            interest: null,
            contributingSources: ['1688'],
          }],
        },
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useSourcingRecommendations>);
    vi.mocked(useSourcingReviewSelections).mockReturnValue({
      data: [{
        workspaceKey: 'final',
        recommendationRunId: RUN_ID,
        itemKey: ITEM_KEY,
        state: 'selected',
        version: 1,
        updatedAt: '2026-08-10T00:00:00.000Z',
      }],
    } as ReturnType<typeof useSourcingReviewSelections>);
    vi.mocked(useSaveSourcingReviewSelection).mockReturnValue({ mutate: vi.fn() } as never);
    vi.mocked(useCreateSourcingReviewBatch).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
  });

  it('renders a persisted server review selection for the current recommendation run', async () => {
    render(
      <StrictMode>
        <SellochFinalSelectionPage />
      </StrictMode>,
    );

    expect(await screen.findByRole('button', { name: '선택됨' })).toBeInTheDocument();
  });
});
