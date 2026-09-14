import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectBrowserCollectionExtensionIds,
  detectExtensionId,
  sendToExtension,
} from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import AdvertisingProfitabilityRefresh from './AdvertisingProfitabilityRefresh';

const mockGetParsed = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiClient: { getParsed: mockGetParsed, post: mockPost },
}));
vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  detectBrowserCollectionExtensionIds: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const EXTENSION_ID = 'kiditem-extension';
const OLD_ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const NEW_ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';
const COMPLETE_ID = '33333333-3333-4333-8333-333333333333';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const START_LABEL = '상품별 광고비 보고서 수집';

function attempt(
  state: 'RUNNING' | 'COMPLETE' | 'FAILED',
  attemptId = OLD_ATTEMPT_ID,
  errorMessage: string | null = null,
  errorCode: string | null = errorMessage ? 'PROVIDER_ERROR' : null,
) {
  return {
    attemptId,
    state,
    startedAt: '2026-09-07T00:00:00.000Z',
    capturedAt: state === 'RUNNING' ? null : '2026-09-07T01:00:00.000Z',
    expiresAt: '2026-09-08T00:00:00.000Z',
    errorCode,
    errorMessage,
  };
}

function complete(sourceImportRunId = COMPLETE_ID, capturedAt = '2026-09-07T01:00:00.000Z') {
  return {
    sourceImportRunId,
    publicationSequence: '12',
    mappingGeneration: '7',
    coveredThrough: '2026-09-06',
    capturedAt,
    qualitySummary: {},
  };
}

function sourceView(overrides: {
  ready?: boolean;
  latestAttempt?: ReturnType<typeof attempt> | null;
  latestComplete?: ReturnType<typeof complete> | null;
} = {}) {
  return {
    ready: overrides.ready ?? false,
    latestAttempt: overrides.latestAttempt ?? null,
    latestComplete: overrides.latestComplete ?? null,
  };
}

let extensionReplies: Record<string, (message: Record<string, unknown>) => unknown>;

function renderControl(
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <AdvertisingProfitabilityRefresh />
      </QueryClientProvider>,
    ),
  };
}

function startMessages() {
  return vi
    .mocked(sendToExtension)
    .mock.calls.map(([, message]) => message as Record<string, unknown>)
    .filter((message) => message.action === 'startCollection');
}

beforeEach(() => {
  vi.clearAllMocks();
  extensionReplies = {
    ping: () => ({
      success: true,
      capabilities: { kiditemEnvironmentProfilesV1: true, collectionStartV1: true },
    }),
    setAuthToken: () => ({ success: true }),
  };
  vi.mocked(detectExtensionId).mockResolvedValue(EXTENSION_ID);
  vi.mocked(detectBrowserCollectionExtensionIds).mockResolvedValue([EXTENSION_ID]);
  vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) => {
    const action = (message as { action: string }).action;
    const reply = extensionReplies[action];
    if (!reply) throw new Error(`unexpected extension action ${action}`);
    return reply(message as Record<string, unknown>);
  });
  mockPost.mockImplementation(async (path: string) => {
    if (path === '/api/auth/extension-handoff') return { token: 'a'.repeat(43) };
    throw new Error(`unexpected POST ${path}`);
  });
});

describe('AdvertisingProfitabilityRefresh', () => {
  it('only reads a running import on reload and never starts it automatically', async () => {
    mockGetParsed.mockResolvedValue(sourceView({
      latestAttempt: attempt('RUNNING'),
      latestComplete: complete(),
    }));

    renderControl();

    expect(await screen.findByRole('button', { name: '수집 중단' })).toBeEnabled();
    expect(screen.getByText('브라우저에서 상품별 보고서를 수집하고 있습니다.')).toBeInTheDocument();
    expect(sendToExtension).not.toHaveBeenCalled();
  });

  it('preserves the last complete cutoff while the latest owner attempt failed', async () => {
    mockGetParsed.mockResolvedValue(sourceView({
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
    expect(screen.getByRole('button', { name: START_LABEL })).toBeEnabled();
    expect(screen.getByText('최신 수집 완료')).toBeInTheDocument();
    expect(screen.queryByText('수집 상태를 불러오지 못했습니다.')).not.toBeInTheDocument();
  });

  it('blocks collection while no status has ever been read', async () => {
    mockGetParsed.mockRejectedValue(new Error('read unavailable'));

    renderControl();

    expect(await screen.findByRole('button', { name: '상태 확인 필요' })).toBeDisabled();
    expect(screen.getByText('수집 상태를 불러오지 못했습니다.')).toBeInTheDocument();
  });

  it('starts the import through the start contract without beginning an attempt itself', async () => {
    let current = sourceView({
      ready: true,
      latestAttempt: attempt('COMPLETE'),
      latestComplete: complete(),
    });
    mockGetParsed.mockImplementation(async () => current);
    extensionReplies.startCollection = (message) => {
      current = sourceView({
        latestAttempt: attempt('RUNNING', NEW_ATTEMPT_ID),
        latestComplete: complete(),
      });
      return { success: true, outcome: 'started', producer: message.producer, attemptId: NEW_ATTEMPT_ID };
    };

    renderControl();
    fireEvent.click(await screen.findByRole('button', { name: START_LABEL }));

    expect(await screen.findByRole('button', { name: '수집 중단' })).toBeEnabled();
    expect(startMessages()).toEqual([
      {
        action: 'startCollection',
        producer: 'advertising.profitability_import',
        idempotencyKey: expect.stringMatching(UUID),
        scope: {},
      },
    ]);
    expect(mockPost.mock.calls.map(([path]) => path)).toEqual(['/api/auth/extension-handoff']);
  });

  it('stops a running import through the owner route when the extension holds no session', async () => {
    let current = sourceView({
      latestAttempt: attempt('RUNNING', NEW_ATTEMPT_ID),
      latestComplete: complete(),
    });
    mockGetParsed.mockImplementation(async () => current);
    extensionReplies.cancelCollectionSession = () => ({
      success: false,
      error: 'Collection session not found',
    });
    mockPost.mockImplementation(async (path: string) => {
      if (path !== `/api/ads/profitability-imports/${NEW_ATTEMPT_ID}/cancel`) {
        throw new Error(`unexpected POST ${path}`);
      }
      current = sourceView({
        latestAttempt: attempt('FAILED', NEW_ATTEMPT_ID, '운영자가 수집을 중단했습니다.', 'USER_CANCELLED'),
        latestComplete: complete(),
      });
      return current.latestAttempt;
    });

    renderControl();
    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByText('운영자가 수집을 중단했습니다.')).toBeInTheDocument();
    expect(screen.getByText('수집 중단됨')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: START_LABEL })).toBeEnabled();
  });

  it('refreshes ad and dashboard reads only when a new import completes', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    let current = sourceView({
      ready: true,
      latestAttempt: attempt('COMPLETE'),
      latestComplete: complete(),
    });
    mockGetParsed.mockImplementation(async () => current);

    renderControl(client);
    expect(await screen.findByText('최신 수집 완료')).toBeInTheDocument();

    // Reading the COMPLETE this page already renders is not a new import.
    await act(() => client.refetchQueries({ queryKey: queryKeys.ads.profitabilitySource() }));
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: queryKeys.ads.all });

    current = sourceView({
      ready: true,
      latestAttempt: attempt('COMPLETE', NEW_ATTEMPT_ID),
      latestComplete: complete(NEW_ATTEMPT_ID, '2026-09-07T02:00:00.000Z'),
    });
    await act(() => client.refetchQueries({ queryKey: queryKeys.ads.profitabilitySource() }));

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.ads.all });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.all });
    });
    expect(sendToExtension).not.toHaveBeenCalled();
  });
});
