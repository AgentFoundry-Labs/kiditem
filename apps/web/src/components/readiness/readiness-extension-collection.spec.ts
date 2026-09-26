import { createElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { useReadinessCollection } from './useReadinessCollection';
import type { ReadinessCheck } from '@kiditem/shared/readiness';

const PRIMARY_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const SECOND_ACCOUNT_ID = '00000000-0000-4000-8000-000000000007';
const UNKNOWN_ACCOUNT_ID = '00000000-0000-4000-8000-000000000008';
const LINKED_ATTEMPT_ID = '00000000-0000-4000-8000-000000000002';

const mocks = vi.hoisted(() => ({
  detectExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
  requestOperationStart: vi.fn(),
}));

vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: mocks.detectExtensionId,
  sendToExtension: mocks.sendToExtension,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ status: 'ready', user: { organizationId: 'org-1' } }),
}));

vi.mock('@/lib/operation-start', () => ({
  requestOperationStart: mocks.requestOperationStart,
  requestOperationCancel: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

function check(key: string): ReadinessCheck {
  return {
    key,
    label: key,
    detail: 'missing',
    lastSyncedAt: null,
    count: null,
    referenceDate: '2026-07-14',
    expectedDates: ['2026-07-14'],
    missingDates: ['2026-07-14'],
  } as unknown as ReadinessCheck;
}

function requestedApiPaths(): string[] {
  return [
    ...vi.mocked(apiClient.get).mock.calls,
    ...vi.mocked(apiClient.post).mock.calls,
  ].map(([path]) => String(path));
}

function wrapper(
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  }),
) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('readiness extension collection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
    vi.mocked(apiClient.get).mockImplementation(async (path) => {
      if (path === '/api/channels/accounts') {
        return [
          { id: SECOND_ACCOUNT_ID, channel: 'coupang', name: '보조 스토어', isPrimary: false },
          { id: PRIMARY_ACCOUNT_ID, channel: 'coupang', name: '키드아이템 스토어', isPrimary: true },
          { id: '00000000-0000-4000-8000-000000000009', channel: 'naver', name: '네이버 스토어', isPrimary: true },
        ];
      }
      throw new Error(`unexpected GET ${String(path)}`);
    });
  });

  it("leaves Sellpia sales to the card's shared control and starts no collection from the readiness hook", async () => {
    const { result } = renderHook(() => useReadinessCollection({}), { wrapper: wrapper() });

    await act(async () => {
      await result.current.handleCollect(check('wing_sales'));
    });

    expect(requestedApiPaths().filter((path) => path.startsWith('/api/sellpia-sales'))).toEqual([]);
    expect(mocks.sendToExtension).not.toHaveBeenCalled();
  });

  it("leaves Wing rank to the card's shared control and starts no operation from the readiness hook", async () => {
    const { result } = renderHook(() => useReadinessCollection({}), { wrapper: wrapper() });

    await act(async () => {
      await result.current.handleCollect(check('wing_rank'));
    });

    expect(requestedApiPaths().filter((path) => path.startsWith('/api/operations'))).toEqual([]);
    expect(mocks.requestOperationStart).not.toHaveBeenCalled();
  });

  it('leaves 상품 받기 to the shared control: the readiness hook opens no catalog attempt and talks to no extension', async () => {
    const { result } = renderHook(
      () => useReadinessCollection({ catalogEnabled: true }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.catalog.accountId).toBe(PRIMARY_ACCOUNT_ID));
    await act(async () => {
      await result.current.handleCollect(check('coupang_products'));
    });

    expect(result.current.catalog.accounts.map((account) => account.id)).toEqual([
      SECOND_ACCOUNT_ID,
      PRIMARY_ACCOUNT_ID,
    ]);
    expect(requestedApiPaths()).toEqual(['/api/channels/accounts']);
    expect(mocks.sendToExtension).not.toHaveBeenCalled();
  });

  it('selects and locks the linked account for a URL handoff without starting anything', async () => {
    const { result } = renderHook(
      () => useReadinessCollection({
        catalogEnabled: true,
        catalogLink: { attemptId: LINKED_ATTEMPT_ID, channelAccountId: SECOND_ACCOUNT_ID, stage: 'basics' },
      }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.catalog.accountsLoading).toBe(false));
    expect(result.current.catalog).toMatchObject({
      accountId: SECOND_ACCOUNT_ID,
      accountLocked: true,
      linkError: null,
    });
    expect(requestedApiPaths()).toEqual(['/api/channels/accounts']);
    expect(mocks.sendToExtension).not.toHaveBeenCalled();
  });

  it('blocks a malformed or unknown URL handoff with a Korean reason instead of starting an import', async () => {
    const malformed = renderHook(
      () => useReadinessCollection({ catalogEnabled: true, catalogLink: { invalid: true } }),
      { wrapper: wrapper() },
    );
    expect(malformed.result.current.catalog.linkError).toBe(
      '상품 받기 링크가 올바르지 않습니다. 링크를 확인한 뒤 다시 시도해주세요.',
    );

    const unknown = renderHook(
      () => useReadinessCollection({
        catalogEnabled: true,
        catalogLink: { attemptId: LINKED_ATTEMPT_ID, channelAccountId: UNKNOWN_ACCOUNT_ID, stage: 'basics' },
      }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(unknown.result.current.catalog.linkError).toBe(
      '연결된 쿠팡 계정을 찾을 수 없습니다. 링크의 계정 권한을 확인해주세요.',
    ));
    expect(mocks.sendToExtension).not.toHaveBeenCalled();
  });

  it('keeps automatic readiness and dashboard traffic sources free of focus fallbacks', () => {
    const readinessSource = readFileSync(
      resolve(process.cwd(), 'src/components/readiness/useReadinessCollection.ts'),
      'utf8',
    );
    const dashboardSource = readFileSync(
      resolve(process.cwd(), 'src/app/(analytics)/dashboard/page.tsx'),
      'utf8',
    );
    // The dashboard starts Wing traffic collection through the shared
    // collection control, composed in the hook the readiness modal's collection
    // component uses. The page renders that component; it does not start the
    // source itself.
    const wingCollectionSource = readFileSync(
      resolve(process.cwd(), 'src/app/(analytics)/dashboard/hooks/use-wing-traffic-collection.ts'),
      'utf8',
    );
    const competitorPageSource = readFileSync(
      resolve(
        process.cwd(),
        'src/app/(sourcing-ai)/sourcing-ai/competitor-analysis/components/CompetitorTrackingPage.tsx',
      ),
      'utf8',
    );

    expect(readinessSource).not.toContain('fallbackOpenTabs');
    expect(readinessSource).not.toContain('runReadinessExtensionCollection');
    expect(readinessSource).not.toContain('BrowserCollectionRunControls');
    expect(readinessSource).not.toContain('issueBrowserCollectionRunId');
    expect(dashboardSource).not.toContain('window.open');
    expect(wingCollectionSource).toContain('useCollectionSourceControl(wingTrafficCollection)');
    expect(wingCollectionSource).not.toContain('fallbackOpenTabs');
    // 경쟁사 수집은 실행 kind(KID-362)라 공용 컨트롤이 시작한다.
    expect(competitorPageSource).toContain('useCollectionSourceControl(competitorCatalogCollection)');
    expect(competitorPageSource).not.toContain('collectCompetitorCatalogFromExtension');
    expect(competitorPageSource).not.toContain('beginCompetitorCatalogAttempt');
    expect(competitorPageSource).not.toContain('useSourcingOperationAction');
    expect(competitorPageSource).not.toContain('SourcingOperationRunPanel');
    expect(competitorPageSource).not.toContain('operationRun');
    expect(competitorPageSource).not.toContain('useBrowserCollectionSession');
    expect(competitorPageSource).not.toContain('BrowserCollectionRunControls');
  });
});
