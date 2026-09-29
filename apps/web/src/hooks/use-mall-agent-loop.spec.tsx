import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MallAgentLoopProvider } from '@/components/providers/MallAgentLoopProvider';
import {
  getMallAgentLoopState,
  resetMallAgentLoopForTest,
  setMallAgentLoopEnabled,
} from '@/lib/mall-agent-loop';

// 바깥 경계만 가짜다: 몰 계정 API, 확장의 로그인 확인, 주문수집 실행, 로켓 계정 조회.
const mocks = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  sweep: vi.fn(),
  collectAllOrders: vi.fn(),
}));

vi.mock('@/lib/order-mall-account-api', () => ({
  orderMallAccountApi: { list: mocks.listAccounts },
}));
vi.mock('@/lib/mall-session-probe', () => ({ sweepMallSessions: mocks.sweep }));
vi.mock('./useAllMarketplaceOrderCollection', () => ({
  usePersistedAllMarketplaceOrderCollection: () => ({ collectAllOrders: mocks.collectAllOrders }),
}));
vi.mock('./useRocketChannelAccounts', () => ({ useRocketChannelAccounts: () => ({ rocketAccounts: [] }) }));

beforeEach(() => {
  mocks.listAccounts.mockResolvedValue([
    { key: 'kidsnote', enabled: true, siteUrl: null },
    { key: 'onch', enabled: false, siteUrl: null },
  ]);
  mocks.sweep.mockResolvedValue({ checked: 1, signedIn: 1, verification: 0, signedOut: 0, signedOutKeys: [] });
  mocks.collectAllOrders.mockResolvedValue(undefined);
});

afterEach(() => {
  resetMallAgentLoopForTest();
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe('useMallAgentLoopRunner', () => {
  it('⭐ 앱을 열었을 때는 돌지 않고, 운영자가 시작하면 간격을 기다리지 않고 곧바로 한 바퀴 돈다', async () => {
    render(<MallAgentLoopProvider enabled>{null}</MallAgentLoopProvider>);
    await act(async () => {});
    expect(mocks.sweep).not.toHaveBeenCalled();

    act(() => setMallAgentLoopEnabled(true));

    await waitFor(() => expect(getMallAgentLoopState().lastSummary).toMatch(/^로그인됨 1 · 인증 필요 0 · 로그인 필요 0/));
    expect(mocks.sweep).toHaveBeenCalledTimes(1);
    expect(mocks.sweep).toHaveBeenCalledWith(['kidsnote'], { kidsnote: null });
    expect(getMallAgentLoopState().nextRunAt).not.toBeNull();
  });
});
