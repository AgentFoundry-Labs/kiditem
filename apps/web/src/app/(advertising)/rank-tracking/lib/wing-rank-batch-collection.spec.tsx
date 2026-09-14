import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { transferExtensionAuthTo } from '@/lib/extension-auth';
import { queryKeys } from '@/lib/query-keys';
import {
  cancelWingRankBatch,
  detectRankExtensionGate,
  runWingSalesRankCheck,
} from './rank-extension';
import { wingRankBatchCollection } from './wing-rank-batch-collection';
import type { WingRankBatch, WingRankCurrentBatch } from '@kiditem/shared/advertising';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getNullable: vi.fn(), post: vi.fn() },
}));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));
vi.mock('@/lib/browser-collection-session', () => ({
  // No extension session carries the batch key, so a stop reaches the batch cancel.
  sendBrowserCollectionControl: vi.fn(async () => {
    throw new Error('no extension session');
  }),
}));
vi.mock('./rank-extension', () => ({
  detectRankExtensionGate: vi.fn(),
  rankExtensionGateMessage: (gate: { status: string }) =>
    gate.status === 'outdated'
      ? 'KIDITEM 쿠팡 확장프로그램이 예전 버전입니다.'
      : '브라우저 수집 익스텐션을 찾을 수 없습니다.',
  runWingSalesRankCheck: vi.fn(),
  cancelWingRankBatch: vi.fn(),
}));

const EXTENSION_ID = 'coupang-extension';
const BATCH_PATH = '/api/ads/keyword-rank/wing/batch-attempts';
const CURRENT_PATH = `${BATCH_PATH}/current`;
const CANCEL_PATH = `${BATCH_PATH}/cancel`;
const IDS = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const KEYWORDS = ['연필', '색연필'];
const KEY = '33333333-3333-4333-8333-333333333333';
const NEXT_KEY = '44444444-4444-4444-8444-444444444444';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type State = 'RUNNING' | 'COMPLETE' | 'FAILED';

function batch(states: State[]): WingRankBatch {
  return {
    attempts: states.map((state, index) => ({
      attemptId: IDS[index]!,
      keyword: KEYWORDS[index]!,
      generation: '1',
      state,
      expiresAt: '2026-09-10T00:00:00.000Z',
      actualCutoffAt: state === 'COMPLETE' ? '2026-09-06T00:00:00.000Z' : null,
      itemCount: state === 'COMPLETE' ? 20 : 0,
      errorCode: state === 'FAILED' ? 'WING_RANK_PROVIDER_WALL' : null,
      errorMessage: state === 'FAILED' ? 'Wing 로그인이 필요합니다.' : null,
      plan: {
        sourceType: 'coupang_wing_rank',
        parserVersion: 'wing-rank-v1',
        keyword: KEYWORDS[index]!,
        maxPages: 5,
        targets: [{
          vendorItemId: `V${index}`,
          productName: KEYWORDS[index]!,
          category: null,
          keyword: KEYWORDS[index]!,
          candidateIndex: 0,
        }],
      },
    })),
    selection: {
      productCount: states.length,
      candidateCount: states.length,
      keywordCount: states.length,
      targetKeywordCount: states.length,
      resumed: false,
      pendingProductCount: states.length,
      targets: states.map((_, index) => ({
        keyword: KEYWORDS[index]!,
        vendorItemIds: [`V${index}`],
        productCount: 1,
        primaryProductCount: 1,
        pendingProductCount: 1,
        pendingPrimaryProductCount: 1,
        phase: 'primary' as const,
        maxPages: 5,
      })),
    },
  };
}

function current(batchKey: string, states: State[]): WingRankCurrentBatch {
  return { batchKey, ...batch(states) };
}

function idempotencyKey(options: unknown): string {
  return (options as { headers: Record<string, string> }).headers['Idempotency-Key']!;
}

let owner: WingRankCurrentBatch | null;
const events: string[] = [];

function WingRankControl({ label }: { label: string }) {
  const control = useCollectionSourceControl(wingRankBatchCollection);
  return (
    <section aria-label={label}>
      <CollectionStartControl
        control={control}
        startLabel="순위 받기"
        onStart={() => control.start()}
        onStop={control.stop}
      />
    </section>
  );
}

function renderControls(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

beforeEach(() => {
  vi.clearAllMocks();
  events.length = 0;
  owner = null;
  vi.mocked(detectRankExtensionGate).mockResolvedValue({
    status: 'ready',
    extensionId: EXTENSION_ID,
    version: '1.2.102',
  });
  vi.mocked(transferExtensionAuthTo).mockImplementation(async () => {
    events.push('auth');
  });
  vi.mocked(runWingSalesRankCheck).mockImplementation(async (_extensionId, key) => {
    events.push(`dispatch ${key}`);
    return { success: true, started: true };
  });
  vi.mocked(cancelWingRankBatch).mockResolvedValue(undefined);
  vi.mocked(apiClient.getNullable).mockImplementation(async (path: string) => {
    if (path !== CURRENT_PATH) throw new Error(`unexpected GET ${path}`);
    return owner;
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string, _body?: unknown, options?: unknown) => {
    if (path !== BATCH_PATH) throw new Error(`unexpected POST ${path}`);
    events.push('begin');
    owner = current(idempotencyKey(options), ['RUNNING', 'RUNNING']);
    return batch(['RUNNING', 'RUNNING']);
  });
});

describe('Wing rank batch collection control', () => {
  it('hands off auth, admits one batch under a new key and dispatches it; every copy shows its progress', async () => {
    renderControls(
      <>
        <WingRankControl label="준비 상태" />
        <WingRankControl label="순위 추적" />
      </>,
    );
    const readiness = within(screen.getByRole('region', { name: '준비 상태' }));

    fireEvent.click(await readiness.findByRole('button', { name: '순위 받기' }));

    expect(await readiness.findByText('수집 중 · 0/2개 키워드')).toBeInTheDocument();
    expect(
      await within(screen.getByRole('region', { name: '순위 추적' })).findByText('수집 중 · 0/2개 키워드'),
    ).toBeInTheDocument();
    const [[, body, options]] = vi.mocked(apiClient.post).mock.calls;
    const key = idempotencyKey(options);
    expect(body).toEqual({});
    expect(key).toMatch(UUID);
    expect(events).toEqual(['auth', 'begin', `dispatch ${key}`]);
    expect(runWingSalesRankCheck).toHaveBeenCalledWith(EXTENSION_ID, key);
  });

  it('refuses an empty admission without dispatching', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(batch([]));
    renderControls(<WingRankControl label="순위 추적" />);

    fireEvent.click(await screen.findByRole('button', { name: '순위 받기' }));

    expect(await screen.findByText('순위를 확인할 자사 상품이 없습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '순위 받기' })).toBeEnabled();
    expect(runWingSalesRankCheck).not.toHaveBeenCalled();
  });

  it('names an outdated extension in Korean and admits no batch', async () => {
    vi.mocked(detectRankExtensionGate).mockResolvedValue({
      status: 'outdated',
      extensionId: EXTENSION_ID,
      version: '1.2.38',
    });
    renderControls(<WingRankControl label="순위 추적" />);

    fireEvent.click(await screen.findByRole('button', { name: '순위 받기' }));

    expect(await screen.findByText('KIDITEM 쿠팡 확장프로그램이 예전 버전입니다.')).toBeInTheDocument();
    expect(transferExtensionAuthTo).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('joins the batch the owner already runs instead of admitting another', async () => {
    vi.mocked(apiClient.post).mockImplementation(async () => {
      owner = current(KEY, ['COMPLETE', 'RUNNING']);
      throw new ApiError(409, 'Conflict', 'Conflict', {
        code: 'ATTEMPT_IN_PROGRESS',
        attemptId: IDS[1],
      });
    });
    renderControls(<WingRankControl label="순위 추적" />);

    fireEvent.click(await screen.findByRole('button', { name: '순위 받기' }));

    expect(await screen.findByText('수집 중 · 1/2개 키워드')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수집 중단' })).toBeEnabled();
    expect(runWingSalesRankCheck).not.toHaveBeenCalled();
  });

  it('stops the whole batch by its key through the extension and the owner route', async () => {
    owner = current(KEY, ['COMPLETE', 'RUNNING']);
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path !== CANCEL_PATH) throw new Error(`unexpected POST ${path}`);
      owner = current(KEY, ['COMPLETE', 'FAILED']);
      return batch(['COMPLETE', 'FAILED']);
    });
    renderControls(<WingRankControl label="순위 추적" />);

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByRole('button', { name: '순위 받기' })).toBeEnabled();
    expect(cancelWingRankBatch).toHaveBeenCalledWith(EXTENSION_ID, KEY);
    expect(apiClient.post).toHaveBeenCalledWith(CANCEL_PATH, undefined, {
      headers: { 'Idempotency-Key': KEY },
    });
  });

  it('stops the admitted batch by its key and gives the reason when the extension does not take it', async () => {
    vi.mocked(runWingSalesRankCheck).mockRejectedValue(new Error('Wing 판매순위 요청 전달 실패'));
    vi.mocked(apiClient.post).mockImplementation(async (path: string, _body?: unknown, options?: unknown) => {
      if (path === BATCH_PATH) {
        owner = current(idempotencyKey(options), ['RUNNING', 'RUNNING']);
        return batch(['RUNNING', 'RUNNING']);
      }
      if (path === CANCEL_PATH) {
        owner = current(idempotencyKey(options), ['FAILED', 'FAILED']);
        return batch(['FAILED', 'FAILED']);
      }
      throw new Error(`unexpected POST ${path}`);
    });
    renderControls(<WingRankControl label="순위 추적" />);

    fireEvent.click(await screen.findByRole('button', { name: '순위 받기' }));

    expect(await screen.findByText('Wing 판매순위 요청 전달 실패')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '순위 받기' })).toBeEnabled();
    const [[, , beginOptions], [cancelPath, , cancelOptions]] = vi.mocked(apiClient.post).mock.calls;
    expect(cancelPath).toBe(CANCEL_PATH);
    expect(idempotencyKey(cancelOptions)).toBe(idempotencyKey(beginOptions));
  });

  it('refreshes rank, dashboard, traffic and readiness reads only after a newly finished batch', async () => {
    owner = current(KEY, ['COMPLETE', 'FAILED']);
    const { client } = renderControls(<WingRankControl label="순위 추적" />);
    const readKeys = [
      [...queryKeys.ads.keywordRank(), 'products', 7],
      queryKeys.dashboard.trend('month'),
      ['traffic', 'monthly', 2026, 9],
      ['readiness'],
    ];
    for (const key of readKeys) client.setQueryData(key, {});
    expect(await screen.findByRole('button', { name: '순위 받기' })).toBeEnabled();

    await act(() => client.refetchQueries({ queryKey: queryKeys.ads.wingRankCurrentBatch() }));
    expect(client.getQueryState(readKeys[0]!)?.isInvalidated).toBe(false);

    owner = current(NEXT_KEY, ['COMPLETE', 'COMPLETE']);
    await act(() => client.refetchQueries({ queryKey: queryKeys.ads.wingRankCurrentBatch() }));

    await waitFor(() => expect(client.getQueryState(readKeys[0]!)?.isInvalidated).toBe(true));
    for (const key of readKeys.slice(1)) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });
});
