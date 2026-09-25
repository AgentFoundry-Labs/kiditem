import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { queryKeys } from '@/lib/query-keys';
import { useWingCatalogSource } from '../hooks/use-wing-catalog-source';
import { pickWingSearchAccount } from './sourcing-wing-source-owner';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  cancelInExtension: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@/lib/operation-start', () => ({
  requestOperationStart: mocks.start,
  requestOperationCancel: mocks.cancelInExtension,
}));
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: async (path: string) => {
      if (path === OPERATIONS_PATH) return { operations };
      throw new Error(`unexpected GET ${path}`);
    },
    getParsed: async (path: string) => {
      if (path === '/api/channels/accounts') return accountsRead();
      throw new Error(`unexpected GET ${path}`);
    },
    post: (path: string) => mocks.post(path),
  },
}));

const OPERATIONS_PATH = '/api/operations?kinds=sourcing.wing_catalog&limit=20';
const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const PREVIOUS_ID = '22222222-2222-4222-8222-222222222222';
const PRIMARY = '44444444-4444-4444-8444-444444444444';
const SECOND = '55555555-5555-4555-8555-555555555555';
const INPUT = { keywords: ['연필', '지우개'], maxPages: 1, purpose: 'market_analysis' as const };

function account(id: string, name: string, isPrimary: boolean, channel = 'coupang') {
  return { id, channel, name, externalAccountId: null, vendorId: null, sellerId: null, isPrimary };
}

function operation(id: string, status: 'executing' | 'succeeded' | 'cancelled') {
  return {
    id,
    kind: 'sourcing.wing_catalog',
    status,
    lockKeys: [`account:${PRIMARY}`, 'resource:coupang-wing:catalog'],
    plan: { source: 'coupang.wing_catalog', ...INPUT, channelAccountId: PRIMARY },
    progress: null,
    result: null,
    window: null,
    errorCode: status === 'cancelled' ? 'USER_CANCELLED' : null,
    errorMessage: null,
    startedAt: '2026-09-26T00:00:00.000Z',
    finishedAt: status === 'executing' ? null : '2026-09-26T00:00:00.000Z',
    expiresAt: '2026-09-26T00:30:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
  };
}

let operations: ReturnType<typeof operation>[];
let accounts: ReturnType<typeof account>[];
let accountsRead: () => Promise<ReturnType<typeof account>[]>;

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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

beforeEach(() => {
  vi.clearAllMocks();
  operations = [];
  accountsRead = async () => accounts;
  accounts = [account(SECOND, '가나 스토어', false), account(PRIMARY, '대표 스토어', true), account('66666666-6666-4666-8666-666666666666', '로켓', true, 'rocket')];
  mocks.start.mockImplementation(async () => {
    operations = [operation(OPERATION_ID, 'executing')];
    return { outcome: 'started', operationId: OPERATION_ID };
  });
  // 이 브라우저에는 그 실행이 없다 — 중단은 서버 cancel로 간다.
  mocks.cancelInExtension.mockRejectedValue(new Error('no extension run'));
});

describe('sourcing Wing catalog collection control (KID-360)', () => {
  it('picks the primary Coupang account, else the first by name', () => {
    expect(pickWingSearchAccount(accounts)).toEqual({ id: PRIMARY, name: '대표 스토어' });
    expect(pickWingSearchAccount([account(SECOND, '나 스토어', false), account(PRIMARY, '가 스토어', false)]))
      .toEqual({ id: PRIMARY, name: '가 스토어' });
    expect(pickWingSearchAccount([])).toBeNull();
  });

  it('starts one operation with the screen input and the primary account, and shows it running on every screen with its stop', async () => {
    renderControls(
      <>
        <WingControl label="시장분석" />
        <WingControl label="추천 검증" />
      </>,
    );

    fireEvent.click(
      await within(screen.getByRole('region', { name: '시장분석' })).findByRole('button', { name: '시장분석 시작' }),
    );

    await waitFor(() => expect(screen.getAllByText('수집 중 · 시장분석 · 연필 외 1개 · 대표 스토어')).toHaveLength(2));
    expect(screen.getAllByRole('button', { name: '수집 중단' })).toHaveLength(2);
    expect(mocks.start.mock.calls).toEqual([['sourcing.wing_catalog', { ...INPUT, channelAccountId: PRIMARY }, { capability: 'sourcingOperationKindsV1' }]]);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('refreshes sourcing reads after a new success without refreshing recommendations or validation', async () => {
    operations = [operation(PREVIOUS_ID, 'succeeded')];
    const { client } = renderControls(<WingControl label="시장분석" />);
    const recommendationsKey = queryKeys.sourcing.workspace.recommendations('org-1', 'today');
    client.setQueryData(recommendationsKey, { data: null });
    await screen.findByRole('button', { name: '시장분석 시작' });

    mocks.start.mockImplementation(async () => {
      operations = [operation(OPERATION_ID, 'succeeded'), operation(PREVIOUS_ID, 'succeeded')];
      return { outcome: 'started', operationId: OPERATION_ID };
    });
    fireEvent.click(await screen.findByRole('button', { name: '시장분석 시작' }));

    await waitFor(() => expect(client.getQueryState(recommendationsKey)?.isInvalidated).toBe(true));
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('stops a running collection through the operation cancel when no extension holds it', async () => {
    operations = [operation(OPERATION_ID, 'executing')];
    const cancelPath = `/api/operations/${OPERATION_ID}/cancel`;
    mocks.post.mockImplementation(async (path: string) => {
      if (path !== cancelPath) throw new Error(`unexpected POST ${path}`);
      operations = [operation(OPERATION_ID, 'cancelled')];
    });
    renderControls(<WingControl label="시장분석" />);

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByRole('button', { name: '시장분석 시작' })).toBeEnabled();
    expect(mocks.cancelInExtension).toHaveBeenCalledWith(OPERATION_ID);
    expect(mocks.post).toHaveBeenCalledWith(cancelPath);
  });

  it('shows a lock refusal from the extension as the refusal, not a failure', async () => {
    mocks.start.mockResolvedValue({ outcome: 'refused', message: '이 계정의 카탈로그 동기화가 진행 중입니다.' });
    renderControls(<WingControl label="시장분석" />);

    fireEvent.click(await screen.findByRole('button', { name: '시장분석 시작' }));

    expect(await screen.findByText('이 계정의 카탈로그 동기화가 진행 중입니다.')).toBeInTheDocument();
  });

  it('asks to connect a Coupang account before asking the extension', async () => {
    accounts = [];
    renderControls(<WingControl label="시장분석" />);

    fireEvent.click(await screen.findByRole('button', { name: '시장분석 시작' }));

    expect(await screen.findByText('쿠팡 윙 계정을 먼저 연결해 주세요.')).toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('blocks the start until the account list is read, and names a failed account read on its own', async () => {
    let release!: () => void;
    accountsRead = () => new Promise((resolve) => { release = () => resolve(accounts); });
    renderControls(<WingControl label="시장분석" />);
    fireEvent.click(await screen.findByRole('button', { name: '시장분석 시작' }));
    expect(await screen.findByText('쿠팡 계정 목록을 불러오는 중입니다. 잠시 후 다시 시작해 주세요.')).toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
    release();
  });

  it('names a failed account read instead of asking to connect an account', async () => {
    accountsRead = async () => { throw new Error('network down'); };
    renderControls(<WingControl label="시장분석" />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.click(await screen.findByRole('button', { name: '시장분석 시작' }));

    expect(await screen.findByText('쿠팡 계정 목록을 불러오지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.')).toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
