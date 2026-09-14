import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import AdvertisingProfitabilityRefresh from './AdvertisingProfitabilityRefresh';

const mockGetParsed = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
const mockDetectRuntime = vi.hoisted(() => vi.fn());
const mockSend = vi.hoisted(() => vi.fn());
const mockTransferAuth = vi.hoisted(() => vi.fn());
const mockUuid = vi.hoisted(() => vi.fn(() => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
const mockToastSuccess = vi.hoisted(() => vi.fn());
const mockToastError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiClient: { getParsed: mockGetParsed, post: mockPost },
}));
vi.mock('@/lib/extension-bridge', () => ({
  detectOrderCollectionExtensionRuntime: mockDetectRuntime,
  sendToExtension: mockSend,
}));
vi.mock('@/lib/extension-auth', () => ({
  transferExtensionAuthTo: mockTransferAuth,
}));
vi.mock('@/lib/secure-random-uuid', () => ({
  createSecureRandomUuid: mockUuid,
}));
vi.mock('sonner', () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}));

const OLD_ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const NEW_ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';
const COMPLETE_ID = '33333333-3333-4333-8333-333333333333';
const LATER_ATTEMPT_ID = '44444444-4444-4444-8444-444444444444';

function attempt(
  state: 'RUNNING' | 'COMPLETE' | 'FAILED',
  attemptId = OLD_ATTEMPT_ID,
  errorMessage: string | null = null,
) {
  return {
    attemptId,
    state,
    startedAt: '2026-09-07T00:00:00.000Z',
    capturedAt: state === 'RUNNING' ? null : '2026-09-07T01:00:00.000Z',
    expiresAt: '2026-09-08T00:00:00.000Z',
    errorCode: errorMessage ? 'PROVIDER_ERROR' : null,
    errorMessage,
  };
}

function sourceView(overrides: {
  ready?: boolean;
  latestAttempt?: ReturnType<typeof attempt> | null;
  latestComplete?: object | null;
} = {}) {
  return {
    ready: overrides.ready ?? false,
    latestAttempt: overrides.latestAttempt ?? null,
    latestComplete: overrides.latestComplete ?? null,
  };
}

function complete(capturedAt = '2026-09-07T01:00:00.000Z') {
  return {
    sourceImportRunId: COMPLETE_ID,
    publicationSequence: '12',
    mappingGeneration: '7',
    coveredThrough: '2026-09-06',
    capturedAt,
    qualitySummary: {},
  };
}

function renderControl(client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})) {
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <AdvertisingProfitabilityRefresh />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDetectRuntime.mockResolvedValue({
    status: 'ready',
    extensionId: 'advertising-extension',
    version: 'test',
  });
  mockTransferAuth.mockResolvedValue(undefined);
  mockSend.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AdvertisingProfitabilityRefresh', () => {
  it('only reads a running owner on reload and never starts it automatically', async () => {
    mockGetParsed.mockResolvedValue(sourceView({
      ready: false,
      latestAttempt: attempt('RUNNING'),
      latestComplete: complete(),
    }));

    renderControl();

    expect(await screen.findByRole('button', { name: '수집 중' })).toBeDisabled();
    expect(mockDetectRuntime).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('preserves the last complete cutoff while the latest owner attempt failed', async () => {
    mockGetParsed.mockResolvedValue(sourceView({
      ready: false,
      latestAttempt: attempt('FAILED', OLD_ATTEMPT_ID, '광고센터 응답 오류'),
      latestComplete: complete(),
    }));

    renderControl();

    expect(await screen.findByText('광고센터 응답 오류')).toBeInTheDocument();
    expect(screen.getByText('2026-09-06')).toBeInTheDocument();
    expect(screen.getByText('최근 수집 실패')).toBeInTheDocument();
  });

  it('keeps acting on a retained status when a later authoritative read fails', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.ads.profitabilitySource(), sourceView({
      ready: true,
      latestAttempt: attempt('COMPLETE'),
      latestComplete: complete(),
    }));
    mockGetParsed.mockRejectedValue(new Error('read unavailable'));

    renderControl(client);

    expect(await screen.findByText('상태를 다시 확인하는 중')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상품별 광고비 보고서 수집' })).toBeEnabled();
    expect(screen.getByText('최신 수집 완료')).toBeInTheDocument();
    expect(screen.getByText('2026-09-06')).toBeInTheDocument();
    expect(screen.queryByText('수집 상태를 불러오지 못했습니다.')).not.toBeInTheDocument();
  });

  it('blocks collection while no status has ever been read', async () => {
    mockGetParsed.mockRejectedValue(new Error('read unavailable'));

    renderControl();

    expect(await screen.findByRole('button', { name: '상태 확인 필요' })).toBeDisabled();
    expect(screen.getByText('수집 상태를 불러오지 못했습니다.')).toBeInTheDocument();
  });

  it('does not treat the initial complete pointer as a fresh success, but invalidates after a later publication', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    client.setQueryData(queryKeys.ads.all, { existing: true });
    client.setQueryData(queryKeys.dashboard.all, { existing: true });
    mockGetParsed.mockResolvedValue(sourceView({
      ready: true,
      latestAttempt: attempt('COMPLETE'),
      latestComplete: complete(),
    }));

    renderControl(client);
    expect(await screen.findByText('최신 수집 완료')).toBeInTheDocument();
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();

    await act(async () => {
      client.setQueryData(queryKeys.ads.profitabilitySource(), sourceView({
        ready: false,
        latestAttempt: attempt('RUNNING', NEW_ATTEMPT_ID),
        latestComplete: complete(),
      }));
    });
    expect(await screen.findByRole('button', { name: '수집 중' })).toBeDisabled();
    await act(async () => {
      client.setQueryData(queryKeys.ads.profitabilitySource(), sourceView({
        ready: true,
        latestAttempt: attempt('COMPLETE', NEW_ATTEMPT_ID),
        latestComplete: complete('2026-09-07T02:00:00.000Z'),
      }));
    });

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.ads.all });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.all });
    });
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('does not invoke the owner when the extension capability is missing', async () => {
    mockGetParsed.mockResolvedValue(sourceView());
    mockDetectRuntime.mockResolvedValue({
      status: 'incompatible',
      extensionId: 'old-extension',
      version: 'old',
      missingCapabilities: ['profitabilityAdvertisingSourceOwnerV1'],
    });

    renderControl();
    fireEvent.click(await screen.findByRole('button', { name: '상품별 광고비 보고서 수집' }));

    await waitFor(() =>
      expect(screen.getByText('상품별 광고비 수집을 지원하는 익스텐션으로 새로고침해 주세요.')).toBeInTheDocument(),
    );
    expect(mockTransferAuth).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockGetParsed.mock.calls.every(([path]) => path === '/api/ads/profitability-imports/current')).toBe(true);
  });

  it('re-enables after a polled terminal owner state and ignores a late prior reply', async () => {
    let current = sourceView({
      ready: true,
      latestAttempt: attempt('COMPLETE'),
      latestComplete: complete(),
    });
    mockGetParsed.mockImplementation(async () => current);
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    mockSend
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderControl(client);
    expect(await screen.findByText('최신 수집 완료')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '상품별 광고비 보고서 수집' }));
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    await act(async () => {
      current = sourceView({
        ready: false,
        latestAttempt: attempt('RUNNING', NEW_ATTEMPT_ID),
        latestComplete: complete(),
      });
      client.setQueryData(queryKeys.ads.profitabilitySource(), current);
    });
    expect(await screen.findByRole('button', { name: '수집 중' })).toBeDisabled();
    await act(async () => {
      current = sourceView({
        ready: true,
        latestAttempt: attempt('COMPLETE', NEW_ATTEMPT_ID),
        latestComplete: complete('2026-09-07T02:00:00.000Z'),
      });
      client.setQueryData(queryKeys.ads.profitabilitySource(), current);
    });
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: '상품별 광고비 보고서 수집' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '상품별 광고비 보고서 수집' }));
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(2));
    resolveFirst({ success: true });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '수집 시작 중' })).toBeDisabled(),
    );

    await act(async () => {
      current = sourceView({
        ready: true,
        latestAttempt: attempt('COMPLETE', LATER_ATTEMPT_ID),
        latestComplete: complete('2026-09-07T03:00:00.000Z'),
      });
      client.setQueryData(queryKeys.ads.profitabilitySource(), current);
    });
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: '상품별 광고비 보고서 수집' })).toBeEnabled();
    resolveSecond({ success: true });
  });

  it('reuses one idempotency key after a lost acknowledgement and refreshes consumers only after owner success', async () => {
    let current = sourceView({
      ready: true,
      latestAttempt: attempt('COMPLETE'),
      latestComplete: complete(),
    });
    mockGetParsed.mockImplementation(async () => current);
    mockSend
      .mockRejectedValueOnce(new Error('browser reply lost'))
      .mockImplementationOnce(async () => {
        current = sourceView({
          ready: true,
          latestAttempt: attempt('COMPLETE', NEW_ATTEMPT_ID),
          latestComplete: complete('2026-09-07T02:00:00.000Z'),
        });
        return { success: true };
      });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.ads.all, { existing: true });
    client.setQueryData(queryKeys.dashboard.all, { existing: true });
    renderControl(client);
    expect(await screen.findByText('최신 수집 완료')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: '상품별 광고비 보고서 수집' }));
    await waitFor(() =>
      expect(screen.getByText(/브라우저 응답을 확인하지 못했습니다/)).toBeInTheDocument(),
    );
    expect(screen.getByText('최신 수집 완료')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '상품별 광고비 보고서 수집' }));
    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('상품별 광고비 보고서 수집이 완료되었습니다.'),
    );

    const actionCalls = mockSend.mock.calls.filter(
      ([, message]) => (message as { action?: string }).action === 'collectAdvertisingProfitability',
    );
    expect(actionCalls).toHaveLength(2);
    expect((actionCalls[0]?.[1] as { idempotencyKey: string }).idempotencyKey)
      .toBe((actionCalls[1]?.[1] as { idempotencyKey: string }).idempotencyKey);
    expect(mockPost).not.toHaveBeenCalled();
    expect(client.getQueryState(queryKeys.ads.all)?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.dashboard.all)?.isInvalidated).toBe(true);
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
