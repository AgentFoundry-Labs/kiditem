import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { CapabilityInvocationCard } from '../CapabilityInvocationCard';

afterEach(() => vi.unstubAllGlobals());

it.each(['saved receipt', 'approval response'])('ignores historical Operation references in %s without losing receipt or resources', async (origin) => {
  const invocationId = '00000000-0000-4000-8000-000000000001';
  const operationId = '00000000-0000-4000-8000-000000000123';
  const completed = {
    capabilityKey: 'supply.submit_purchase_order', status: 'succeeded', approvalStatus: 'approved', approvalExpiresAt: null,
    result: {
      summary: '발주서를 제출했습니다.',
      resourceRefs: [
        { kind: 'purchase_order', id: 'purchase/order?1', version: null },
        { kind: 'sourcing_candidate', id: 'candidate/1', version: null },
        { kind: 'unknown_resource', id: 'opaque-1', version: null },
      ],
      operationRefs: [{ kind: 'operation_run', id: operationId }],
      output: { privatePayload: 'do not render' },
    },
  };
  let approved = origin === 'saved receipt';
  const requests: Array<{ path: string; method: string; body: unknown }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url, 'http://localhost').pathname;
    requests.push({ path, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
    if (path === `/api/agent-os/invocations/${invocationId}/decision`) {
      approved = true;
      return Response.json(completed);
    }
    if (path === `/api/agent-os/invocations/${invocationId}`) return Response.json(approved ? completed : {
      ...completed, status: 'pending', approvalStatus: 'pending', result: null,
    });
    return Response.json({ message: 'retired endpoint' }, { status: 404 });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const card = render(<QueryClientProvider client={client}>
    <CapabilityInvocationCard identity={{ userId: 'user-1', organizationId: 'org-1' }} invocationId={invocationId} />
  </QueryClientProvider>);
  if (!approved) {
    expect(await screen.findByRole('button', { name: '승인' })).toBeVisible();
    expect(screen.getByRole('button', { name: '취소' })).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', { name: '승인' }));
    expect(requests.filter(({ method }) => method === 'POST')).toEqual([{
      path: `/api/agent-os/invocations/${invocationId}/decision`, method: 'POST', body: { decision: 'approved' },
    }]);
  }
  expect(await screen.findByText('발주서를 제출했습니다.')).toBeVisible();
  expect(screen.getByRole('heading', { name: '업무 실행 승인' })).toBeVisible();
  expect(screen.getByText('승인한 업무가 완료되었습니다.')).toBeVisible();
  expect(screen.getByRole('link', { name: '발주서 열기' })).toHaveAttribute('href', '/purchase-orders?orderId=purchase%2Forder%3F1');
  expect(screen.getByRole('link', { name: '소싱 후보 열기' })).toHaveAttribute('href', '/product-pipeline/collected-products/candidate%2F1');
  expect(screen.getByRole('heading', { name: '업무 결과' })).toBeVisible();
  expect(screen.queryByText(operationId)).not.toBeInTheDocument();
  expect(screen.queryByText('do not render')).not.toBeInTheDocument();
  expect(requests.filter(({ path }) => path.startsWith('/api/operations'))).toEqual([]);
  card.unmount(); client.clear();
});
