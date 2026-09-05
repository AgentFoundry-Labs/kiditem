import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { RocketOrdersWorkspace } from './RocketOrdersWorkspace';

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

it('uses empty COMPLETE identity independently of rows and shows latest failure with the actual retained cutoff', async () => {
  const plan = { channelAccountId: account, from: '2026-07-01', to: '2026-07-31', status: '',
    dateType: 'WAREHOUSING_PLAN_DATE', requireConfirmation: true,
    sourceType: 'coupang_rocket_po_catalog', parserVersion: 'rocket-po-v1',
    vendorExpectations: { rocketVendorId: 'VENDOR', sharedCoupangVendorId: null } };
  const complete = { attemptId: oldId, channelAccountId: account, state: 'COMPLETE', generation: '1', plan,
    expiresAt: '2099-01-01T00:00:00Z', actualCutoffAt: '2026-07-31T01:00:00Z', errorCode: null, errorMessage: null };
  let source: Record<string, unknown> = { status: 'READY', refreshing: false, latestAttempt: complete, latestComplete: complete };
  const requests: Array<{ path: string; method?: string; action?: string }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url, 'http://localhost').pathname;
    const action = init?.body ? JSON.parse(String(init.body)).action : undefined;
    requests.push({ path, method: init?.method, action });
    if (path.endsWith('/source')) return Response.json(source);
    if (action === 'listSavedRocketPos') return Response.json([{
      sourceImportRunId: oldId, poNumber: 'PO-1', orderedAt: '2026-07-01', plannedDeliveryDate: '2026-07-18',
      status: '거래처확인요청', vendorId: 'VENDOR', centerName: '센터', inboundType: '택배', firstProductName: '상품',
      skuCount: 1, orderQuantity: 2, orderAmount: 1000, collectedAt: complete.actualCutoffAt,
    }]);
    return Response.json({ message: 'unexpected' }, { status: 404 });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = render(<QueryClientProvider client={client}><RocketOrdersWorkspace decisionWorkspace={(context) => <>
    <output aria-label="selected source">{context.selectedSourceImportRunId ?? 'none'}</output>
    {context.renderOrderExplorer({ disabled: false, onSelectDate: () => undefined })}
  </>} /></QueryClientProvider>);
  await screen.findByRole('button', { name: '2026-07-18 발주 1건' });
  const empty = { ...complete, attemptId: emptyId, generation: '2', actualCutoffAt: '2026-07-31T02:00:00Z' };
  source = { status: 'READY', refreshing: false, latestAttempt: empty, latestComplete: empty };
  await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.orders.rocketPoSource(account) }); });
  await waitFor(() => expect(screen.getByLabelText('selected source')).toHaveTextContent(emptyId));
  expect(screen.queryByRole('button', { name: '2026-07-18 발주 1건' })).not.toBeInTheDocument();
  source = { status: 'STALE', refreshing: false, latestComplete: empty,
    latestAttempt: { ...empty, attemptId: '44444444-4444-4444-8444-444444444444', state: 'FAILED', errorCode: 'LOGIN_REQUIRED', errorMessage: '로그인이 필요합니다.' } };
  await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.orders.rocketPoSource(account) }); });
  await screen.findByText(/수집 실패: 로그인이 필요합니다/);
  expect(screen.getByRole('status', { name: '로켓 수집 상태' })).toHaveTextContent('이전 COMPLETE');
  expect(screen.getByRole('status', { name: '로켓 수집 상태' })).toHaveTextContent(empty.actualCutoffAt);
  source = { ...source, status: 'MISSING', latestComplete: null };
  await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.orders.rocketPoSource(account) }); });
  await waitFor(() => expect(screen.getByLabelText('selected source')).toHaveTextContent('none'));
  expect(screen.getByRole('status', { name: '로켓 수집 상태' })).toHaveTextContent('로그인이 필요합니다.');
  expect(requests.every(({ method, action }) => method !== 'POST' || action === 'listSavedRocketPos')).toBe(true);
  rendered.unmount(); client.clear();
});
