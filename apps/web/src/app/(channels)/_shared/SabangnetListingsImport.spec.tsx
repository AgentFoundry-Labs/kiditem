import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import {
  detectBrowserCollectionExtensionIds,
  detectOrderCollectionExtensionRuntime,
  sendToExtension,
} from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { extensionSessionReply } from '@/test/fixtures/extension-collection-session';
import { SabangnetListingsImport } from './SabangnetListingsImport';
import { linkImportedListings } from './sabangnet-listings-collection';

/**
 * 사방넷 등록 상품 가져오기(KID-246).
 *
 *  1. 가져오기는 조직 하나에 시도 하나다. 화면이 시도를 열고 확장에 시도 ID만 넘긴다 —
 *     쓰기 토큰은 화면이 갖지 않는다.
 *  2. 받을 몰 계정이 없으면 시도를 열지 않고 이유를 말한다.
 *  3. 끝나면 가져온 몰마다 셀피아 SKU 연결(자동 매칭)을 부른다. 가져오기 완료가 매칭을 대신
 *     돌리지 않기 때문이다.
 */

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getParsed: vi.fn(), post: vi.fn() },
}));
vi.mock('@/lib/extension-bridge', () => ({
  detectBrowserCollectionExtensionIds: vi.fn(),
  detectOrderCollectionExtensionRuntime: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const KIDSNOTE = '22222222-2222-4222-8222-222222222222';
const ELEVENST = '33333333-3333-4333-8333-333333333333';
const TOKEN = '44444444-4444-4444-8444-444444444444';
const BASE = '/api/channels/sabangnet-listings';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const plan = {
  sourceType: 'sabangnet_mall_listings',
  parserVersion: 'sabangnet-mall-listings-v1',
  sourceOrigin: 'https://sbadmin08.sabangnet.co.kr',
  listPath: '/prod-api/customer/mall/MallProductUpdate/getMallProductUpdateLists',
  pageSize: 500,
  dateFrom: '20000101',
  dateTo: '20260917',
  malls: [
    { mallKey: 'kidsnote', channelAccountId: KIDSNOTE, sabangnetShopIds: ['shop0472'] },
    { mallKey: '11st', channelAccountId: ELEVENST, sabangnetShopIds: ['shop0464', 'shop0003'] },
  ],
};

function attempt(state: 'RUNNING' | 'COMPLETE' | 'FAILED', patch: Record<string, unknown> = {}) {
  return {
    attemptId: ATTEMPT_ID,
    state,
    generation: '1',
    plan,
    expiresAt: '2099-01-01T00:00:00.000Z',
    completedAt: state === 'COMPLETE' ? new Date(Date.now() - 60_000).toISOString() : null,
    errorCode: null,
    errorMessage: null,
    ...patch,
  };
}

const malls = [
  { mallKey: 'kidsnote', channelAccountId: KIDSNOTE, sabangnetShopIds: ['shop0472'] },
  { mallKey: '11st', channelAccountId: ELEVENST, sabangnetShopIds: ['shop0464', 'shop0003'] },
  { mallKey: 'ssg', channelAccountId: null, sabangnetShopIds: ['shop0100'] },
];

let source: Record<string, unknown>;

function renderImport() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <SabangnetListingsImport />
    </QueryClientProvider>,
  );
  return client;
}

function extensionMessages(action: string) {
  return vi
    .mocked(sendToExtension)
    .mock.calls.filter(([, message]) => (message as { action: string }).action === action);
}

beforeEach(() => {
  vi.clearAllMocks();
  source = { ready: true, malls, latestAttempt: null, latestComplete: null, latestPublication: [] };
  vi.mocked(detectOrderCollectionExtensionRuntime).mockResolvedValue({
    status: 'ready',
    extensionId: 'orders-extension',
    version: '1.0.97',
  });
  vi.mocked(detectBrowserCollectionExtensionIds).mockResolvedValue([]);
  vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) =>
    extensionSessionReply(message, 'orders.sabangnet_mall_listings') ?? new Promise(() => undefined));
  vi.mocked(apiClient.getParsed).mockImplementation(async (path: string) => {
    if (path !== `${BASE}/source`) throw new Error(`unexpected GET ${path}`);
    return source;
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (path !== `${BASE}/attempts`) throw new Error(`unexpected POST ${path}`);
    source = { ...source, latestAttempt: attempt('RUNNING') };
    return { ...attempt('RUNNING'), attemptToken: TOKEN };
  });
});

describe('사방넷 등록 상품 가져오기', () => {
  it('⭐ 조직의 시도 하나를 열고 확장에는 시도 ID만 넘긴다', async () => {
    renderImport();
    expect(await screen.findByText('사방넷에서 아직 가져오지 않았습니다')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: '사방넷에서 가져오기' }));

    expect(await screen.findByText('수집 중 · 몰 2곳')).toBeInTheDocument();
    expect(vi.mocked(apiClient.post).mock.calls).toEqual([[
      `${BASE}/attempts`,
      {},
      { headers: { 'Idempotency-Key': expect.stringMatching(UUID) } },
    ]]);
    expect(detectOrderCollectionExtensionRuntime).toHaveBeenCalledWith(1_200, [
      'sabangnetMallListingsSourceOwnerV1',
    ]);
    const handoffs = extensionMessages('collectSabangnetMallListings');
    expect(handoffs.map(([, message]) => message)).toEqual([
      { action: 'collectSabangnetMallListings', attemptId: ATTEMPT_ID },
    ]);
    expect(JSON.stringify(vi.mocked(sendToExtension).mock.calls)).not.toContain(TOKEN);
  });

  it('⭐ 받을 몰 계정이 없으면 시작을 막고 이유를 말한다', async () => {
    source = { ...source, ready: false, malls: malls.map((mall) => ({ ...mall, channelAccountId: null })) };
    renderImport();

    expect(await screen.findByText(/사방넷 상품을 받을 몰 계정이 없습니다/)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('서버가 몰 계정이 없다고 하면 시도 없이 거절을 보여 준다', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(
      new ApiError(404, 'Not Found', 'SABANGNET_MALL_ACCOUNTS_NOT_FOUND'),
    );
    renderImport();

    fireEvent.click(await screen.findByRole('button', { name: '사방넷에서 가져오기' }));

    expect(await screen.findByText(/사방넷 상품을 받을 몰 계정이 없습니다/)).toBeInTheDocument();
    expect(extensionMessages('collectSabangnetMallListings')).toEqual([]);
  });

  it('마지막으로 가져온 결과를 몰 수와 함께 적는다', async () => {
    source = {
      ...source,
      latestAttempt: attempt('COMPLETE'),
      latestComplete: attempt('COMPLETE'),
      latestPublication: [
        { mallKey: 'kidsnote', channelAccountId: KIDSNOTE, listings: 572, deactivated: 0 },
        { mallKey: '11st', channelAccountId: ELEVENST, listings: 0, deactivated: 3 },
      ],
    };
    renderImport();

    expect(await screen.findByText(/사방넷 기준 572개 · 몰 1곳/)).toBeInTheDocument();
  });

  it('⭐ 가져온 몰이 있으면 셀피아 상품 연결을 사람이 다시 돌릴 수 있다', async () => {
    source = {
      ...source,
      latestAttempt: attempt('COMPLETE'),
      latestComplete: attempt('COMPLETE'),
      latestPublication: [
        { mallKey: 'kidsnote', channelAccountId: KIDSNOTE, listings: 572, deactivated: 0 },
      ],
    };
    vi.mocked(apiClient.post).mockResolvedValue({
      evaluatedListings: 572,
      matchedListings: 500,
      configuredOptions: 500,
    });
    renderImport();

    fireEvent.click(await screen.findByRole('button', { name: '셀피아 상품에 연결' }));

    await waitFor(() => {
      expect(vi.mocked(apiClient.post).mock.calls).toEqual([
        ['/api/channels/product-mappings/auto-match', { channelAccountId: KIDSNOTE }],
      ]);
    });
  });

  it('가져온 몰이 없으면 연결 버튼을 세우지 않는다', async () => {
    renderImport();
    expect(await screen.findByRole('button', { name: '사방넷에서 가져오기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '셀피아 상품에 연결' })).not.toBeInTheDocument();
  });

  it('멈춘 가져오기는 실패가 아니라 중단으로 적는다', async () => {
    source = {
      ...source,
      latestAttempt: attempt('FAILED', { errorCode: 'USER_CANCELLED', errorMessage: '운영자가 수집을 중단했습니다.' }),
    };
    renderImport();

    expect(await screen.findByText('수집을 중단했습니다. 저장된 완료본은 유지됩니다.')).toBeInTheDocument();
    expect(screen.queryByText('운영자가 수집을 중단했습니다.')).not.toBeInTheDocument();
  });

  it('실패한 가져오기는 owner 가 남긴 이유를 보여 준다', async () => {
    source = {
      ...source,
      latestAttempt: attempt('FAILED', {
        errorCode: 'sabangnet_login_required',
        errorMessage: '사방넷 로그인이 필요합니다. 열린 사방넷 화면에서 로그인한 뒤 다시 가져와 주세요.',
      }),
    };
    renderImport();

    expect(await screen.findByText(/사방넷 로그인이 필요합니다/)).toBeInTheDocument();
  });
});

describe('linkImportedListings', () => {
  it('⭐ 가져온 몰 계정마다 자동 매칭을 부르고 몰 현황을 다시 읽는다', async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.mallPublishing.sabangnetListingsSource(), {
      ...source,
      latestComplete: attempt('COMPLETE'),
      latestPublication: [
        { mallKey: 'kidsnote', channelAccountId: KIDSNOTE, listings: 572, deactivated: 0 },
        { mallKey: '11st', channelAccountId: ELEVENST, listings: 0, deactivated: 2 },
      ],
    });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    vi.mocked(apiClient.post).mockResolvedValue({
      evaluatedListings: 572,
      matchedListings: 500,
      configuredOptions: 500,
    });

    await expect(linkImportedListings(client)).resolves.toEqual({
      accounts: 1,
      failedAccounts: 0,
      matchedListings: 500,
    });

    // 이번에 받은 리스팅이 없는 몰은 잇지 않는다.
    expect(vi.mocked(apiClient.post).mock.calls).toEqual([
      ['/api/channels/product-mappings/auto-match', { channelAccountId: KIDSNOTE }],
    ]);
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.mallPublishing.all });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.channelSkuMappings.all });
    });
  });

  it('한 몰의 연결이 실패해도 나머지 몰은 잇는다', async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.mallPublishing.sabangnetListingsSource(), {
      ...source,
      latestPublication: [
        { mallKey: 'kidsnote', channelAccountId: KIDSNOTE, listings: 1, deactivated: 0 },
        { mallKey: '11st', channelAccountId: ELEVENST, listings: 1, deactivated: 0 },
      ],
    });
    vi.mocked(apiClient.post)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ evaluatedListings: 1, matchedListings: 1, configuredOptions: 1 });

    await expect(linkImportedListings(client)).resolves.toEqual({
      accounts: 2,
      failedAccounts: 1,
      matchedListings: 1,
    });

    expect(vi.mocked(apiClient.post).mock.calls.map(([, body]) => body)).toEqual([
      { channelAccountId: KIDSNOTE },
      { channelAccountId: ELEVENST },
    ]);
  });
});
