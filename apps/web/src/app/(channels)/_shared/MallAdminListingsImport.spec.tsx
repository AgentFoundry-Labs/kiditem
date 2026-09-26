import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { detectOrderCollectionExtensionRuntime, sendToExtension } from '@/lib/extension-bridge';
import { requestOperationStart } from '@/lib/operation-start';
import { queryKeys } from '@/lib/query-keys';
import { MallAdminListingsImport } from './MallAdminListingsImport';
import { linkMallAdminListings } from './mall-admin-listings-collection';

/**
 * 몰 관리자 직접 가져오기(KID-246 2단계 → KID-363·381 실행 kind).
 *
 *  1. 몰마다 `channels.mall_admin_listings` 실행 하나다. 화면은 확장에 계정 행과 몰 키로 실행을 시작시킨다.
 *  2. 한 몰의 상태 · 결과는 그 몰의 슬라이스(최근 실행 · 최근 성공 실행)에서만 읽는다.
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
vi.mock('@/lib/operation-start', () => ({ requestOperationStart: vi.fn(), requestOperationCancel: vi.fn() }));

const KIDKIDS_ACCOUNT = '22222222-2222-4222-8222-222222222222';
const BASE = '/api/channels/mall-admin-listings';

function mall(patch: Record<string, unknown> = {}) {
  return {
    mallKey: 'onch',
    mallName: '온채널',
    channelAccountId: KIDKIDS_ACCOUNT,
    latestPublication: null,
    latestOperation: null,
    latestSucceeded: null,
    ...patch,
  };
}

let source: { malls: Array<Record<string, unknown>> };

function renderImport(layout: 'bar' | 'row' = 'bar', mallKey: 'onch' | 'kidkids' = 'onch') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MallAdminListingsImport mallKey={mallKey} layout={layout} />
    </QueryClientProvider>,
  );
  return client;
}

const OPERATION_ID = '55555555-5555-4555-8555-555555555555';

function operation(status: 'executing' | 'succeeded' | 'failed' | 'cancelled', patch: Record<string, unknown> = {}) {
  return {
    id: OPERATION_ID,
    kind: 'channels.mall_admin_listings',
    status,
    lockKeys: status === 'executing' ? [`account:${KIDKIDS_ACCOUNT}`] : [],
    plan: { mallKey: 'onch', channelAccountId: KIDKIDS_ACCOUNT },
    progress: null,
    result: null,
    window: null,
    errorCode: null,
    errorMessage: null,
    startedAt: new Date(Date.now() - 120_000).toISOString(),
    finishedAt: status === 'executing' ? null : new Date(Date.now() - 60_000).toISOString(),
    expiresAt: '2099-01-01T00:00:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...patch,
  };
}

const PUBLICATION = { listings: 3478, deactivated: 0, missingNames: 1484, codedListings: 0, statuses: { 판매중: 555 } };

beforeEach(() => {
  vi.clearAllMocks();
  source = {
    malls: [
      mall(),
      mall({ mallKey: 'icecream-mall', mallName: '아이스크림몰', channelAccountId: null }),
    ],
  };
  vi.mocked(apiClient.getParsed).mockImplementation(async (path: string) => {
    if (path !== `${BASE}/source`) throw new Error(`unexpected GET ${path}`);
    return source;
  });
});

/**
 * 1차 넷 뒤에 옮긴 몰(온채널, KID-381)도 `channels.mall_admin_listings` 실행 하나다 — 옛 시도(`POST attempts`)와 확장
 * `collectMallAdminListings` 넘김은 없다. 모든 몰이 같은 길이다.
 */
describe('몰 관리자 직접 가져오기 — 옮긴 몰(온채널)', () => {
  it('⭐ 확장에 그 몰 계정 행과 몰 키로 실행을 시작시키고, 옛 시도를 열거나 확장에 시도를 넘기지 않는다', async () => {
    vi.mocked(requestOperationStart).mockImplementation(async () => {
      source = { malls: [mall({ latestOperation: operation('executing') }), source.malls[1]!] };
      return { outcome: 'started', operationId: OPERATION_ID };
    });
    renderImport();
    expect(await screen.findByText('온채널에서 아직 가져오지 않았습니다')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: '온채널에서 가져오기' }));

    expect(await screen.findByText('수집 중')).toBeInTheDocument();
    expect(requestOperationStart).toHaveBeenCalledWith(
      'channels.mall_admin_listings',
      { channelAccountId: KIDKIDS_ACCOUNT, mallKey: 'onch' },
      { capability: 'channelsOperationKindsV1' },
    );
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(detectOrderCollectionExtensionRuntime).not.toHaveBeenCalled();
    expect(sendToExtension).not.toHaveBeenCalled();
  });

  it('⭐ 그 몰의 계정이 없으면 시작을 막고 이유를 말한다', async () => {
    source = { malls: [mall({ channelAccountId: null }), source.malls[1]!] };
    renderImport();

    expect(await screen.findByText(/이 몰의 계정이 없습니다/)).toBeInTheDocument();
    expect(requestOperationStart).not.toHaveBeenCalled();
  });

  it('마지막 성공 실행의 발행 결과를 몰 이름과 함께 적는다', async () => {
    source = { malls: [mall({ latestOperation: operation('succeeded'), latestSucceeded: operation('succeeded'), latestPublication: PUBLICATION })] };
    renderImport();

    expect(await screen.findByText(/온채널 3,478개/)).toBeInTheDocument();
  });

  it('⭐ 가져온 리스팅이 있으면 셀피아 상품 연결을 사람이 다시 돌릴 수 있다', async () => {
    source = { malls: [mall({ latestOperation: operation('succeeded'), latestSucceeded: operation('succeeded'), latestPublication: PUBLICATION })] };
    vi.mocked(apiClient.post).mockResolvedValue({ evaluatedListings: 3478, matchedListings: 1994, configuredOptions: 1994 });
    renderImport();

    fireEvent.click(await screen.findByRole('button', { name: '셀피아 상품에 연결' }));

    await waitFor(() => {
      expect(vi.mocked(apiClient.post).mock.calls).toEqual([
        ['/api/channels/product-mappings/auto-match', { channelAccountId: KIDKIDS_ACCOUNT }],
      ]);
    });
  });

  it('⭐ 쇼핑몰 현황의 몰 줄에서는 작게 서지만 같은 시작 · 연결이다 — 버튼 이름도 같다', async () => {
    source = { malls: [mall({ latestOperation: operation('succeeded'), latestSucceeded: operation('succeeded'), latestPublication: PUBLICATION })] };
    renderImport('row');

    expect(await screen.findByText(/^3,478개 · /)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '온채널에서 가져오기' })).toHaveTextContent('가져오기');
    expect(screen.getByRole('button', { name: '셀피아 상품에 연결' })).toBeInTheDocument();
  });

  it('취소한 실행은 실패가 아니라 중단이다', async () => {
    source = { malls: [mall({ latestOperation: operation('cancelled', { errorCode: 'USER_CANCELLED' }) })] };
    renderImport();
    expect(await screen.findByText('수집을 중단했습니다. 저장된 완료본은 유지됩니다.')).toBeInTheDocument();
  });

  it('로그인 때문에 실패한 실행은 그 이유를 보여 준다', async () => {
    source = { malls: [mall({ latestOperation: operation('failed', {
      errorCode: 'SITE_LOGIN_REQUIRED',
      errorMessage: '온채널 로그인이 필요합니다. 열린 온채널 화면에서 로그인한 뒤 다시 가져와 주세요.',
    }) })] };
    renderImport();

    expect(await screen.findByText(/온채널 로그인이 필요합니다/)).toBeInTheDocument();
  });
});

const kidkids = (patch: Record<string, unknown> = {}) => mall({ mallKey: 'kidkids', mallName: '키드키즈', ...patch });

/** 1차 몰 넷(키드키즈 · 아이스크림몰 · 아트공구 · 도매꾹)은 `channels.mall_admin_listings` 실행 하나다(KID-363). */
describe('몰 관리자 직접 가져오기 — 실행 kind(1차 몰)', () => {
  it('⭐ 확장에 그 몰 계정 행과 몰 키로 실행을 시작시키고, 진행은 그 몰의 최근 실행으로 본다', async () => {
    source = { malls: [kidkids()] };
    vi.mocked(requestOperationStart).mockImplementation(async () => {
      source = { malls: [kidkids({ latestOperation: operation('executing') })] };
      return { outcome: 'started', operationId: OPERATION_ID };
    });
    renderImport('bar', 'kidkids');

    fireEvent.click(await screen.findByRole('button', { name: '키드키즈에서 가져오기' }));

    expect(await screen.findByText('수집 중')).toBeInTheDocument();
    expect(requestOperationStart).toHaveBeenCalledWith(
      'channels.mall_admin_listings',
      { channelAccountId: KIDKIDS_ACCOUNT, mallKey: 'kidkids' },
      { capability: 'channelsOperationKindsV1' },
    );
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(detectOrderCollectionExtensionRuntime).not.toHaveBeenCalled();
  });

  it('마지막 성공 실행의 발행 결과를 적고, 실패·중단은 최근 실행에서 읽는다', async () => {
    source = { malls: [kidkids({
      latestOperation: operation('succeeded'),
      latestSucceeded: operation('succeeded'),
      latestPublication: { listings: 3478, deactivated: 0, missingNames: 1484, codedListings: 0, statuses: { 판매중: 555 } },
    })] };
    renderImport('bar', 'kidkids');
    expect(await screen.findByText(/키드키즈 3,478개/)).toBeInTheDocument();
  });

  it('로그인 때문에 실패한 실행은 그 이유를, 취소한 실행은 중단으로 적는다', async () => {
    source = { malls: [kidkids({ latestOperation: operation('failed', {
      errorCode: 'SITE_LOGIN_REQUIRED',
      errorMessage: '키드키즈 로그인이 필요합니다. 열린 키드키즈 화면에서 로그인한 뒤 다시 가져와 주세요.',
    }) })] };
    renderImport('bar', 'kidkids');
    expect(await screen.findByText(/키드키즈 로그인이 필요합니다/)).toBeInTheDocument();
  });

  it('취소한 실행은 실패가 아니라 중단이다', async () => {
    source = { malls: [kidkids({ latestOperation: operation('cancelled', { errorCode: 'USER_CANCELLED' }) })] };
    renderImport('bar', 'kidkids');
    expect(await screen.findByText('수집을 중단했습니다. 저장된 완료본은 유지됩니다.')).toBeInTheDocument();
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

    await expect(linkMallAdminListings(client, 'onch')).resolves.toEqual({
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

    await expect(linkMallAdminListings(client, 'onch')).resolves.toEqual({
      matchedListings: 0,
      failed: false,
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
