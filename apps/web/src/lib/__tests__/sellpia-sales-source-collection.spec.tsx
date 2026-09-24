import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import {
  detectBrowserCollectionExtensionIds,
  detectOrderCollectionExtensionId,
  sendToExtension,
} from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import {
  sellpiaSalesCollection,
  sellpiaSalesReadinessRange,
} from '@/lib/sellpia-sales-source-collection';
import { extensionSessionReply } from '@/test/fixtures/extension-collection-session';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getParsed: vi.fn(), post: vi.fn() },
}));
vi.mock('@/lib/extension-bridge', () => ({
  detectBrowserCollectionExtensionIds: vi.fn(),
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));

const SOURCE_PATH = '/api/sellpia-sales/source';
const BEGIN_PATH = '/api/sellpia-sales/attempts';
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const NEXT_ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const RANGE = { from: '2026-07-12', to: '2026-07-15' };
const BUSINESS_DATES = ['2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AttemptState = 'RUNNING' | 'COMPLETE' | 'FAILED';

const plan = {
  sourceType: 'sellpia_sales_daily',
  parserVersion: 'sellpia-sales-v1',
  sourceOrigin: 'https://kiditem.sellpia.com',
  sourcePath: '/sale_summary.html?mode=main_link',
  sourceAccountKey: 'kiditem',
  range: RANGE,
  businessDates: BUSINESS_DATES,
};

function latestAttempt(state: AttemptState, attemptId = ATTEMPT_ID, patch: Record<string, unknown> = {}) {
  return {
    attemptId,
    state,
    plan,
    expiresAt: '2099-01-01T00:00:00.000Z',
    errorCode: null,
    errorMessage: null,
    ...patch,
  };
}

function latestComplete(attemptId = ATTEMPT_ID) {
  return {
    attemptId,
    plan,
    completedAt: '2026-07-15T01:00:00.000Z',
    actualCutoffAt: '2026-07-15T00:00:00.000Z',
    businessDates: BUSINESS_DATES,
    rowCount: 4,
    sellerCount: 2,
  };
}

function beginReply() {
  return {
    attemptId: ATTEMPT_ID,
    sourceType: 'sellpia_sales_daily',
    state: 'RUNNING',
    expiresAt: '2099-01-01T00:00:00.000Z',
    plan,
    actualCutoffAt: null,
    completedAt: null,
    contentChecksum: null,
    contentByteCount: null,
    rowCount: 0,
    sellerCount: 0,
    businessDates: BUSINESS_DATES,
    errorCode: null,
    errorMessage: null,
  };
}

let source: Record<string, unknown>;

function SalesControl({ label, range }: { label: string; range?: { from: string; to: string } }) {
  const control = useCollectionSourceControl(sellpiaSalesCollection);
  return (
    <section aria-label={label}>
      <CollectionStartControl
        control={control}
        startLabel="매출 받기"
        onStart={() => control.start(range)}
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
  source = { latestAttempt: null, latestComplete: null };
  vi.mocked(detectOrderCollectionExtensionId).mockResolvedValue('sellpia-extension');
  vi.mocked(detectBrowserCollectionExtensionIds).mockResolvedValue([]);
  // The extension answers only when the collection ends; the session shows it took the attempt.
  vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) =>
    extensionSessionReply(message) ?? new Promise(() => undefined));
  vi.mocked(apiClient.getParsed).mockImplementation(async (path: string) => {
    if (path !== SOURCE_PATH) throw new Error(`unexpected GET ${path}`);
    return source;
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (path !== BEGIN_PATH) throw new Error(`unexpected POST ${path}`);
    source = { latestAttempt: latestAttempt('RUNNING'), latestComplete: null };
    return beginReply();
  });
});

describe('Sellpia sales collection control', () => {
  it('begins the requested range, sends only the attempt id and shows it running on every copy', async () => {
    renderControls(
      <>
        <SalesControl label="준비 상태" range={RANGE} />
        <SalesControl label="매출 분석" />
      </>,
    );
    const readiness = within(screen.getByRole('region', { name: '준비 상태' }));

    fireEvent.click(await readiness.findByRole('button', { name: '매출 받기' }));

    expect(await readiness.findByText('수집 중 · 2026-07-12 ~ 2026-07-15')).toBeInTheDocument();
    expect(
      await within(screen.getByRole('region', { name: '매출 분석' })).findByText('수집 중 · 2026-07-12 ~ 2026-07-15'),
    ).toBeInTheDocument();
    expect(vi.mocked(apiClient.post).mock.calls).toEqual([[
      BEGIN_PATH,
      { range: RANGE },
      { headers: { 'Idempotency-Key': expect.stringMatching(UUID) } },
    ]]);
    expect(
      vi.mocked(sendToExtension).mock.calls.filter(([, message]) =>
        (message as { action: string }).action === 'collectSellpiaSaleSummary'),
    ).toEqual([
      ['sellpia-extension', { action: 'collectSellpiaSaleSummary', attemptId: ATTEMPT_ID }, 190_000],
    ]);
  });

  it('stops the attempt it opened and gives the reason when the extension does not take it', async () => {
    const cancelPath = `${BEGIN_PATH}/${ATTEMPT_ID}/cancel`;
    vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) =>
      (message as { action: string }).action === 'collectSellpiaSaleSummary'
        ? { success: false, error: '이전 셀피아 판매 현황 수집이 아직 진행 중입니다. 그 수집이 끝난 뒤 다시 시작해 주세요.' }
        : null);
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path === BEGIN_PATH) return beginReply();
      if (path === cancelPath) return {};
      throw new Error(`unexpected POST ${path}`);
    });
    renderControls(<SalesControl label="매출 분석" />);

    fireEvent.click(await screen.findByRole('button', { name: '매출 받기' }));

    expect(
      await screen.findByText('이전 셀피아 판매 현황 수집이 아직 진행 중입니다. 그 수집이 끝난 뒤 다시 시작해 주세요.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '매출 받기' })).toBeEnabled();
    expect(apiClient.post).toHaveBeenCalledWith(cancelPath);
  });

  it("begins the owner's default window when the screen names no range", async () => {
    renderControls(<SalesControl label="매출 분석" />);

    fireEvent.click(await screen.findByRole('button', { name: '매출 받기' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      BEGIN_PATH,
      {},
      { headers: { 'Idempotency-Key': expect.stringMatching(UUID) } },
    ));
  });

  it('joins the collection the owner already runs instead of opening another', async () => {
    vi.mocked(apiClient.post).mockImplementation(async () => {
      source = { latestAttempt: latestAttempt('RUNNING'), latestComplete: null };
      throw new ApiError(409, 'ATTEMPT_IN_PROGRESS', 'Conflict', {

        attemptId: ATTEMPT_ID,
      });
    });
    renderControls(<SalesControl label="매출 분석" />);

    fireEvent.click(await screen.findByRole('button', { name: '매출 받기' }));

    expect(await screen.findByRole('button', { name: '수집 중단' })).toBeEnabled();
    expect(sendToExtension).not.toHaveBeenCalled();
  });

  it('stops through the owner route when no extension holds the session', async () => {
    source = { latestAttempt: latestAttempt('RUNNING'), latestComplete: null };
    const cancelPath = `${BEGIN_PATH}/${ATTEMPT_ID}/cancel`;
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path !== cancelPath) throw new Error(`unexpected POST ${path}`);
      source = {
        latestAttempt: latestAttempt('FAILED', ATTEMPT_ID, {
          errorCode: 'USER_CANCELLED',
          errorMessage: '운영자가 수집을 중단했습니다.',
        }),
        latestComplete: null,
      };
      return {};
    });
    renderControls(<SalesControl label="매출 분석" />);

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByRole('button', { name: '매출 받기' })).toBeEnabled();
    expect(apiClient.post).toHaveBeenCalledWith(cancelPath);
  });

  it('opens no attempt while the Sellpia sales extension is missing', async () => {
    vi.mocked(detectOrderCollectionExtensionId).mockResolvedValue(null);
    renderControls(<SalesControl label="매출 분석" />);

    fireEvent.click(await screen.findByRole('button', { name: '매출 받기' }));

    expect(await screen.findByText(/판매현황 수집 기능이 필요합니다/)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('refreshes the sales, readiness and daily traffic reads only after a new complete collection', async () => {
    source = { latestAttempt: latestAttempt('COMPLETE'), latestComplete: latestComplete() };
    const { client } = renderControls(<SalesControl label="매출 분석" />);
    const salesKey = queryKeys.dashboard.sellpiaSales('2026-07-01', '2026-07-15');
    const readinessKey = ['readiness'];
    const trafficKey = ['traffic', 'monthly', 2026, 7];
    for (const key of [salesKey, readinessKey, trafficKey]) client.setQueryData(key, {});
    expect(await screen.findByRole('button', { name: '매출 받기' })).toBeEnabled();

    await act(() => client.refetchQueries({ queryKey: queryKeys.dashboard.sellpiaSalesSource() }));
    expect(client.getQueryState(salesKey)?.isInvalidated).toBe(false);

    source = {
      latestAttempt: latestAttempt('COMPLETE', NEXT_ATTEMPT_ID),
      latestComplete: latestComplete(NEXT_ATTEMPT_ID),
    };
    await act(() => client.refetchQueries({ queryKey: queryKeys.dashboard.sellpiaSalesSource() }));

    await waitFor(() => expect(client.getQueryState(salesKey)?.isInvalidated).toBe(true));
    expect(client.getQueryState(readinessKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(trafficKey)?.isInvalidated).toBe(true);
  });
});

describe('sellpiaSalesReadinessRange', () => {
  it('collects only the missing span through the day after the readiness reference', () => {
    expect(sellpiaSalesReadinessRange({
      referenceDate: '2026-07-14',
      expectedDates: ['2026-07-12', '2026-07-13', '2026-07-14'],
      missingDates: ['2026-07-14', '2026-07-12'],
    })).toEqual({ from: '2026-07-12', to: '2026-07-15' });
  });

  it('does not expand a first-of-month repair into the entire prior month', () => {
    expect(sellpiaSalesReadinessRange({
      referenceDate: '2026-06-30',
      expectedDates: ['2026-06-17', '2026-06-30', '2026-07-01'],
      missingDates: ['2026-07-01'],
    })).toEqual({ from: '2026-07-01', to: '2026-07-01' });
  });

  it("leaves the range to the owner when readiness names no date", () => {
    expect(sellpiaSalesReadinessRange({ referenceDate: null, expectedDates: [], missingDates: [] }))
      .toBeUndefined();
  });
});
