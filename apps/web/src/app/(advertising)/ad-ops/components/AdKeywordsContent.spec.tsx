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
import { queryKeys } from '@/lib/query-keys';
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

/** What the server records on an approved keyword pause (KID-138 decision A). */
const MANUAL_ACTION_MESSAGE = '자동 실행하지 않는 액션입니다. 광고센터에서 직접 처리해 주세요.';

const KEYWORDS = [
  keyword('콩순이', proposal(ACTION.pending, 'pending_review', 'queued')),
  keyword('쥬쥬', proposal(ACTION.otherPending, 'pending_review', 'queued')),
  // Approved before decision A: its attempt still waits in the extension queue.
  keyword('타요', proposal(ACTION.queued, 'approved', 'queued')),
  keyword('뽀로로', proposal(ACTION.running, 'approved', 'running')),
  keyword('핑크퐁', proposal(ACTION.failed, 'approved', 'failed', MANUAL_ACTION_MESSAGE)),
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

/** `count` keywords of the product, each with its own proposal awaiting review. */
function pendingKeywords(count: number): AdKeywordSnapshot[] {
  return Array.from({ length: count }, (_, index) =>
    keyword(
      `키워드${index}`,
      proposal(`00000000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`, 'pending_review', 'queued'),
    ),
  );
}

/** The keyword read answers with these keywords for the product. */
function serveKeywords(keywords: AdKeywordSnapshot[]) {
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path === KEYWORDS_PATH) return { ...keywordsData(), keywords };
    throw new Error(`unexpected GET ${path}`);
  });
}

/** The 409 body the server sends when a rejection names an action that already ran. */
const ALREADY_RAN_REFUSAL = new ApiError(
  409,
  'HTTP_409',
  '이미 실행된 광고 액션은 거절할 수 없습니다. 광고센터에 이미 반영됐습니다.',
  { code: 'EXECUTION_TASK_DONE' },
);

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
  return client;
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
    const { action, ids, expectedApprovalStatus } = body as {
      action: string;
      ids: string[];
      expectedApprovalStatus?: string;
    };
    return { path, action, ids: [...ids].sort(), expectedApprovalStatus };
  });
}

/** A request reviewing proposals awaiting review. */
const pendingReview = { path: ACTIONS_PATH, expectedApprovalStatus: 'pending_review' } as const;
/** A request closing approved proposals. */
const approvedReview = { path: ACTIONS_PATH, expectedApprovalStatus: 'approved' } as const;

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
  it('shows each pause proposal state with only the review actions that state allows, and no way to run a pause', async () => {
    await renderExpandedProduct();

    expect(chip('콩순이').getByText('승인 대기')).toBeInTheDocument();
    expect(chip('콩순이').queryByText('광고센터에서 직접 꺼 주세요')).not.toBeInTheDocument();
    expect(reviewButtons('콩순이')).toEqual(['승인', '거절']);
    // An approved pause is the operator's to apply in the ad center, whatever its attempt reads.
    for (const approved of ['타요', '핑크퐁']) {
      expect(chip(approved).getByText('승인함')).toBeInTheDocument();
      expect(chip(approved).getByText('광고센터에서 직접 꺼 주세요')).toBeInTheDocument();
      expect(reviewButtons(approved)).toEqual(['닫기']);
    }
    expect(chip('뽀로로').getByText('실행 중')).toBeInTheDocument();
    expect(reviewButtons('뽀로로')).toEqual([]);
    expect(chip('브레드').getByText('완료')).toBeInTheDocument();
    expect(reviewButtons('브레드')).toEqual([]);
    expect(reviewButtons('비눗방울')).toEqual([]);
    expect(screen.queryByRole('button', { name: '다시 실행' })).not.toBeInTheDocument();
  });

  it('keeps chip buttons neutral in the dense keyword grid and the primary color for the product-wide approval', async () => {
    await renderExpandedProduct();

    for (const button of screen.getAllByRole('group').flatMap((group) => within(group).queryAllByRole('button'))) {
      expect(button).not.toHaveClass('btn-primary');
    }
    expect(screen.getByRole('button', { name: '이 상품 제안 2개 모두 승인' })).toHaveClass('btn-primary');
  });

  it("adds the attempt's recorded message to the chip's hover text, not to the chip", async () => {
    await renderExpandedProduct();

    expect(screen.getByRole('group', { name: '핑크퐁' })).toHaveAttribute(
      'title',
      `핑크퐁은 상품과 연관이 없습니다\n${MANUAL_ACTION_MESSAGE}`,
    );
    expect(chip('핑크퐁').queryByText(MANUAL_ACTION_MESSAGE)).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: '타요' })).toHaveAttribute(
      'title',
      '타요은 상품과 연관이 없습니다',
    );
  });

  it('approves one proposal, tells the operator to pause the keyword in the ad center, and reads the keywords again', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ updated: 1 });
    await renderExpandedProduct();
    expect(keywordReads()).toBe(1);

    fireEvent.click(chip('콩순이').getByRole('button', { name: '승인' }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        '제안 1개를 승인했습니다. 키워드 끄기는 자동으로 실행하지 않으니 광고센터에서 직접 꺼 주세요.',
      ),
    );
    expect(actionRequests()).toEqual([
      { ...pendingReview, action: 'approve', ids: [ACTION.pending] },
    ]);
    await waitFor(() => expect(keywordReads()).toBe(2));
  });

  it("marks the keyword list of every period stale after a review, since a proposal's state does not depend on the period", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ updated: 1 });
    const client = await renderExpandedProduct();
    // Another period's list, read earlier on this tab.
    client.setQueryData(queryKeys.ads.keywords('30d'), keywordsData());
    expect(client.getQueryState(queryKeys.ads.keywords('30d'))?.isInvalidated).toBe(false);

    fireEvent.click(chip('콩순이').getByRole('button', { name: '승인' }));

    await waitFor(() =>
      expect(client.getQueryState(queryKeys.ads.keywords('30d'))?.isInvalidated).toBe(true),
    );
    await waitFor(() => expect(keywordReads()).toBe(2));
  });

  it('rejects one proposal awaiting review, and only while it still awaits review', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ updated: 1 });
    await renderExpandedProduct();

    fireEvent.click(chip('콩순이').getByRole('button', { name: '거절' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('제안 1개를 거절했습니다.'));
    expect(actionRequests()).toEqual([
      { ...pendingReview, action: 'reject', ids: [ACTION.pending] },
    ]);
  });

  it('closes an approved proposal with a rejection, one at a time', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ updated: 1 });
    await renderExpandedProduct();

    fireEvent.click(chip('핑크퐁').getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('제안 1개를 닫았습니다.'));
    await waitFor(() => expect(chip('타요').getByRole('button', { name: '닫기' })).toBeEnabled());
    fireEvent.click(chip('타요').getByRole('button', { name: '닫기' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    // Closing names the review it expects, so a proposal no longer approved is left alone.
    expect(actionRequests()).toEqual([
      { ...approvedReview, action: 'reject', ids: [ACTION.failed] },
      { ...approvedReview, action: 'reject', ids: [ACTION.queued] },
    ]);
  });

  it('approves or rejects every proposal of the expanded product awaiting review, and only those, counting them whatever the filter shows', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ updated: 2 });
    await renderExpandedProduct();
    // The filter hides every chip; the product-wide buttons still count and send all of its proposals.
    fireEvent.click(screen.getByRole('button', { name: '노출 0' }));
    expect(screen.getByText('조건에 맞는 키워드가 없습니다.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '이 상품 제안 2개 모두 승인' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '이 상품 제안 2개 모두 거절' })).toBeEnabled(),
    );
    // An approved proposal is an operator's confirmation, so a product-wide rejection leaves it.
    fireEvent.click(screen.getByRole('button', { name: '이 상품 제안 2개 모두 거절' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    // Both name the review they expect, so a proposal approved or closed meanwhile is skipped.
    expect(actionRequests()).toEqual([
      { ...pendingReview, action: 'approve', ids: [ACTION.pending, ACTION.otherPending] },
      { ...pendingReview, action: 'reject', ids: [ACTION.pending, ACTION.otherPending] },
    ]);
  });

  it('sends a product-wide request above 200 proposals as requests of at most 200 distinct ids and reports their summed count once', async () => {
    const pending = pendingKeywords(201);
    // The first keyword also serves a second ad group: a second chip for the same proposal.
    serveKeywords([...pending, { ...pending[0], adGroup: 'group-2' }]);
    vi.mocked(apiClient.post).mockImplementation(async (_path: string, body: unknown) => ({
      updated: (body as { ids: string[] }).ids.length,
    }));
    await renderExpandedProduct();

    fireEvent.click(screen.getByRole('button', { name: '이 상품 제안 201개 모두 거절' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith('제안 201개를 거절했습니다.');
    const requests = vi.mocked(apiClient.post).mock.calls.map(([path, body]) => ({
      path,
      ...(body as { action: string; ids: string[]; expectedApprovalStatus: string }),
    }));
    expect(
      requests.map(({ path, action, ids, expectedApprovalStatus }) =>
        [path, action, ids.length, expectedApprovalStatus]),
    ).toEqual([
      [ACTIONS_PATH, 'reject', 200, 'pending_review'],
      [ACTIONS_PATH, 'reject', 1, 'pending_review'],
    ]);
    expect(new Set(requests.flatMap(({ ids }) => ids)).size).toBe(201);
  });

  it('stops a product-wide request at the first refused command, shows its reason and reads the keywords again', async () => {
    serveKeywords(pendingKeywords(201));
    vi.mocked(apiClient.post).mockRejectedValue(ALREADY_RAN_REFUSAL);
    await renderExpandedProduct();

    fireEvent.click(screen.getByRole('button', { name: '이 상품 제안 201개 모두 거절' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(ALREADY_RAN_REFUSAL.detail));
    // The command after the refused one is never sent.
    expect(
      vi.mocked(apiClient.post).mock.calls.map(([, body]) => (body as { ids: string[] }).ids.length),
    ).toEqual([200]);
    expect(toast.success).not.toHaveBeenCalled();
    await waitFor(() => expect(keywordReads()).toBe(2));
  });

  it("shows the server's reason and reads the keywords again when a rejection is refused", async () => {
    vi.mocked(apiClient.post).mockRejectedValue(ALREADY_RAN_REFUSAL);
    await renderExpandedProduct();
    expect(keywordReads()).toBe(1);

    // A stale "승인함" chip: an extension from before decision A finished the
    // pause after the list was read.
    fireEvent.click(chip('타요').getByRole('button', { name: '닫기' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(ALREADY_RAN_REFUSAL.detail));
    expect(toast.success).not.toHaveBeenCalled();
    await waitFor(() => expect(keywordReads()).toBe(2));
  });
});
