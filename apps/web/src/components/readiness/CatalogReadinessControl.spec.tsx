import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  detectBrowserCollectionExtensionIds,
  detectExtensionId,
  sendToExtension,
} from '@/lib/extension-bridge';
import { ActionCheckCard } from './ReadinessRows';
import type { ReadinessCheck } from '@kiditem/shared/readiness';
import type {
  CoupangCatalogCollectionRun,
  CoupangCatalogSourceStatus,
} from '@kiditem/shared/coupang-catalog-snapshot';
import type { CatalogReadinessState } from './useReadinessCollection';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { organizationId: 'org-1' } }) }));
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getNullable: vi.fn(), getParsed: vi.fn(), post: vi.fn() },
}));
vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  detectBrowserCollectionExtensionIds: vi.fn(),
  detectOrderCollectionExtensionId: vi.fn(),
  detectOrderCollectionExtensionRuntime: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

const EXTENSION_ID = 'kiditem-extension';
const ACCOUNT_ID = '71111111-1111-4111-8111-111111111111';
const ROOT_ID = '7a111111-1111-4111-8111-111111111111';
const CHILD_ID = '7a222222-2222-4222-8222-222222222222';
const DETAILS_KEY = '7d000000-0000-4000-8000-000000000001';
const CATALOG_PATH = `/api/channels/accounts/${ACCOUNT_ID}/catalog-imports/coupang-wing`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RATE_LIMITED = {
  code: 'WING_PROVIDER_RATE_LIMITED',
  message: '쿠팡 Wing 요청 한도에 도달했습니다.',
  phase: 'hydration' as const,
  recoverable: true,
};

const productsCheck = {
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
} as unknown as ReadinessCheck;

type RunOverrides = Partial<Omit<CoupangCatalogCollectionRun, 'plan' | 'progress'>> & {
  plan?: Partial<CoupangCatalogCollectionRun['plan']>;
  progress?: Partial<CoupangCatalogCollectionRun['progress']>;
};

// The import's root attempt, as the Channels owner's source read returns it.
function rootRun({ plan, progress, ...overrides }: RunOverrides = {}): CoupangCatalogCollectionRun {
  return {
    attemptId: ROOT_ID,
    idempotencyKey: '7e000000-0000-4000-8000-000000000001',
    channelAccountId: ACCOUNT_ID,
    state: 'RUNNING',
    expiresAt: '2099-01-01T00:00:00.000Z',
    plan: {
      collectorVersion: 'wing-inventory-v1',
      stage: 'basics',
      listUrl: 'https://wing.coupang.com/list',
      detailUrl: 'https://wing.coupang.com/detail',
      channelAccountId: ACCOUNT_ID,
      vendorId: 'A001',
      publicationRevision: '0',
      rootAttemptId: ROOT_ID,
      detailsIdempotencyKey: DETAILS_KEY,
      ...plan,
    },
    phase: 'discovery',
    collectorVersion: 'wing-inventory-v1',
    manifest: null,
    progress: {
      discoveryPagesStored: 0,
      discoveredProducts: 0,
      hydratedProducts: 0,
      optionCount: 0,
      mediaCount: 0,
      storedChunks: 0,
      publishedProducts: 0,
      publishedOptionCount: 0,
      publishedMediaCount: 0,
      publishedChunks: 0,
      firstPublishedAt: null,
      lastPublishedAt: null,
      ...progress,
    },
    missing: { discoverySequences: [], productIds: [] },
    snapshotHash: null,
    error: null,
    publication: null,
    createdAt: '2026-09-14T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
    finishedAt: null,
    rootAttemptId: ROOT_ID,
    currentAttemptId: ROOT_ID,
    currentStage: 'basics',
    overallState: 'RUNNING',
    ...overrides,
  };
}

// A completed basics root whose details child runs the rest of the import.
function detailsImport(child: RunOverrides = {}): CoupangCatalogSourceStatus {
  const { plan, progress, ...overrides } = child;
  const detailsAttempt = rootRun({
    attemptId: CHILD_ID,
    idempotencyKey: DETAILS_KEY,
    plan: {
      stage: 'details',
      basicAttemptId: ROOT_ID,
      detailsIdempotencyKey: undefined,
      ...plan,
    },
    phase: 'hydration',
    currentAttemptId: CHILD_ID,
    currentStage: 'details',
    progress,
    ...overrides,
  });
  return {
    latestAttempt: rootRun({
      state: 'COMPLETE',
      phase: 'finished',
      currentAttemptId: CHILD_ID,
      currentStage: 'details',
      overallState: detailsAttempt.state,
    }),
    detailsAttempt,
  };
}

function catalogState(overrides: Partial<CatalogReadinessState> = {}): CatalogReadinessState {
  return {
    accounts: [{ id: ACCOUNT_ID, channel: 'coupang', name: '키드아이템 스토어', isPrimary: true }],
    accountsLoading: false,
    accountsError: null,
    accountId: ACCOUNT_ID,
    accountLocked: false,
    setAccountId: vi.fn(),
    linkError: null,
    ...overrides,
  };
}

let serverStatus: CoupangCatalogSourceStatus;
let extensionReplies: Record<string, (message: Record<string, unknown>) => unknown>;

function renderCard(catalog = catalogState(), onCollect = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ActionCheckCard check={productsCheck} onCollect={onCollect} pending={false} catalog={catalog} />
    </QueryClientProvider>,
  );
  return { onCollect };
}

function sentExtensionMessages(action: string) {
  return vi
    .mocked(sendToExtension)
    .mock.calls.map(([, message]) => message as Record<string, unknown>)
    .filter((message) => message.action === action);
}

beforeEach(() => {
  vi.clearAllMocks();
  serverStatus = { latestAttempt: null, detailsAttempt: null };
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
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path === `${CATALOG_PATH}/source`) return serverStatus;
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (path === '/api/auth/extension-handoff') return { token: 'a'.repeat(43) };
    throw new Error(`unexpected POST ${path}`);
  });
});

describe('readiness 상품 받기 control', () => {
  it('starts the selected account import through the start contract and shows it running for that account', async () => {
    extensionReplies.startCollection = (message) => {
      serverStatus = { latestAttempt: rootRun(), detailsAttempt: null };
      return { success: true, outcome: 'started', producer: message.producer, attemptId: ROOT_ID };
    };
    const { onCollect } = renderCard();

    fireEvent.click(await screen.findByRole('button', { name: '상품 받기' }));

    expect(await screen.findByText('수집 중 · 키드아이템 스토어')).toBeInTheDocument();
    expect(sentExtensionMessages('startCollection')).toEqual([{
      action: 'startCollection',
      producer: 'channels.coupang_catalog',
      idempotencyKey: expect.stringMatching(UUID),
      scope: { channelAccountId: ACCOUNT_ID },
    }]);
    expect(screen.getByRole('button', { name: '수집 중단' })).toBeEnabled();
    // The extension opens the attempt; the page never begins one itself.
    expect(vi.mocked(apiClient.post).mock.calls.map(([path]) => path)).toEqual(['/api/auth/extension-handoff']);
    expect(onCollect).not.toHaveBeenCalled();
  });

  it('shows the refusal naming the other account import that holds this browser and keeps 상품 받기 available', async () => {
    const message =
      '다른스토어 계정의 쿠팡 상품 수집이 이 브라우저에서 진행 중입니다. 한 브라우저에서는 쿠팡 계정 하나씩만 상품을 받을 수 있습니다. 끝난 뒤 다시 시작해 주세요.';
    extensionReplies.startCollection = (request) => ({
      success: true,
      outcome: 'refused',
      producer: request.producer,
      holder: { producer: 'channels.coupang_catalog', name: '다른스토어 계정의 쿠팡 상품 수집', attemptId: CHILD_ID },
      message,
    });
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: '상품 받기' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상품 받기' })).toBeEnabled();
  });

  it('stops the running import from any browser: the extension session first, then the owner stop by the root attempt', async () => {
    serverStatus = detailsImport({ progress: { discoveredProducts: 10, hydratedProducts: 3 } });
    extensionReplies.cancelCollectionSession = () => ({ success: false, error: 'Collection session not found' });
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path === `${CATALOG_PATH}/attempts/${ROOT_ID}/cancel`) {
        serverStatus = detailsImport({
          state: 'FAILED',
          error: { code: 'USER_CANCELLED', message: '운영자가 수집을 중단했습니다.', phase: 'hydration', recoverable: false },
        });
        return serverStatus.latestAttempt;
      }
      throw new Error(`unexpected POST ${path}`);
    });
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByText('수집을 중단했습니다. 저장된 상품은 유지됩니다.')).toBeInTheDocument();
    const extensionStop = vi
      .mocked(sendToExtension)
      .mock.calls.findIndex(([, message]) => (message as { action: string }).action === 'cancelCollectionSession');
    expect(extensionStop).toBeGreaterThanOrEqual(0);
    expect(sentExtensionMessages('cancelCollectionSession')).toEqual([
      { action: 'cancelCollectionSession', attemptId: ROOT_ID },
    ]);
    expect(vi.mocked(sendToExtension).mock.invocationCallOrder[extensionStop]).toBeLessThan(
      vi.mocked(apiClient.post).mock.invocationCallOrder[0],
    );
    expect(screen.getByRole('button', { name: '다시 받기' })).toBeEnabled();
  });

  it('offers 이어서 받기 once a Wing rate-limit wait passed and resumes the import through the start contract', async () => {
    serverStatus = detailsImport({ error: { ...RATE_LIMITED, notBefore: '2020-01-01T00:00:00.000Z' } });
    extensionReplies.startCollection = (message) => {
      serverStatus = detailsImport();
      return { success: true, outcome: 'started', producer: message.producer, attemptId: ROOT_ID };
    };
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: '이어서 받기' }));

    expect(await screen.findByText('수집 중 · 키드아이템 스토어')).toBeInTheDocument();
    expect(sentExtensionMessages('startCollection')).toEqual([expect.objectContaining({
      producer: 'channels.coupang_catalog',
      scope: { channelAccountId: ACCOUNT_ID },
    })]);
  });

  it('keeps a Wing rate-limit wait running until its not-before time and shows when it can resume', async () => {
    serverStatus = detailsImport({ error: { ...RATE_LIMITED, notBefore: '2099-01-01T00:00:00.000Z' } });
    renderCard();

    expect(await screen.findByText('수집 중 · 키드아이템 스토어')).toBeInTheDocument();
    expect(screen.getByText('Wing 요청 한도 대기 중')).toBeInTheDocument();
    expect(screen.getByText(/재개 가능 시각/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '이어서 받기' })).not.toBeInTheDocument();
  });

  it('shows the details progress while the import runs and the whole import completion afterwards', async () => {
    serverStatus = detailsImport({ progress: { discoveredProducts: 10, hydratedProducts: 3 } });
    const view = renderCard();

    expect(await screen.findByText('상세 수집 3 / 10')).toBeInTheDocument();
    expect(screen.getByText('전체 상세 수집 중')).toBeInTheDocument();
    expect(view.onCollect).not.toHaveBeenCalled();
  });

  it('labels a completed whole import and offers 다시 받기', async () => {
    serverStatus = detailsImport({
      state: 'COMPLETE',
      phase: 'finished',
      publication: { sourceImportRunId: CHILD_ID, duplicate: false, changes: {} },
    });
    renderCard();

    expect(await screen.findByText('전체 상품 반영 완료')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 받기' })).toBeEnabled();
  });

  it('asks for a Coupang account before 상품 받기 can start', async () => {
    renderCard(catalogState({ accountId: null }));

    expect(await screen.findByRole('button', { name: '상품 받기' })).toBeDisabled();
    expect(screen.getByText('쿠팡 계정을 선택해 주세요.')).toBeInTheDocument();
    await waitFor(() => expect(apiClient.get).not.toHaveBeenCalled());
  });
});
