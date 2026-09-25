import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { RocketOrdersWorkspace } from './RocketOrdersWorkspace';

// 로켓 수집 상태는 실행 계약 reader(`GET /api/operations?kinds=orders.coupang_rocket_po`)를 계정으로 나눠 본다(KID-359).
const account = '11111111-1111-4111-8111-111111111111';
const oldId = '22222222-2222-4222-8222-222222222222';
const emptyId = '33333333-3333-4333-8333-333333333333';
vi.mock('../hooks/useRocketOrdersViewState', () => ({
  useRocketOrdersViewState: () => [...useState({ account: '11111111-1111-4111-8111-111111111111',
    from: '2026-07-01', to: '2026-07-31', date: '', status: '', view: 'month' }), true],
}));
vi.mock('./RocketAccountBootstrap', () => ({ RocketAccountBootstrap: () => null }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
afterEach(() => vi.unstubAllGlobals());

const NOW = new Date().toISOString();
function operation(id: string, status: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    kind: 'orders.coupang_rocket_po',
    status,
    lockKeys: status === 'executing' ? [`account:${account}`] : [],
    plan: {
      channelAccountId: account, from: '2026-07-01', to: '2026-07-31', status: '', dateType: 'WAREHOUSING_PLAN_DATE',
      requireConfirmation: true, vendorExpectations: { rocketVendorId: 'VENDOR', sharedCoupangVendorId: null },
    },
    progress: null,
    result: status === 'succeeded' ? { purchaseOrders: 1, lines: 1 } : null,
    window: { start: '2026-07-01', end: '2026-07-31' },
    errorCode: null,
    errorMessage: null,
    startedAt: NOW,
    finishedAt: status === 'executing' ? null : NOW,
    expiresAt: '2099-01-01T00:00:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...overrides,
  };
}
const savedPo = (collectedAt: string) => ({
  rocketPoOperationId: oldId, poNumber: 'PO-1', orderedAt: '2026-07-01', plannedDeliveryDate: '2026-07-18',
  status: '거래처확인요청', vendorId: 'VENDOR', centerName: '센터', inboundType: '택배', firstProductName: '상품',
  skuCount: 1, orderQuantity: 2, orderAmount: 1000, collectedAt,
});

function stubFetch(read: () => Response | Record<string, unknown>[], list: () => unknown[]) {
  const requests: Array<{ path: string; method?: string; action?: string }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url, 'http://localhost').pathname;
    const action = init?.body ? JSON.parse(String(init.body)).action : undefined;
    requests.push({ path, method: init?.method, action });
    if (path === '/api/operations') {
      const value = read();
      return value instanceof Response ? value : Response.json({ operations: value });
    }
    if (action === 'listSavedRocketPos') return Response.json(list());
    return Response.json({ message: 'unexpected' }, { status: 404 });
  }));
  return requests;
}
const reread = async (client: QueryClient) => {
  await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.orders.rocketPoOperations() }); });
};

it('가장 최근 성공한 실행이 현재 수집본이다 — 빈 수집도 그렇고, 실패는 그 옆에 적고, 성공한 실행이 없으면 아무것도 세지 않는다', async () => {
  const complete = operation(oldId, 'succeeded');
  let operations: Record<string, unknown>[] = [complete];
  const requests = stubFetch(() => operations, () => [savedPo(NOW)]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = render(<QueryClientProvider client={client}><RocketOrdersWorkspace decisionWorkspace={(context) => <>
    <output aria-label="selected source">{context.selectedRocketPoOperationId ?? 'none'}</output>
    {context.renderOrderExplorer({ disabled: false, onSelectDate: () => undefined })}
  </>} /></QueryClientProvider>);
  await screen.findByRole('button', { name: '2026-07-18 발주 1건' });
  expect(screen.getByRole('status', { name: '로켓 수집 상태' })).toHaveTextContent('수집 기간 2026-07-01 ~ 2026-07-31');

  const empty = operation(emptyId, 'succeeded', { result: { purchaseOrders: 0, lines: 0 } });
  operations = [empty, complete];
  await reread(client);
  await waitFor(() => expect(screen.getByLabelText('selected source')).toHaveTextContent(emptyId));
  expect(screen.queryByRole('button', { name: '2026-07-18 발주 1건' })).not.toBeInTheDocument();
  await waitFor(() => expect(within(screen.getByTestId('rocket-order-summary')).getAllByText('0')).toHaveLength(3));

  operations = [operation('44444444-4444-4444-8444-444444444444', 'failed', { errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '로그인이 필요합니다.' }), empty];
  await reread(client);
  await screen.findByText(/수집 실패: 로그인이 필요합니다/);
  expect(screen.getByRole('status', { name: '로켓 수집 상태' })).toHaveTextContent('COMPLETE 수집본');

  operations = [operation('44444444-4444-4444-8444-444444444444', 'failed', { errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '로그인이 필요합니다.' })];
  await reread(client);
  await waitFor(() => expect(screen.getByLabelText('selected source')).toHaveTextContent('none'));
  expect(within(screen.getByTestId('rocket-order-summary')).getAllByText('—')).toHaveLength(3);
  expect(requests.every(({ method, action }) => method !== 'POST' || action === 'listSavedRocketPos')).toBe(true);
  rendered.unmount(); client.clear();
});

it('취소한 실행은 실패가 아니라 중단으로 보이고, 앞 성공 수집본은 그대로다; 오래된 성공은 최신 수집이 필요하다', async () => {
  const old = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  stubFetch(() => [operation(emptyId, 'cancelled', { errorCode: 'USER_CANCELLED', errorMessage: '실행을 중단했습니다.' }), operation(oldId, 'succeeded', { finishedAt: old })], () => []);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = render(<QueryClientProvider client={client}><RocketOrdersWorkspace decisionWorkspace={() => null} /></QueryClientProvider>);
  const status = screen.getByRole('status', { name: '로켓 수집 상태' });
  await waitFor(() => expect(status).toHaveTextContent('수집 중단됨'));
  expect(status).toHaveTextContent('이전 COMPLETE 수집본 · 최신 수집 필요');
  expect(status).not.toHaveTextContent('수집 실패');
  rendered.unmount(); client.clear();
});

it('나중 상태 읽기가 실패해도 마지막으로 안 성공 수집본과 저장 목록을 유지한다', async () => {
  let fails = false;
  stubFetch(() => (fails ? Response.json({ message: 'denied' }, { status: 403 }) : [operation(oldId, 'succeeded')]), () => [savedPo(NOW)]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = render(<QueryClientProvider client={client}><RocketOrdersWorkspace decisionWorkspace={(context) => <>
    <output aria-label="selected source">{context.selectedRocketPoOperationId ?? 'none'}</output>
    {context.renderOrderExplorer({ disabled: false, onSelectDate: () => undefined })}
  </>} /></QueryClientProvider>);
  await screen.findByRole('button', { name: '2026-07-18 발주 1건' });
  fails = true;
  await reread(client);
  const status = screen.getByRole('status', { name: '로켓 수집 상태' });
  await waitFor(() => expect(status).toHaveTextContent('상태를 다시 확인하는 중'));
  expect(status).toHaveTextContent('COMPLETE 수집본');
  expect(screen.getByLabelText('selected source')).toHaveTextContent(oldId);
  rendered.unmount(); client.clear();
});
