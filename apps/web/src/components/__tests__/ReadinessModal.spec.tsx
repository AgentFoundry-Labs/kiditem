import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import ReadinessModal from '../ReadinessModal';
import type { ReadinessResponse } from '@kiditem/shared/readiness';

const mockApiGet = vi.hoisted(() => vi.fn());
const mockHandleCollect = vi.hoisted(() => vi.fn());
const mockCatalog = vi.hoisted(() => ({ value: null as unknown }));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: mockApiGet,
    post: vi.fn(),
  },
}));

vi.mock('@/app/(inventory)/_shared/sellpia-inventory-source-owner', () => ({
  useSellpiaInventoryCollection: () => ({
    control: {
      state: 'idle',
      statusRead: 'current',
      running: null,
      canStop: false,
      notice: null,
      start: vi.fn(),
      stop: vi.fn(),
    },
    state: null,
    confirmSourceBinding: vi.fn(),
    isConfirming: false,
  }),
}));

vi.mock('../readiness/useReadinessCollection', () => ({
  useReadinessCollection: () => ({
    pendingKey: null,
    handleCollect: mockHandleCollect,
    catalog: mockCatalog.value,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

const TODAY_DISMISSED_KEY = 'kiditem.readiness.dismissedDate';
const SESSION_DISMISSED_KEY = 'kiditem.readiness.dismissed';
const CAMPAIGN_SOURCE_PATH = '/api/ads/ad-campaigns/source';
const KEYWORD_SOURCE_PATH = '/api/ads/ad-keywords/source';
const AD_ACCOUNT_ID = '00000000-0000-4000-8000-000000000011';
const EMPTY_OWNER_SOURCE = {
  channelAccountId: null,
  ready: false,
  latestAttempt: null,
  latestComplete: null,
  actualCutoffAt: null,
};

function completeCampaignSweep() {
  return {
    attemptId: '00000000-0000-4000-8000-000000000012',
    channelAccountId: AD_ACCOUNT_ID,
    state: 'COMPLETE',
    plan: {
      sourceType: 'coupang_ad_campaign',
      parserVersion: 'ad-campaign-v1',
      channelAccountId: AD_ACCOUNT_ID,
      expectedAdvertiserId: 'advertiser-1',
      startDate: '2026-08-06',
      endDate: '2026-09-05',
      businessDates: Array.from({ length: 31 }, (_, index) =>
        new Date(Date.UTC(2026, 8, 5 - index)).toISOString().slice(0, 10),
      ),
    },
    expiresAt: '2099-01-01T00:00:00.000Z',
    actualCutoffAt: '2026-09-06T00:00:00.000Z',
    manifestChecksum: 'a'.repeat(64),
    rowCount: 31,
    campaignCount: 1,
    rawOnlyCampaignCount: 0,
    warningCount: 0,
    errorCode: null,
    errorMessage: null,
  };
}

function campaignSweepSource(ready: boolean) {
  const complete = completeCampaignSweep();
  return {
    channelAccountId: AD_ACCOUNT_ID,
    ready,
    latestAttempt: complete,
    latestComplete: complete,
    actualCutoffAt: complete.actualCutoffAt,
  };
}

let readiness: unknown;
let campaignSource: unknown;

function setReadiness(response: unknown) {
  readiness = response;
}

function readinessReads(): number {
  return mockApiGet.mock.calls.filter(([path]) => path === '/api/readiness').length;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 60_000 },
      mutations: { retry: false },
    },
  });
}

function wrapper(queryClient = makeQueryClient()) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function ControlledAutoOpenHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>수동으로 데이터 보기</button>
      <ReadinessModal
        open={open}
        onClose={() => setOpen(false)}
        onRequestOpen={() => setOpen(true)}
        autoOpenWhen="collectionIssue"
      />
    </>
  );
}

function makeReadinessResponse(): ReadinessResponse {
  return {
    checks: [
      {
        key: 'wing_sales',
        label: 'Wing 매출',
        basis: {
          asOf: null,
          requiredAsOf: '2026-05-21',
          observedAt: null,
          sources: ['sellpia_orders'],
          measured: false,
          withheldCount: 0,
        },
        detail: '어제 주문 데이터 없음',
        lastSyncedAt: null,
        count: null,
        referenceDate: '2026-05-21',
        expectedDates: ['2026-05-21'],
        missingDates: ['2026-05-21'],
      },
      {
        key: 'coupang_ads',
        label: '쿠팡 광고',
        basis: {
          asOf: '2026-05-21',
          requiredAsOf: '2026-05-21',
          observedAt: '2026-05-21T00:00:00.000Z',
          sources: ['coupang_ads'],
          measured: true,
          withheldCount: 0,
        },
        detail: '광고 데이터 최신',
        lastSyncedAt: '2026-05-21T00:00:00.000Z',
        count: 1,
        referenceDate: '2026-05-21',
        expectedDates: ['2026-05-21'],
        missingDates: [],
      },
    ],
  };
}

const CATALOG_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const CATALOG_ATTEMPT_ID = '00000000-0000-4000-8000-000000000002';
const CATALOG_CHILD_ATTEMPT_ID = '00000000-0000-4000-8000-000000000005';
const CATALOG_IDEMPOTENCY_KEY = '00000000-0000-4000-8000-000000000003';
const CATALOG_DETAILS_IDEMPOTENCY_KEY = '00000000-0000-4000-8000-000000000006';

function makeCatalogReadinessResponse(): ReadinessResponse {
  const response = makeReadinessResponse();
  return {
    ...response,
    checks: [
      ...response.checks,
      {
        key: 'coupang_products',
        label: '쿠팡 상품 데이터 수집',
        basis: {
          asOf: null,
          requiredAsOf: null,
          observedAt: null,
          sources: ['wing_catalog'],
          measured: false,
          withheldCount: 0,
        },
        detail: '쿠팡 상품 기본 목록 1,254건 반영됨 — 전체 상세 수집 필요',
        lastSyncedAt: null,
        count: 1254,
        referenceDate: null,
        expectedDates: [],
        missingDates: [],
      },
    ],
  };
}

function makeCatalogOwner(overrides: Record<string, unknown> = {}) {
  const plan = {
    collectorVersion: 'wing-inventory-v1',
    stage: 'basics',
    listUrl: 'https://wing.coupang.com/list',
    detailUrl: 'https://wing.coupang.com/detail',
    channelAccountId: CATALOG_ACCOUNT_ID,
    vendorId: 'A001',
    publicationRevision: '0',
  };
  return {
    attemptId: CATALOG_ATTEMPT_ID,
    idempotencyKey: CATALOG_IDEMPOTENCY_KEY,
    channelAccountId: CATALOG_ACCOUNT_ID,
    state: 'COMPLETE',
    expiresAt: '2030-01-01T00:00:00.000Z',
    plan,
    phase: 'finished',
    collectorVersion: 'wing-inventory-v1',
    manifest: null,
    progress: {
      discoveryPagesStored: 1,
      discoveredProducts: 1254,
      hydratedProducts: 1254,
      optionCount: 1254,
      mediaCount: 0,
      storedChunks: 1,
      publishedProducts: 1254,
      publishedOptionCount: 1254,
      publishedMediaCount: 0,
      publishedChunks: 1,
      firstPublishedAt: null,
      lastPublishedAt: null,
    },
    missing: { discoverySequences: [], productIds: [] },
    snapshotHash: null,
    error: null,
    publication: null,
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:01:00.000Z',
    finishedAt: '2026-09-06T00:01:00.000Z',
    rootAttemptId: CATALOG_ATTEMPT_ID,
    currentAttemptId: CATALOG_ATTEMPT_ID,
    currentStage: 'basics',
    overallState: 'COMPLETE',
    ...overrides,
  };
}

function makeCatalogState(owner: Record<string, unknown>, chainOverallState: string | null) {
  return {
    accounts: [{ id: CATALOG_ACCOUNT_ID, channel: 'coupang', isPrimary: true }],
    accountsLoading: false,
    accountsError: null,
    accountId: CATALOG_ACCOUNT_ID,
    accountLocked: true,
    setAccountId: vi.fn(),
    linkError: null,
    chainOverallState,
    owner,
    browser: null,
    ownerLoading: false,
    ownerError: null,
    actionError: null,
    cancelError: null,
    isCancelling: false,
    cancel: vi.fn(),
    openAttention: vi.fn(),
  };
}

describe('ReadinessModal', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === CAMPAIGN_SOURCE_PATH) return campaignSource;
      if (path === KEYWORD_SOURCE_PATH) return EMPTY_OWNER_SOURCE;
      return readiness;
    });
    setReadiness(makeReadinessResponse());
    campaignSource = EMPTY_OWNER_SOURCE;
    mockHandleCollect.mockReset();
    mockCatalog.value = null;
    localStorage.clear();
    sessionStorage.clear();
  });

  it('lets the user suppress the automatic readiness modal for today', async () => {
    render(<ReadinessModal autoOpenWhen="collectionIssue" />, { wrapper: wrapper() });

    const dismissButton = await screen.findByRole('button', { name: '오늘 하루 보지 않기' });
    fireEvent.click(dismissButton);

    expect(localStorage.getItem(TODAY_DISMISSED_KEY)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sessionStorage.getItem(SESSION_DISMISSED_KEY)).toBe('1');
    expect(screen.queryByRole('button', { name: '오늘 하루 보지 않기' })).not.toBeInTheDocument();
  });

  it('does not auto-open again when today has already been dismissed', async () => {
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    localStorage.setItem(TODAY_DISMISSED_KEY, dateKey);

    render(<ReadinessModal autoOpenWhen="collectionIssue" />, { wrapper: wrapper() });

    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/api/readiness'));
    expect(screen.queryByRole('button', { name: '오늘 하루 보지 않기' })).not.toBeInTheDocument();
  });

  it('respects session dismissal for collection-issue auto-open mode', async () => {
    sessionStorage.setItem(SESSION_DISMISSED_KEY, '1');

    render(<ReadinessModal autoOpenWhen="collectionIssue" />, { wrapper: wrapper() });

    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/api/readiness'));
    expect(screen.queryByRole('button', { name: '오늘 하루 보지 않기' })).not.toBeInTheDocument();
  });

  it('still opens when controlled by an explicit user action', async () => {
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    localStorage.setItem(TODAY_DISMISSED_KEY, dateKey);

    render(<ReadinessModal open onClose={vi.fn()} />, { wrapper: wrapper() });

    const returnToDashboard = await screen.findByRole('button', { name: '대시보드로 돌아가기' });
    expect(returnToDashboard).toBeEnabled();
    expect(screen.queryByRole('button', { name: '오늘 하루 보지 않기' })).not.toBeInTheDocument();
  });

  it('keeps one controlled owner through auto-open, close, and manual reopen', async () => {
    render(<ControlledAutoOpenHarness />, { wrapper: wrapper() });

    const returnToDashboard = await screen.findByRole('button', { name: '대시보드로 돌아가기' });
    fireEvent.click(returnToDashboard);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '대시보드로 돌아가기' })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '수동으로 데이터 보기' }));
    expect(await screen.findByRole('button', { name: '대시보드로 돌아가기' })).toBeInTheDocument();
  });

  it('marks only server-confirmed dates green in the daily status strip', async () => {
    const response = makeReadinessResponse();
    setReadiness({
      ...response,
      checks: [
        {
          ...response.checks[0],
          expectedDates: ['2026-05-20', '2026-05-21'],
          missingDates: ['2026-05-21'],
        },
        response.checks[1],
      ],
    });

    const view = render(<ReadinessModal open onClose={vi.fn()} />, {
      wrapper: wrapper(),
    });
    fireEvent.click(
      await screen.findByRole('button', {
        name: '일별 매출 날짜별 현황 보기',
      }),
    );

    expect(view.container.querySelector('[title="2026-05-20"]')).toHaveClass(
      'bg-emerald-500',
    );
    expect(view.container.querySelector('[title="2026-05-21"]')).toHaveClass(
      'bg-rose-500',
    );
  });

  it('shows server-confirmed daily coverage for a completed ad check', async () => {
    const response = makeReadinessResponse();
    setReadiness({
      ...response,
      checks: [
        response.checks[0],
        {
          ...response.checks[1],
          expectedDates: ['2026-05-19', '2026-05-20'],
          missingDates: [],
        },
      ],
    });

    const view = render(<ReadinessModal open onClose={vi.fn()} />, {
      wrapper: wrapper(),
    });
    fireEvent.click(
      await screen.findByRole('button', {
        name: '광고 성과 날짜별 현황 보기',
      }),
    );

    expect(view.container.querySelector('[title="2026-05-19"]')).toHaveClass(
      'bg-emerald-500',
    );
    expect(view.container.querySelector('[title="2026-05-20"]')).toHaveClass(
      'bg-emerald-500',
    );
  });

  it('keeps a linked details handoff in status-checking state until the child receipt arrives', async () => {
    const response = makeReadinessResponse();
    setReadiness({
      ...response,
      checks: [
        ...response.checks,
        {
          key: 'coupang_products',
          label: '쿠팡 상품',
          basis: {
            asOf: null,
            requiredAsOf: null,
            observedAt: null,
            sources: ['wing_catalog'],
            measured: false,
            withheldCount: 0,
          },
          detail: '쿠팡 상품 데이터 없음',
          lastSyncedAt: null,
          count: null,
          referenceDate: null,
          expectedDates: [],
          missingDates: [],
        },
      ],
    });
    mockCatalog.value = {
      accounts: [],
      accountsLoading: false,
      accountsError: null,
      accountId: '00000000-0000-4000-8000-000000000001',
      accountLocked: true,
      setAccountId: vi.fn(),
      linkError: null,
      chainOverallState: null,
      owner: {
        attemptId: '00000000-0000-4000-8000-000000000002',
        idempotencyKey: '00000000-0000-4000-8000-000000000003',
        channelAccountId: '00000000-0000-4000-8000-000000000001',
        state: 'COMPLETE',
        expiresAt: '2030-01-01T00:00:00.000Z',
        plan: {
          collectorVersion: 'wing-inventory-v1',
          stage: 'basics',
          listUrl: 'https://wing.coupang.com/list',
          detailUrl: 'https://wing.coupang.com/detail',
          channelAccountId: '00000000-0000-4000-8000-000000000001',
          vendorId: 'A001',
          publicationRevision: '0',
        },
        phase: 'finished',
        collectorVersion: 'wing-inventory-v1',
        manifest: null,
        progress: {
          discoveryPagesStored: 1,
          discoveredProducts: 10,
          hydratedProducts: 10,
          optionCount: 10,
          mediaCount: 0,
          storedChunks: 1,
          publishedProducts: 10,
          publishedOptionCount: 10,
          publishedMediaCount: 0,
          publishedChunks: 1,
          firstPublishedAt: null,
          lastPublishedAt: null,
        },
        missing: { discoverySequences: [], productIds: [] },
        snapshotHash: null,
        error: null,
        publication: null,
        createdAt: '2026-09-06T00:00:00.000Z',
        updatedAt: '2026-09-06T00:00:00.000Z',
        finishedAt: '2026-09-06T00:01:00.000Z',
        rootAttemptId: '00000000-0000-4000-8000-000000000002',
        currentAttemptId: '00000000-0000-4000-8000-000000000005',
        currentStage: 'details',
      },
      browser: null,
      ownerLoading: false,
      ownerError: null,
      actionError: null,
      cancelError: null,
      isCancelling: false,
      cancel: vi.fn(),
      openAttention: vi.fn(),
    };

    render(<ReadinessModal open onClose={vi.fn()} />, { wrapper: wrapper() });

    expect(await screen.findByRole('button', { name: '상태 확인 중' })).toBeDisabled();
    expect(screen.getByText('상세 상품 받기 상태 확인 중입니다. 잠시 후 다시 확인해주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 받기' })).not.toBeInTheDocument();
  });

  it('renders a saved basics receipt as partial coverage and keeps 상품 받기 available', async () => {
    setReadiness(makeCatalogReadinessResponse());
    const owner = makeCatalogOwner({
      plan: { ...makeCatalogOwner().plan, detailsIdempotencyKey: undefined },
      currentAttemptId: CATALOG_ATTEMPT_ID,
      currentStage: 'basics',
      overallState: 'COMPLETE',
    });
    mockCatalog.value = makeCatalogState(owner, 'COMPLETE');

    render(<ReadinessModal open onClose={vi.fn()} />, { wrapper: wrapper() });

    expect(await screen.findByText('기본 목록 보강 완료 1,254 / 1,254')).toBeInTheDocument();
    expect(screen.getByText('기본 목록 반영 완료 · 전체 상세 수집 필요')).toBeInTheDocument();
    expect(screen.queryByText('전체 상품 반영 완료')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상품 받기' })).toBeEnabled();
  });

  it('keeps basic progress labels while the details child is running', async () => {
    setReadiness(makeCatalogReadinessResponse());
    const rootOwner = makeCatalogOwner({
      plan: {
        ...makeCatalogOwner().plan,
        detailsIdempotencyKey: CATALOG_DETAILS_IDEMPOTENCY_KEY,
      },
      currentAttemptId: CATALOG_CHILD_ATTEMPT_ID,
      currentStage: 'details',
      overallState: 'RUNNING',
    });
    mockCatalog.value = makeCatalogState(rootOwner, 'RUNNING');

    render(<ReadinessModal open onClose={vi.fn()} />, { wrapper: wrapper() });

    expect(await screen.findByText('기본 목록 수집 1,254 / 1,254')).toBeInTheDocument();
    expect(screen.queryByText('상세 수집 1,254 / 1,254')).not.toBeInTheDocument();
  });

  it('renders the whole-flow completion label for a terminal details receipt', async () => {
    setReadiness(makeCatalogReadinessResponse());
    const owner = makeCatalogOwner({
      attemptId: CATALOG_CHILD_ATTEMPT_ID,
      idempotencyKey: CATALOG_DETAILS_IDEMPOTENCY_KEY,
      plan: {
        ...makeCatalogOwner().plan,
        stage: 'details',
        detailsIdempotencyKey: CATALOG_DETAILS_IDEMPOTENCY_KEY,
      },
      rootAttemptId: CATALOG_ATTEMPT_ID,
      currentAttemptId: CATALOG_CHILD_ATTEMPT_ID,
      currentStage: 'details',
      overallState: 'COMPLETE',
    });
    mockCatalog.value = makeCatalogState(owner, 'COMPLETE');

    render(<ReadinessModal open onClose={vi.fn()} />, { wrapper: wrapper() });

    expect(await screen.findByText('전체 상품 반영 완료')).toBeInTheDocument();
  });

  it('keeps refresh reachable when the catalog readiness check is already ok', async () => {
    const response = makeCatalogReadinessResponse();
    setReadiness({
      ...response,
      checks: response.checks.map((check) =>
        check.key === 'coupang_products'
          ? {
              ...check,
              basis: {
                ...check.basis,
                asOf: '2026-09-06',
                requiredAsOf: '2026-09-06',
                observedAt: '2026-09-06T00:01:00.000Z',
                measured: true,
              },
              detail: '쿠팡 상품 1,254건 최신',
              lastSyncedAt: '2026-09-06T00:01:00.000Z',
            }
          : check,
      ),
    });
    const owner = makeCatalogOwner({
      attemptId: CATALOG_CHILD_ATTEMPT_ID,
      idempotencyKey: CATALOG_DETAILS_IDEMPOTENCY_KEY,
      plan: {
        ...makeCatalogOwner().plan,
        stage: 'details',
        detailsIdempotencyKey: CATALOG_DETAILS_IDEMPOTENCY_KEY,
      },
      rootAttemptId: CATALOG_ATTEMPT_ID,
      currentAttemptId: CATALOG_CHILD_ATTEMPT_ID,
      currentStage: 'details',
      overallState: 'COMPLETE',
    });
    mockCatalog.value = makeCatalogState(owner, 'COMPLETE');

    render(<ReadinessModal open onClose={vi.fn()} />, { wrapper: wrapper() });

    const refresh = await screen.findByRole('button', { name: '다시 받기' });
    expect(refresh).toBeEnabled();
    expect(screen.getByText('전체 상품 반영 완료')).toBeInTheDocument();
    fireEvent.click(refresh);
    expect(mockHandleCollect).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'coupang_products',
        basis: expect.objectContaining({ measured: true }),
      }),
    );
  });

  it('keeps pending catalog-child progress visible when readiness is already ok', async () => {
    const response = makeCatalogReadinessResponse();
    setReadiness({
      ...response,
      checks: response.checks.map((check) =>
        check.key === 'coupang_products'
          ? {
              ...check,
              basis: {
                ...check.basis,
                asOf: '2026-09-06',
                requiredAsOf: '2026-09-06',
                observedAt: '2026-09-06T00:01:00.000Z',
                measured: true,
              },
              detail: '쿠팡 상품 기본 목록 1,254건 반영됨 — 전체 상세 수집 필요',
            }
          : check,
      ),
    });
    const owner = makeCatalogOwner({
      plan: {
        ...makeCatalogOwner().plan,
        detailsIdempotencyKey: CATALOG_DETAILS_IDEMPOTENCY_KEY,
      },
      currentAttemptId: CATALOG_CHILD_ATTEMPT_ID,
      currentStage: 'details',
      overallState: 'RUNNING',
    });
    mockCatalog.value = makeCatalogState(owner, null);

    render(<ReadinessModal open onClose={vi.fn()} />, { wrapper: wrapper() });

    expect(await screen.findByRole('button', { name: '상태 확인 중' })).toBeDisabled();
    expect(screen.getByText('기본 목록 수집 1,254 / 1,254')).toBeInTheDocument();
    expect(screen.getByText('상세 상품 받기 상태 확인 중입니다. 잠시 후 다시 확인해주세요.')).toBeInTheDocument();
  });

  it('renders a route-owned collection trigger inside the optional section', async () => {
    // The dashboard's Wing daily-traffic trigger is the app's only entrypoint
    // for that source, so the slot it now lives in is a contract, not a detail.
    const view = render(
      <ReadinessModal
        open
        onClose={vi.fn()}
        additionalCollection={<button type="button">Wing 일별 수집</button>}
      />,
      { wrapper: wrapper() },
    );

    await screen.findByText('추가 작업');
    const optional = view.container.querySelector('[data-readiness-optional-section]');
    const trigger = screen.getByRole('button', { name: 'Wing 일별 수집' });
    expect(optional).toContainElement(trigger);
  });

  it('keeps optional sync actions outside the required readiness count', async () => {
    const view = render(<ReadinessModal open onClose={vi.fn()} />, { wrapper: wrapper() });

    await screen.findByText('필수 데이터');
    expect(view.container.querySelectorAll('[data-readiness-item]')).toHaveLength(2);
    expect(screen.getByText('어제 주문 데이터 없음')).toBeInTheDocument();
    expect(view.container.querySelector('[data-readiness-optional-section]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '일별 매출 안내' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name: '일별 매출 안내' }));
    expect(screen.getByRole('button', { name: '일별 매출 안내' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('fetches fresh readiness when a controlled modal is reopened', async () => {
    const onClose = vi.fn();
    const queryClient = makeQueryClient();
    queryClient.setQueryData(['readiness'], makeReadinessResponse());
    const view = render(<ReadinessModal open={false} onClose={onClose} />, {
      wrapper: wrapper(queryClient),
    });

    expect(readinessReads()).toBe(0);
    view.rerender(<ReadinessModal open onClose={onClose} />);

    expect(await screen.findByRole('button', { name: '대시보드로 돌아가기' })).toBeInTheDocument();
    expect(readinessReads()).toBe(1);

    view.rerender(<ReadinessModal open={false} onClose={onClose} />);
    view.rerender(<ReadinessModal open onClose={onClose} />);
    await waitFor(() => expect(readinessReads()).toBe(2));
  });

  it('does not render the retired Rocket row from a cached readiness response', async () => {
    const response = makeReadinessResponse();
    setReadiness({
      ...response,
      checks: [
        {
          ...response.checks[0],
          key: 'rocket_sales',
          label: '쿠팡 로켓 매출',
        },
      ],
    });

    render(<ReadinessModal open onClose={vi.fn()} />, { wrapper: wrapper() });

    const openDashboard = await screen.findByRole('button', { name: '대시보드로 돌아가기' });
    expect(screen.queryByText('쿠팡 로켓')).not.toBeInTheDocument();
    expect(screen.queryByText('조회 전용')).not.toBeInTheDocument();
    await waitFor(() => expect(openDashboard).toBeEnabled());
  });

  it('does not revive retired collection controls from an old collectionRun URL', async () => {
    window.history.replaceState({}, '', '?collectionRun=11111111-1111-4111-8111-111111111111');
    try {
      render(<ReadinessModal open onClose={vi.fn()} />, { wrapper: wrapper() });
      expect(await screen.findByRole('button', { name: '광고 동기화' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '처음부터 재실행' })).not.toBeInTheDocument();
    } finally { window.history.replaceState({}, '', '/'); }
  });

  it('keeps one campaign sweep control: the missing ad card points to 광고 동기화', async () => {
    const response = makeReadinessResponse();
    setReadiness({
      ...response,
      checks: response.checks.map((check) =>
        check.key === 'coupang_ads'
          ? {
              ...check,
              basis: { ...check.basis, asOf: null, observedAt: null, measured: false },
              detail: '광고 데이터 없음',
              lastSyncedAt: null,
            }
          : check,
      ),
    });

    render(<ReadinessModal open onClose={vi.fn()} />, { wrapper: wrapper() });

    expect(await screen.findByText('아래 ‘광고 동기화’에서 받아요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '광고 받기' })).not.toBeInTheDocument();
    expect(await screen.findAllByRole('button', { name: '광고 동기화' })).toHaveLength(1);
  });

  it('shows 최신 only for a server-confirmed complete daily ad sweep', async () => {
    campaignSource = campaignSweepSource(true);
    const queryClient = makeQueryClient();
    const view = render(<ReadinessModal open onClose={vi.fn()} />, {
      wrapper: wrapper(queryClient),
    });

    expect(await screen.findByText('최신')).toBeInTheDocument();
    expect(view.container).toHaveTextContent('사용 중인 데이터: 2026-08-06 ~ 2026-09-05');

    campaignSource = campaignSweepSource(false);
    await act(() => queryClient.refetchQueries({ queryKey: queryKeys.ads.campaignSource() }));

    await waitFor(() => expect(screen.queryByText('최신')).not.toBeInTheDocument());
  });

  it('labels the Wing rank action as Wing sales ranking and keeps its handler', async () => {
    const response = makeReadinessResponse();
    const wingRank: ReadinessResponse['checks'][number] = {
      key: 'wing_kpi',
      label: 'Wing 판매순위',
      basis: {
        asOf: null,
        requiredAsOf: '2026-05-21',
        observedAt: null,
        sources: ['wing_rank'],
        measured: false,
        withheldCount: 0,
      },
      detail: 'Wing 판매순위 수집 이력 없음',
      lastSyncedAt: null,
      count: null,
      referenceDate: '2026-05-21',
      expectedDates: [],
      missingDates: [],
    };
    setReadiness({ ...response, checks: [...response.checks, wingRank] });

    render(<ReadinessModal open onClose={vi.fn()} />, { wrapper: wrapper() });

    expect(await screen.findByText('Wing 판매순위')).toBeInTheDocument();
    expect(screen.getByText('자사 상품 판매순위')).toBeInTheDocument();
    expect(screen.queryByText('아이템위너 순위')).not.toBeInTheDocument();
    expect(screen.queryByText('경쟁 현황')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '순위 받기' }));
    expect(mockHandleCollect).toHaveBeenCalledWith(wingRank);
  });
});
