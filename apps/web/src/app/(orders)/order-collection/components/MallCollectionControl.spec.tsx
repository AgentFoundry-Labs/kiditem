import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderCollectionSourceStatus } from '@kiditem/shared/order-collection-source';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { MallCollectionControl } from './MallCollectionControl';
import {
  COUPANG_DIRECT_MALL_KEY,
  coupangDirectshipCollectionSource,
} from '../lib/coupang-directship-collection-source';
import { mallOrderCollectionSource } from '../lib/mall-order-collection-source';
import type { OrderCollectionMallAccount } from '../lib/order-mall-account-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getParsed: vi.fn(), post: vi.fn() },
}));
vi.mock('@/lib/browser-collection-session', () => ({
  sendBrowserCollectionControl: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/extension-bridge', () => ({
  detectOrderCollectionExtensionRuntime: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));

const ORGANIZATION_ID = '99999999-9999-4999-8999-999999999999';
const RUNNING_ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';
const CHANNEL_ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';
const NOT_CONFIGURED = '설정에서 사용을 켜고 저장한 뒤 수집할 수 있습니다.';

const ACCOUNT: OrderCollectionMallAccount = {
  key: 'kidsnote',
  name: '키즈노트',
  configured: true,
  enabled: true,
  loginId: 'operator',
  hasPassword: true,
  siteUrl: null,
  memo: null,
  passwordUpdatedAt: null,
  updatedAt: null,
};

let status: OrderCollectionSourceStatus;

function idle(): OrderCollectionSourceStatus {
  return {
    mallKey: ACCOUNT.key,
    channelAccountId: null,
    running: null,
    lastComplete: null,
    lastAttempt: null,
  };
}

function running(): OrderCollectionSourceStatus {
  return {
    ...idle(),
    running: {
      attemptId: RUNNING_ATTEMPT_ID,
      collectionMode: 'browser',
      startedAt: '2026-09-15T01:00:00.000Z',
      expiresAt: '2026-09-15T01:30:00.000Z',
    },
  };
}

const DIRECT_ACCOUNT: OrderCollectionMallAccount = {
  ...ACCOUNT,
  key: COUPANG_DIRECT_MALL_KEY,
  name: '쿠팡 직배송',
};

const buildAdapter = (target: OrderCollectionMallAccount) => mallOrderCollectionSource({
  organizationId: ORGANIZATION_ID,
  account: target,
  handOff: vi.fn().mockResolvedValue(undefined),
});

const buildDirectshipAdapter = () => coupangDirectshipCollectionSource({
  channelAccountId: CHANNEL_ACCOUNT_ID,
  handOff: vi.fn().mockResolvedValue(undefined),
});

function renderControls(
  accounts: OrderCollectionMallAccount[],
  startBlockedReason: string | null = null,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      {accounts.map((account) => (
        <MallCollectionControl
          key={account.key}
          account={account}
          startBlockedReason={startBlockedReason}
          buildAdapter={buildAdapter}
        />
      ))}
    </QueryClientProvider>,
  );
  return client;
}

function renderControl(
  account = ACCOUNT,
  startBlockedReason: string | null = null,
) {
  return renderControls([account], startBlockedReason);
}

beforeEach(() => {
  vi.clearAllMocks();
  status = idle();
  // owner 는 화면이 띄우는 몰을 한 번에 답한다(KID-170 D2).
  vi.mocked(apiClient.getParsed).mockImplementation(async () => ({ malls: [status] }));
  vi.mocked(apiClient.post).mockResolvedValue({});
});

describe('MallCollectionControl', () => {
  it('offers a start and no stop while the mall is not collecting', async () => {
    renderControl();

    expect(await screen.findByRole('button', { name: '키즈노트 수집' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '수집 중단' })).not.toBeInTheDocument();
  });

  it('shows the owner running collection with a stop, and no start', async () => {
    status = running();
    renderControl();

    // 카드에서는 중단 버튼 하나만 시작 자리에 선다. 무엇을 수집 중인지는 그 버튼의 설명이 말한다.
    expect(await screen.findByRole('button', { name: '수집 중단' })).toHaveAttribute('title', '수집 중 · 키즈노트');
    expect(screen.getByRole('button', { name: '수집 중단' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '키즈노트 수집' })).not.toBeInTheDocument();
  });

  it('stops through the owner cancel route and reports no failure', async () => {
    const user = userEvent.setup();
    status = running();
    renderControl();
    await screen.findByRole('button', { name: '수집 중단' });
    // 확장은 답했지만 시도를 끝내지는 않았다(다른 브라우저의 세션). owner 가 끝낸다.
    vi.mocked(apiClient.post).mockImplementation(async () => {
      status = idle();
      return {};
    });

    await user.click(screen.getByRole('button', { name: '수집 중단' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      `/api/orders/collection/attempts/${RUNNING_ATTEMPT_ID}/cancel`,
    ));
    await waitFor(() => expect(screen.getByRole('button', { name: '키즈노트 수집' })).toBeInTheDocument());
    expect(screen.queryByText(/중단하지 못했습니다/)).not.toBeInTheDocument();
  });

  /** KID-191. 서버가 중단을 받지 못했으면 버튼을 지우지 않는다. */
  it('keeps the running collection and says so when the owner refused the stop', async () => {
    const user = userEvent.setup();
    status = running();
    renderControl();
    await screen.findByRole('button', { name: '수집 중단' });
    vi.mocked(apiClient.post).mockRejectedValue(new Error('owner unreachable'));

    await user.click(screen.getByRole('button', { name: '수집 중단' }));

    expect(await screen.findByText(
      '수집을 중단하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    )).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수집 중단' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '수집 중단' })).toHaveAttribute('title', '수집 중 · 키즈노트');
  });

  /**
   * 카드마다 자기 몰을 물으면 20장짜리 화면이 폴링만으로 전역 throttler(60초 120회)를
   * 넘겨 화면 전체가 429를 받는다. 한 화면의 카드들은 목록 하나를 함께 본다(KID-170 D2).
   */
  it('reads the owner once for all the mall cards the screen mounts', async () => {
    status = running();
    renderControls([ACCOUNT, { ...ACCOUNT, key: 'kkomangse', name: '꼬망세' }]);

    expect(await screen.findByRole('button', { name: '수집 중단' })).toHaveAttribute('title', '수집 중 · 키즈노트');
    // 옆 카드는 자기 몰 칸을 읽으므로 이 수집에 휩쓸리지 않는다.
    expect(await screen.findByRole('button', { name: '꼬망세 수집' })).toBeEnabled();
    expect(apiClient.getParsed).toHaveBeenCalledTimes(1);
  });

  /**
   * 카드 20장이 목록 하나를 함께 본다. 전체 수집이 도는 동안 다른 몰이 시작·중단할
   * 때마다 그 목록이 통째로 새로 오는데, 그때마다 이 카드의 안내가 사라지면 운영자는
   * 무엇을 해야 하는지 읽을 겨를이 없다(KID-170).
   */
  it('keeps a mall`s refusal notice while another mall in the same read starts collecting', async () => {
    const user = userEvent.setup();
    const other = { ...ACCOUNT, key: 'kkomangse', name: '꼬망세' };
    let malls: OrderCollectionSourceStatus[] = [
      // 키즈노트는 아직 설정되지 않았다(계정 행이 없다).
      idle(),
      { ...idle(), mallKey: other.key, channelAccountId: CHANNEL_ACCOUNT_ID },
    ];
    vi.mocked(apiClient.getParsed).mockImplementation(async () => ({ malls }));
    const client = renderControls([ACCOUNT, other]);
    await screen.findByRole('button', { name: '키즈노트 수집' });

    await user.click(screen.getByRole('button', { name: '키즈노트 수집' }));
    expect(await screen.findByText(NOT_CONFIGURED)).toBeInTheDocument();

    malls = [malls[0]!, { ...malls[1]!, running: running().running }];
    await act(async () => {
      await client.refetchQueries({ queryKey: queryKeys.orders.collectionSources(ORGANIZATION_ID) });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(await screen.findByRole('button', { name: '수집 중단' })).toHaveAttribute('title', '수집 중 · 꼬망세');
    expect(screen.getByText(NOT_CONFIGURED)).toBeInTheDocument();
  });

  /**
   * KID-214. 쿠팡 직배송 카드도 같은 컨트롤을 쓰지만, 그 몰만 로켓 계정 하나의 원천
   * 상태를 따로 읽는다. 컨트롤이 몰 목록 타입에 묶여 있으면 그 어댑터를 몰 목록인 척
   * 캐스팅해 넣어야 하고, 그러면 카드가 읽는 상태를 아무도 검사하지 않는다.
   */
  it('hosts a source that reads its own status instead of the shared mall list', async () => {
    vi.mocked(apiClient.getParsed).mockImplementation(async (path: string) => (
      path.startsWith('/api/orders/collection/coupang-directship')
        ? { ...running(), mallKey: DIRECT_ACCOUNT.key }
        : { malls: [idle()] }
    ));

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MallCollectionControl account={DIRECT_ACCOUNT} buildAdapter={buildDirectshipAdapter} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('button', { name: '수집 중단' })).toHaveAttribute('title', '수집 중');
    expect(screen.getByRole('button', { name: '수집 중단' })).toBeEnabled();
  });

  it('never offers a start for a mall that cannot collect yet', async () => {
    renderControl({ ...ACCOUNT, enabled: false }, '중지된 계정입니다.');

    expect(await screen.findByRole('button', { name: '키즈노트 수집' })).toBeDisabled();
    expect(screen.getByText('중지된 계정입니다.')).toBeInTheDocument();
  });

  /**
   * 그 원천만의 시작 불가 사유는 원천이 답한다(KID-255) — 화면이 몰 키를 보고 문장을
   * 고르지 않는다. 화면이 모든 몰에 똑같이 대는 사유가 있으면 그 사유가 먼저다.
   */
  it('⭐ 화면 공통 사유가 없으면 그 원천이 답한 시작 불가 사유를 세운다', async () => {
    vi.mocked(apiClient.getParsed).mockImplementation(async () => ({ malls: [idle()] }));

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MallCollectionControl
          account={DIRECT_ACCOUNT}
          buildAdapter={() => coupangDirectshipCollectionSource({
            channelAccountId: null,
            handOff: vi.fn().mockResolvedValue(undefined),
          })}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('쿠팡 로켓 계정을 먼저 선택해 주세요.')).toBeInTheDocument();
  });

  it('⭐ 화면 공통 사유가 있으면 그 사유가 먼저다', async () => {
    vi.mocked(apiClient.getParsed).mockImplementation(async () => ({ malls: [idle()] }));

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MallCollectionControl
          account={{ ...DIRECT_ACCOUNT, enabled: false }}
          startBlockedReason="중지된 계정입니다."
          buildAdapter={() => coupangDirectshipCollectionSource({
            channelAccountId: null,
            handOff: vi.fn().mockResolvedValue(undefined),
          })}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('중지된 계정입니다.')).toBeInTheDocument();
    expect(screen.queryByText('쿠팡 로켓 계정을 먼저 선택해 주세요.')).not.toBeInTheDocument();
  });
});
