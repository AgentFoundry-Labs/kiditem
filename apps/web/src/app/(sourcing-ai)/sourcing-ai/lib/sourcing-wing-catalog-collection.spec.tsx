import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { apiClient } from '@/lib/api-client';
import {
  detectBrowserCollectionExtensionIds,
  detectExtensionId,
  sendToExtension,
} from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { useWingCatalogSource } from '../hooks/use-wing-catalog-source';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getNullable: vi.fn(), post: vi.fn() },
}));
vi.mock('@/lib/extension-bridge', () => ({
  detectBrowserCollectionExtensionIds: vi.fn(),
  detectExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

const CURRENT_PATH = '/api/sourcing/workspace/wing-catalog/current';
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const PREVIOUS_ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INPUT = { keywords: ['연필', '지우개'], maxPages: 1, purpose: 'market_analysis' as const };

type State = 'RUNNING' | 'COMPLETE' | 'FAILED';

function attempt(state: State, attemptId = ATTEMPT_ID, patch: Record<string, unknown> = {}) {
  return {
    attemptId,
    sourceKey: 'coupang.wing_catalog',
    scopeKey: 'default',
    targetKey: 'catalog',
    generation: 1,
    state,
    expiresAt: '2099-01-01T00:00:00.000Z',
    plan: { source: 'coupang.wing_catalog', ...INPUT },
    planChecksum: 'a'.repeat(64),
    contentChecksum: null,
    acceptedCount: 0,
    errorCode: null,
    errorMessage: null,
    completedAt: null,
    ...patch,
  };
}

let current: unknown;

function WingControl({ label }: { label: string }) {
  const wing = useWingCatalogSource({ input: INPUT });
  return (
    <section aria-label={label}>
      <CollectionStartControl
        control={wing.control}
        startLabel="시장분석 시작"
        onStart={wing.start}
        onStop={wing.control.stop}
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
  current = null;
  vi.mocked(detectExtensionId).mockResolvedValue('kiditem-extension');
  vi.mocked(detectBrowserCollectionExtensionIds).mockResolvedValue([]);
  vi.mocked(apiClient.getNullable).mockImplementation(async (path: string) => {
    if (path === CURRENT_PATH) return current;
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) => {
    const { action } = message as { action: string };
    if (action !== 'collectSourcingWingCatalog') throw new Error(`unexpected extension action ${action}`);
    current = attempt('RUNNING');
    // The extension opens the attempt and answers only when the collection ends.
    return new Promise(() => undefined);
  });
});

describe('sourcing Wing catalog collection control', () => {
  it('sends one start to the extension and shows the collection running on every screen with its stop', async () => {
    renderControls(
      <>
        <WingControl label="시장분석" />
        <WingControl label="추천 검증" />
      </>,
    );

    fireEvent.click(
      await within(screen.getByRole('region', { name: '시장분석' })).findByRole('button', { name: '시장분석 시작' }),
    );

    await waitFor(() => expect(screen.getAllByText('수집 중 · 시장분석 · 연필 외 1개')).toHaveLength(2));
    expect(screen.getAllByRole('button', { name: '수집 중단' })).toHaveLength(2);
    expect(vi.mocked(sendToExtension).mock.calls).toEqual([[
      'kiditem-extension',
      { action: 'collectSourcingWingCatalog', ...INPUT, idempotencyKey: expect.stringMatching(UUID) },
      null,
    ]]);
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('refreshes sourcing reads after the collection completes without refreshing recommendations or validation', async () => {
    current = attempt('COMPLETE', PREVIOUS_ATTEMPT_ID);
    vi.mocked(sendToExtension).mockImplementation(async () => {
      current = attempt('COMPLETE');
      return { success: true, attemptId: ATTEMPT_ID, state: 'COMPLETE', errorCode: null, errorMessage: null };
    });
    const { client } = renderControls(<WingControl label="시장분석" />);
    const recommendationsKey = queryKeys.sourcing.workspace.recommendations('org-1', 'today');
    client.setQueryData(recommendationsKey, { data: null });

    fireEvent.click(await screen.findByRole('button', { name: '시장분석 시작' }));

    await waitFor(() => expect(client.getQueryState(recommendationsKey)?.isInvalidated).toBe(true));
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('stops a running collection through the owner route when no extension holds its session', async () => {
    current = attempt('RUNNING');
    const cancelPath = `/api/sourcing/workspace/wing-catalog/attempts/${ATTEMPT_ID}/cancel`;
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path !== cancelPath) throw new Error(`unexpected POST ${path}`);
      current = attempt('FAILED', ATTEMPT_ID, {
        errorCode: 'USER_CANCELLED',
        errorMessage: '운영자가 수집을 중단했습니다.',
      });
      return current;
    });
    renderControls(<WingControl label="시장분석" />);

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByRole('button', { name: '시장분석 시작' })).toBeEnabled();
    expect(apiClient.post).toHaveBeenCalledWith(cancelPath);
  });

  it("reads the extension's already-running answer as a running collection, not a failure", async () => {
    vi.mocked(sendToExtension).mockResolvedValue({ success: false, error: 'SOURCE_ATTEMPT_ALREADY_RUNNING' });
    renderControls(<WingControl label="시장분석" />);

    fireEvent.click(await screen.findByRole('button', { name: '시장분석 시작' }));

    expect(await screen.findByText('이미 진행 중인 수집이 있습니다.')).toBeInTheDocument();
  });

  it('asks to connect the extension before sending a start', async () => {
    vi.mocked(detectExtensionId).mockResolvedValue(null);
    renderControls(<WingControl label="시장분석" />);

    fireEvent.click(await screen.findByRole('button', { name: '시장분석 시작' }));

    expect(await screen.findByText('KidItem OS 익스텐션을 연결한 뒤 다시 시도해주세요.')).toBeInTheDocument();
    expect(sendToExtension).not.toHaveBeenCalled();
  });
});
