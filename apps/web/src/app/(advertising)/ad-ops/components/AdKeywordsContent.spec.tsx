import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type {
  AdKeywordPauseProposal,
  AdKeywordSnapshot,
  AdKeywordsData,
} from '@kiditem/shared/advertising';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import AdKeywordsContent from './AdKeywordsContent';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const KEYWORDS_PATH = '/api/ads/keywords?period=7d';
const ACTIONS_PATH = '/api/ads/actions';
const PRODUCT = '캐릭터 비눗방울 세트';
const ACTION = {
  pending: '00000000-0000-4000-8000-000000000001',
  otherPending: '00000000-0000-4000-8000-000000000002',
  queued: '00000000-0000-4000-8000-000000000003',
  running: '00000000-0000-4000-8000-000000000004',
  failed: '00000000-0000-4000-8000-000000000005',
  done: '00000000-0000-4000-8000-000000000006',
} as const;

const metrics = {
  spend: 1_000,
  revenue: 0,
  impressions: 100,
  clicks: 2,
  conversions: 0,
  ctr: 2,
  roas: 0,
  cvr: 0,
};

function proposal(
  actionId: string,
  approvalStatus: AdKeywordPauseProposal['approvalStatus'],
  executeStatus: AdKeywordPauseProposal['executeStatus'],
  errorMessage: string | null = null,
): AdKeywordPauseProposal {
  return { actionId, approvalStatus, executeStatus, errorMessage };
}

function keyword(text: string, pauseProposal: AdKeywordPauseProposal | null): AdKeywordSnapshot {
  return {
    channelAccountId: '11111111-1111-4111-8111-111111111111',
    campaignIdentity: 'campaign:1',
    campaignId: '1',
    campaignName: '집중 캠페인',
    adGroup: 'group-1',
    keyword: text,
    origin: 'smart_targeting',
    status: null,
    onOff: null,
    currentBid: null,
    externalOptionId: 'VID-1',
    productName: PRODUCT,
    listing: null,
    period: '7d',
    windowDays: 7,
    businessDate: '2026-09-14',
    conversionsAvailable: true,
    metrics,
    relevance: pauseProposal ? 'irrelevant' : null,
    relevanceReason: pauseProposal ? `${text}은 상품과 연관이 없습니다` : null,
    pauseProposal,
  };
}

const KEYWORDS = [
  keyword('콩순이', proposal(ACTION.pending, 'pending_review', 'queued')),
  keyword('쥬쥬', proposal(ACTION.otherPending, 'pending_review', 'queued')),
  keyword('타요', proposal(ACTION.queued, 'approved', 'queued')),
  keyword('뽀로로', proposal(ACTION.running, 'approved', 'running')),
  keyword('핑크퐁', proposal(ACTION.failed, 'approved', 'failed', '실행 기한 초과')),
  keyword('브레드', proposal(ACTION.done, 'approved', 'done')),
  keyword('비눗방울', null),
];

function keywordsData(): AdKeywordsData {
  return {
    period: '7d',
    windowDays: 7,
    collectedAt: '2026-09-14T03:00:00.000Z',
    products: [
      {
        externalOptionId: 'VID-1',
        productName: PRODUCT,
        campaignId: '1',
        campaignName: '집중 캠페인',
        listing: null,
        keywordCount: KEYWORDS.length,
        registeredCount: 0,
        smartTargetingCount: KEYWORDS.length,
        servingCount: KEYWORDS.length,
        irrelevantCount: 6,
        unjudgedCount: 1,
        conversionsAvailable: true,
        metrics,
      },
    ],
    keywords: KEYWORDS,
  };
}

function keywordReads() {
  return vi.mocked(apiClient.get).mock.calls.filter(([path]) => path === KEYWORDS_PATH).length;
}

async function renderExpandedProduct() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AdKeywordsContent period="7d" />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByText(PRODUCT));
}

function chip(name: string) {
  return within(screen.getByRole('group', { name }));
}

function reviewButtons(name: string) {
  return chip(name)
    .queryAllByRole('button')
    .map((button) => button.textContent?.trim());
}

function actionRequests() {
  return vi.mocked(apiClient.post).mock.calls.map(([path, body]) => {
    const { action, ids } = body as { action: string; ids: string[] };
    return { path, action, ids: [...ids].sort() };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path === KEYWORDS_PATH) return keywordsData();
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    throw new Error(`unexpected POST ${path}`);
  });
});

describe('AdKeywordsContent pause proposal review (KID-138)', () => {
  it('shows each pause proposal state with only the review actions that state allows', async () => {
    await renderExpandedProduct();

    expect(chip('콩순이').getByText('승인 대기')).toBeInTheDocument();
    expect(reviewButtons('콩순이')).toEqual(['승인', '거절']);
    expect(chip('타요').getByText('실행 대기')).toBeInTheDocument();
    expect(reviewButtons('타요')).toEqual(['거절']);
    expect(chip('뽀로로').getByText('실행 중')).toBeInTheDocument();
    expect(reviewButtons('뽀로로')).toEqual([]);
    expect(chip('핑크퐁').getByText('실패')).toBeInTheDocument();
    expect(chip('핑크퐁').getByText('실행 기한 초과')).toBeInTheDocument();
    expect(reviewButtons('핑크퐁')).toEqual(['다시 실행', '거절']);
    expect(chip('브레드').getByText('완료')).toBeInTheDocument();
    expect(reviewButtons('브레드')).toEqual([]);
    expect(reviewButtons('비눗방울')).toEqual([]);
  });

  it('approves one proposal, reports how many the server updated, and reads the keywords again', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ updated: 1 });
    await renderExpandedProduct();
    expect(keywordReads()).toBe(1);

    fireEvent.click(chip('콩순이').getByRole('button', { name: '승인' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('1개')));
    expect(actionRequests()).toEqual([
      { path: ACTIONS_PATH, action: 'approve', ids: [ACTION.pending] },
    ]);
    await waitFor(() => expect(keywordReads()).toBe(2));
  });

  it('runs a failed proposal again as an approval and rejects a queued one before it runs', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ updated: 1 });
    await renderExpandedProduct();

    fireEvent.click(chip('핑크퐁').getByRole('button', { name: '다시 실행' }));
    await waitFor(() => expect(chip('타요').getByRole('button', { name: '거절' })).toBeEnabled());
    fireEvent.click(chip('타요').getByRole('button', { name: '거절' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    expect(actionRequests()).toEqual([
      { path: ACTIONS_PATH, action: 'approve', ids: [ACTION.failed] },
      { path: ACTIONS_PATH, action: 'reject', ids: [ACTION.queued] },
    ]);
  });

  it('approves every proposal of the expanded product awaiting review and rejects every one it can still reject', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ updated: 2 });
    await renderExpandedProduct();

    fireEvent.click(screen.getByRole('button', { name: '이 상품 제안 모두 승인' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '모두 거절' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '모두 거절' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    expect(actionRequests()).toEqual([
      { path: ACTIONS_PATH, action: 'approve', ids: [ACTION.pending, ACTION.otherPending] },
      {
        path: ACTIONS_PATH,
        action: 'reject',
        ids: [ACTION.pending, ACTION.otherPending, ACTION.queued, ACTION.failed],
      },
    ]);
  });

  it("shows the server's reason when a rejection is refused", async () => {
    vi.mocked(apiClient.post).mockRejectedValue(
      new ApiError(409, 'EXECUTION_TASK_RUNNING', '실행 중인 광고 액션은 거절할 수 없습니다.'),
    );
    await renderExpandedProduct();

    fireEvent.click(chip('타요').getByRole('button', { name: '거절' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('실행 중인 광고 액션은 거절할 수 없습니다.'),
    );
  });
});
