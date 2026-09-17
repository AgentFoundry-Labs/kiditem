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
import { MallAdminListingsImport } from './MallAdminListingsImport';
import { linkMallAdminListings } from './mall-admin-listings-collection';

/**
 * 몰 관리자 직접 가져오기(KID-246 2단계).
 *
 *  1. 몰마다 시도 하나다. 화면이 시도를 열고 확장에 시도 ID만 넘긴다 — 쓰기 토큰은 갖지 않는다.
 *  2. 한 몰의 상태 · 결과는 그 몰의 슬라이스에서만 읽는다.
 *  3. 끝나면 그 몰 계정의 셀피아 SKU 연결(자동 매칭)을 부른다.
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

const KIDKIDS_ATTEMPT = '11111111-1111-4111-8111-111111111111';
const KIDKIDS_ACCOUNT = '22222222-2222-4222-8222-222222222222';
const TOKEN = '44444444-4444-4444-8444-444444444444';
const BASE = '/api/channels/mall-admin-listings';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const kidkidsPlan = {
  sourceType: 'mall_admin_listings',
  parserVersion: 'mall-admin-listings-v1',
  mallKey: 'kidkids',
  channelAccountId: KIDKIDS_ACCOUNT,
  sourceOrigin: 'https://partner.kidkids.net',
  pageSize: 20000,
};

function attempt(state: 'RUNNING' | 'COMPLETE' | 'FAILED', patch: Record<string, unknown> = {}) {
  return {
    attemptId: KIDKIDS_ATTEMPT,
    state,
    generation: '1',
    plan: kidkidsPlan,
    expiresAt: '2099-01-01T00:00:00.000Z',
    completedAt: state === 'COMPLETE' ? new Date(Date.now() - 60_000).toISOString() : null,
    errorCode: null,
    errorMessage: null,
    ...patch,
  };
}

function mall(patch: Record<string, unknown> = {}) {
  return {
    mallKey: 'kidkids',
    mallName: '키드키즈',
    channelAccountId: KIDKIDS_ACCOUNT,
    latestAttempt: null,
    latestComplete: null,
    latestPublication: null,
    ...patch,
  };
}

let source: { malls: Array<Record<string, unknown>> };

function renderImport() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MallAdminListingsImport mallKey="kidkids" />
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
  source = {
    malls: [
      mall(),
      mall({ mallKey: 'icecream-mall', mallName: '아이스크림몰', channelAccountId: null }),
    ],
  };
  vi.mocked(detectOrderCollectionExtensionRuntime).mockResolvedValue({
    status: 'ready',
    extensionId: 'orders-extension',
    version: '1.0.98',
  });
  vi.mocked(detectBrowserCollectionExtensionIds).mockResolvedValue([]);
  vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) =>
    extensionSessionReply(message, 'orders.mall_admin_listings') ?? new Promise(() => undefined));
  vi.mocked(apiClient.getParsed).mockImplementation(async (path: string) => {
    if (path !== `${BASE}/source`) throw new Error(`unexpected GET ${path}`);
    return source;
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string, body: unknown) => {
    if (path !== `${BASE}/attempts`) throw new Error(`unexpected POST ${path}`);
    expect(body).toEqual({ mallKey: 'kidkids' });
    source = { malls: [mall({ latestAttempt: attempt('RUNNING') }), source.malls[1]] };
    return { ...attempt('RUNNING'), attemptToken: TOKEN };
  });
});

describe('몰 관리자 직접 가져오기', () => {
  it('⭐ 몰 하나의 시도를 열고 확장에는 시도 ID만 넘긴다', async () => {
    renderImport();
    expect(await screen.findByText('키드키즈에서 아직 가져오지 않았습니다')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: '키드키즈에서 가져오기' }));

    expect(await screen.findByText('수집 중')).toBeInTheDocument();
    expect(vi.mocked(apiClient.post).mock.calls).toEqual([[
      `${BASE}/attempts`,
      { mallKey: 'kidkids' },
      { headers: { 'Idempotency-Key': expect.stringMatching(UUID) } },
    ]]);
    expect(detectOrderCollectionExtensionRuntime).toHaveBeenCalledWith(1_200, [
      'mallAdminListingsSourceOwnerV1',
    ]);
    const handoffs = extensionMessages('collectMallAdminListings');
    expect(handoffs.map(([, message]) => message)).toEqual([
      { action: 'collectMallAdminListings', attemptId: KIDKIDS_ATTEMPT },
    ]);
    expect(JSON.stringify(vi.mocked(sendToExtension).mock.calls)).not.toContain(TOKEN);
  });

  it('⭐ 그 몰의 계정이 없으면 시작을 막고 이유를 말한다', async () => {
    source = { malls: [mall({ channelAccountId: null }), source.malls[1]] };
    renderImport();

    expect(await screen.findByText(/이 몰의 계정이 없습니다/)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('서버가 계정이 없다고 하면 시도 없이 거절을 보여 준다', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(
      new ApiError(404, 'Not Found', 'MALL_ADMIN_ACCOUNT_NOT_FOUND'),
    );
    renderImport();

    fireEvent.click(await screen.findByRole('button', { name: '키드키즈에서 가져오기' }));

    expect(await screen.findByText(/이 몰의 계정이 없습니다/)).toBeInTheDocument();
    expect(extensionMessages('collectMallAdminListings')).toEqual([]);
  });

  it('마지막으로 가져온 결과를 몰 이름과 함께 적는다', async () => {
    source = {
      malls: [
        mall({
          latestAttempt: attempt('COMPLETE'),
          latestComplete: attempt('COMPLETE'),
          latestPublication: { listings: 3478, deactivated: 0, missingNames: 1484, statuses: { 판매중: 555 } },
        }),
        source.malls[1],
      ],
    };
    renderImport();

    expect(await screen.findByText(/키드키즈 3,478개/)).toBeInTheDocument();
  });

  it('⭐ 가져온 리스팅이 있으면 셀피아 상품 연결을 사람이 다시 돌릴 수 있다', async () => {
    source = {
      malls: [
        mall({
          latestAttempt: attempt('COMPLETE'),
          latestComplete: attempt('COMPLETE'),
          latestPublication: { listings: 3478, deactivated: 0, missingNames: 1484, statuses: { 판매중: 555 } },
        }),
        source.malls[1],
      ],
    };
    vi.mocked(apiClient.post).mockResolvedValue({
      evaluatedListings: 3478,
      matchedListings: 1994,
      configuredOptions: 1994,
    });
    renderImport();

    fireEvent.click(await screen.findByRole('button', { name: '셀피아 상품에 연결' }));

    await waitFor(() => {
      expect(vi.mocked(apiClient.post).mock.calls).toEqual([
        ['/api/channels/product-mappings/auto-match', { channelAccountId: KIDKIDS_ACCOUNT }],
      ]);
    });
  });

  it('멈춘 가져오기는 실패가 아니라 중단으로 적는다', async () => {
    source = {
      malls: [
        mall({ latestAttempt: attempt('FAILED', { errorCode: 'USER_CANCELLED', errorMessage: '운영자가 수집을 중단했습니다.' }) }),
        source.malls[1],
      ],
    };
    renderImport();

    expect(await screen.findByText('수집을 중단했습니다. 저장된 완료본은 유지됩니다.')).toBeInTheDocument();
  });

  it('실패한 가져오기는 owner 가 남긴 이유를 보여 준다', async () => {
    source = {
      malls: [
        mall({ latestAttempt: attempt('FAILED', {
          errorCode: 'mall_login_required',
          errorMessage: '키드키즈 로그인이 필요합니다. 열린 키드키즈 화면에서 로그인한 뒤 다시 가져와 주세요.',
        }) }),
        source.malls[1],
      ],
    };
    renderImport();

    expect(await screen.findByText(/키드키즈 로그인이 필요합니다/)).toBeInTheDocument();
  });
});

describe('linkMallAdminListings', () => {
  it('⭐ 그 몰 계정의 자동 매칭을 부르고 몰 현황을 다시 읽는다', async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.mallPublishing.mallAdminListingsSource(), {
      malls: [
        mall({ latestPublication: { listings: 3478, deactivated: 0, missingNames: 1484, statuses: {} } }),
      ],
    });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    vi.mocked(apiClient.post).mockResolvedValue({
      evaluatedListings: 3478,
      matchedListings: 1994,
      configuredOptions: 1994,
    });

    await expect(linkMallAdminListings(client, 'kidkids')).resolves.toEqual({
      matchedListings: 1994,
      failed: false,
    });
    expect(vi.mocked(apiClient.post).mock.calls).toEqual([
      ['/api/channels/product-mappings/auto-match', { channelAccountId: KIDKIDS_ACCOUNT }],
    ]);
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.mallPublishing.all });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.channelSkuMappings.all });
    });
  });

  it('가져온 리스팅이 없으면 매칭을 부르지 않는다', async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.mallPublishing.mallAdminListingsSource(), {
      malls: [mall({ latestPublication: { listings: 0, deactivated: 1, missingNames: 0, statuses: {} } })],
    });

    await expect(linkMallAdminListings(client, 'kidkids')).resolves.toEqual({
      matchedListings: 0,
      failed: false,
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
