import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderCollectionSourceStatus } from '@kiditem/shared/order-collection-source';
import { apiClient } from '@/lib/api-client';
import { MallCollectionControl } from './MallCollectionControl';
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

const buildAdapter = (target: OrderCollectionMallAccount) => mallOrderCollectionSource({
  organizationId: ORGANIZATION_ID,
  account: target,
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

    expect(await screen.findByText('수집 중 · 키즈노트')).toBeInTheDocument();
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
    expect(screen.getByText('수집 중 · 키즈노트')).toBeInTheDocument();
  });

  /**
   * 카드마다 자기 몰을 물으면 20장짜리 화면이 폴링만으로 전역 throttler(60초 120회)를
   * 넘겨 화면 전체가 429를 받는다. 한 화면의 카드들은 목록 하나를 함께 본다(KID-170 D2).
   */
  it('reads the owner once for all the mall cards the screen mounts', async () => {
    status = running();
    renderControls([ACCOUNT, { ...ACCOUNT, key: 'kkomangse', name: '꼬망세' }]);

    expect(await screen.findByText('수집 중 · 키즈노트')).toBeInTheDocument();
    // 옆 카드는 자기 몰 칸을 읽으므로 이 수집에 휩쓸리지 않는다.
    expect(await screen.findByRole('button', { name: '꼬망세 수집' })).toBeEnabled();
    expect(apiClient.getParsed).toHaveBeenCalledTimes(1);
  });

  it('never offers a start for a mall that cannot collect yet', async () => {
    renderControl({ ...ACCOUNT, enabled: false }, '중지된 계정입니다.');

    expect(await screen.findByRole('button', { name: '키즈노트 수집' })).toBeDisabled();
    expect(screen.getByText('중지된 계정입니다.')).toBeInTheDocument();
  });
});
