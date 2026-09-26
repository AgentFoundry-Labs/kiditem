import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { requestOperationStart } from '@/lib/operation-start';
import { queryKeys } from '@/lib/query-keys';
import { SabangnetListingsImport } from './SabangnetListingsImport';
import { linkImportedListings } from './sabangnet-listings-collection';

/**
 * 사방넷 등록 상품 가져오기(KID-246) = `channels.sabangnet_mall_listings` 실행 하나(KID-363).
 *
 *  1. 화면은 실행을 열지 않는다 — 확장에 kind만 시작시키고(`operation.start`), 진행은 source 읽기의 최근 실행으로 본다.
 *  2. 받을 몰 계정이 없으면 시작을 막고 이유를 말한다.
 *  3. 끝나면 가져온 몰마다 셀피아 SKU 연결(자동 매칭)을 부른다. 가져오기 완료가 매칭을 대신
 *     돌리지 않기 때문이다.
 */

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getParsed: vi.fn(), post: vi.fn() },
}));
vi.mock('@/lib/operation-start', () => ({ requestOperationStart: vi.fn(), requestOperationCancel: vi.fn() }));

const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const KIDSNOTE = '22222222-2222-4222-8222-222222222222';
const ELEVENST = '33333333-3333-4333-8333-333333333333';
const BASE = '/api/channels/sabangnet-listings';

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

function operation(status: 'executing' | 'succeeded' | 'failed' | 'cancelled', patch: Record<string, unknown> = {}) {
  return {
    id: OPERATION_ID,
    kind: 'channels.sabangnet_mall_listings',
    status,
    lockKeys: status === 'executing' ? ['resource:sabangnet:login'] : [],
    plan,
    progress: null,
    result: null,
    window: null,
    errorCode: null,
    errorMessage: null,
    startedAt: new Date(Date.now() - 120_000).toISOString(),
    finishedAt: status === 'executing' ? null : new Date(Date.now() - 60_000).toISOString(),
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

beforeEach(() => {
  vi.clearAllMocks();
  source = { ready: true, malls, latestOperation: null, latestSucceeded: null, latestPublication: [] };
  vi.mocked(apiClient.getParsed).mockImplementation(async (path: string) => {
    if (path !== `${BASE}/source`) throw new Error(`unexpected GET ${path}`);
    return source;
  });
  vi.mocked(requestOperationStart).mockImplementation(async () => {
    source = { ...source, latestOperation: operation('executing') };
    return { outcome: 'started', operationId: OPERATION_ID };
  });
});

describe('사방넷 등록 상품 가져오기', () => {
  it('⭐ 확장에 사방넷 kind 하나를 시작시키고, 진행은 최근 실행으로 본다', async () => {
    renderImport();
    expect(await screen.findByText('사방넷에서 아직 가져오지 않았습니다')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: '사방넷에서 가져오기' }));

    expect(await screen.findByText('수집 중 · 몰 2곳')).toBeInTheDocument();
    expect(requestOperationStart).toHaveBeenCalledWith('channels.sabangnet_mall_listings', {}, { capability: 'channelsOperationKindsV1' });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('⭐ 받을 몰 계정이 없으면 시작을 막고 이유를 말한다', async () => {
    source = { ...source, ready: false, malls: malls.map((mall) => ({ ...mall, channelAccountId: null })) };
    renderImport();

    expect(await screen.findByText(/사방넷 상품을 받을 몰 계정이 없습니다/)).toBeInTheDocument();
    expect(requestOperationStart).not.toHaveBeenCalled();
  });

  it('같은 사방넷 로그인의 실행이 돌고 있으면 확장의 거절을 보여 준다', async () => {
    vi.mocked(requestOperationStart).mockResolvedValue({ outcome: 'refused', message: '같은 실행이 이미 진행 중입니다.' });
    renderImport();

    fireEvent.click(await screen.findByRole('button', { name: '사방넷에서 가져오기' }));

    expect(await screen.findByText(/같은 실행이 이미 진행 중입니다/)).toBeInTheDocument();
  });

  it('마지막으로 가져온 결과를 몰 수와 함께 적는다', async () => {
    source = {
      ...source,
      latestOperation: operation('succeeded'),
      latestSucceeded: operation('succeeded'),
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
      latestOperation: operation('succeeded'),
      latestSucceeded: operation('succeeded'),
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
      latestOperation: operation('cancelled', { errorCode: 'USER_CANCELLED' }),
    };
    renderImport();

    expect(await screen.findByText('수집을 중단했습니다. 저장된 완료본은 유지됩니다.')).toBeInTheDocument();
  });

  it('실패한 가져오기는 owner 가 남긴 이유를 보여 준다', async () => {
    source = {
      ...source,
      latestOperation: operation('failed', {
        errorCode: 'SITE_LOGIN_REQUIRED',
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
      latestSucceeded: operation('succeeded'),
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
