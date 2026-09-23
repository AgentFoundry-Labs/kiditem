import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { CapabilityInvocationCard } from '../CapabilityInvocationCard';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), getParsed: vi.fn(), post: vi.fn() } }));

const IDENTITY = { userId: 'user-1', organizationId: 'org-1' };
const OPERATION_ID = '00000000-0000-4000-8000-000000000123';

describe('CapabilityInvocationCard', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it('uses Korean copy while loading an approval receipt', () => {
    vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => undefined) as never);

    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CapabilityInvocationCard identity={IDENTITY} invocationId="00000000-0000-4000-8000-000000000000" /></QueryClientProvider>);

    expect(screen.getByRole('status')).toHaveTextContent('승인 정보를 불러오는 중입니다.');
    expect(screen.queryByText('Loading approval details…')).not.toBeInTheDocument();
  });

  it('presents a bounded Korean approval summary without exposing the internal receipt', async () => {
    const invocationId = '00000000-0000-4000-8000-000000000001';
    vi.mocked(apiClient.get).mockResolvedValue({
      id: invocationId,
      capabilityKey: 'supply.submit_purchase_order',
      actingAgentKey: 'supply-agent',
      canonicalInput: { purchaseOrderId: 'purchase-order-123', externalOrderId: 'external-order-432' },
      approvalStatus: 'pending',
      approvalExpiresAt: '2026-08-27T00:00:00.000Z',
      approvalRisk: 'high',
      result: null,
    } as never);
    vi.mocked(apiClient.post).mockResolvedValue({
      capabilityKey: 'supply.submit_purchase_order',
      status: 'pending',
      approvalStatus: 'approved',
      approvalExpiresAt: '2026-08-27T00:00:00.000Z',
      result: null,
    } as never);
    const user = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CapabilityInvocationCard identity={IDENTITY} invocationId={invocationId} /></QueryClientProvider>);

    expect(await screen.findByRole('heading', { name: '업무 실행 승인' })).toBeVisible();
    expect(screen.getByText('대상')).toBeVisible();
    expect(screen.getByText('발주서')).toBeVisible();
    expect(screen.getByText('영향')).toBeVisible();
    expect(screen.getByText('발주를 제출합니다.')).toBeVisible();
    expect(screen.getByLabelText('업무 실행 승인')).toHaveClass('border', 'bg-amber-50');
    expect(screen.queryByText('supply.submit_purchase_order')).not.toBeInTheDocument();
    expect(screen.queryByText('supply-agent')).not.toBeInTheDocument();
    expect(screen.queryByText('purchase-order-123')).not.toBeInTheDocument();
    expect(screen.queryByText('external-order-432')).not.toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '승인' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      `/api/agent-os/invocations/${invocationId}/decision`, { decision: 'approved' },
    ));
    expect(await screen.findByText('승인되어 업무를 처리하고 있습니다.')).toBeVisible();
  });

  it.each([
    ['channels.report_target_execution', '몰 등록 실행 결과', '몰에 보낸 등록 실행 결과를 기록합니다.'],
    ['channels.submit_representative_image', '몰 대표이미지', '대표이미지를 몰 상품 수정 화면에 올립니다.'],
  ])('presents the mall-neutral channels capability %s', async (capabilityKey, target, effect) => {
    vi.mocked(apiClient.get).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000009',
      capabilityKey,
      actingAgentKey: 'channel_operations',
      canonicalInput: {},
      approvalStatus: 'pending',
      approvalExpiresAt: null,
      approvalRisk: 'high',
      result: null,
    } as never);
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CapabilityInvocationCard identity={IDENTITY} invocationId="00000000-0000-4000-8000-000000000009" /></QueryClientProvider>);

    expect(await screen.findByText(target)).toBeVisible();
    expect(screen.getByText(effect)).toBeVisible();
  });

  it('keeps a rejected receipt distinct from an approved work acknowledgement', async () => {
    const invocationId = '00000000-0000-4000-8000-000000000002';
    vi.mocked(apiClient.get).mockResolvedValue({
      id: invocationId,
      capabilityKey: 'supply.submit_purchase_order',
      actingAgentKey: 'sourcing',
      canonicalInput: { candidateId: 'candidate-1' },
      approvalRisk: 'low',
      approvalStatus: 'pending',
      approvalExpiresAt: null,
      result: null,
    } as never);
    vi.mocked(apiClient.post).mockResolvedValue({ approvalStatus: 'rejected' } as never);
    const user = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CapabilityInvocationCard identity={IDENTITY} invocationId={invocationId} /></QueryClientProvider>);

    await user.click(await screen.findByRole('button', { name: '취소' }));
    expect(await screen.findByText('요청을 취소했습니다. 이 결정으로 업무는 시작되지 않습니다.')).toBeVisible();
    expect(screen.queryByText('승인되어 업무를 처리하고 있습니다.')).not.toBeInTheDocument();
  });

  it('uses the decision response as the immediate completed work receipt', async () => {
    const invocationId = '00000000-0000-4000-8000-000000000007';
    vi.mocked(apiClient.get).mockResolvedValue({
      capabilityKey: 'supply.submit_purchase_order',
      status: 'pending',
      approvalStatus: 'pending',
      approvalExpiresAt: null,
      result: null,
    } as never);
    vi.mocked(apiClient.post).mockResolvedValue({
      capabilityKey: 'supply.submit_purchase_order',
      status: 'succeeded',
      approvalStatus: 'approved',
      approvalExpiresAt: null,
      result: {
        summary: '발주서를 제출했습니다.',
        resourceRefs: [],
      },
    } as never);
    const user = userEvent.setup();

    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CapabilityInvocationCard identity={IDENTITY} invocationId={invocationId} /></QueryClientProvider>);

    await user.click(await screen.findByRole('button', { name: '승인' }));

    expect(await screen.findByText('발주서를 제출했습니다.')).toBeVisible();
    expect(screen.getByText('승인한 업무가 완료되었습니다.')).toBeVisible();
  });

  it.each([
    ['rejected', '요청을 취소했습니다. 이 결정으로 업무는 시작되지 않습니다.'],
    ['expired', '승인 가능 시간이 만료되었습니다.'],
    ['ambiguous', '승인 상태를 확인할 수 없습니다.'],
  ])('uses Korean status copy for %s', async (approvalStatus, expectedCopy) => {
    const invocationId = '00000000-0000-4000-8000-000000000003';
    vi.mocked(apiClient.get).mockResolvedValue({
      id: invocationId,
      capabilityKey: 'supply.submit_purchase_order',
      actingAgentKey: 'sourcing',
      canonicalInput: { candidateId: 'candidate-1' },
      approvalRisk: 'low',
      approvalStatus,
      approvalExpiresAt: null,
      result: null,
    } as never);
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CapabilityInvocationCard identity={IDENTITY} invocationId={invocationId} /></QueryClientProvider>);

    expect(await screen.findByRole('heading', { name: '업무 실행 승인' })).toBeVisible();
    expect(screen.getByText(expectedCopy)).toBeVisible();
    expect(screen.queryByRole('button', { name: '승인' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument();
  });

  it('renders only the bounded result summary and production-wired references', async () => {
    const invocationId = '00000000-0000-4000-8000-000000000004';
    vi.mocked(apiClient.get).mockResolvedValue({
      capabilityKey: 'supply.submit_purchase_order',
      approvalStatus: 'not_required',
      approvalExpiresAt: null,
      result: {
        summary: '발주서를 만들고 확인 대기 중입니다.',
        resourceRefs: [{ kind: 'purchase_order', id: 'purchase/order?1', version: null }],
        // Deliberate negative fixture: retired operation references must never render.
        operationRefs: [{ kind: 'operation_run', id: OPERATION_ID }],
        output: { providerPayload: 'must not render' },
      },
    } as never);

    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CapabilityInvocationCard identity={IDENTITY} invocationId={invocationId} /></QueryClientProvider>);

    expect(await screen.findByText('발주서를 만들고 확인 대기 중입니다.')).toBeVisible();
    expect(apiClient.getParsed).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: '발주서 열기' }))
      .toHaveAttribute('href', '/purchase-orders?orderId=purchase%2Forder%3F1');
    expect(screen.queryByText(OPERATION_ID)).not.toBeInTheDocument();
    expect(screen.queryByText('purchase/order?1')).not.toBeInTheDocument();
    expect(screen.queryByText('supply.submit_purchase_order')).not.toBeInTheDocument();
    expect(screen.queryByText('must not render')).not.toBeInTheDocument();
  });

  it('shows one generic receipt error and lets the operator retry without exposing the error reason', async () => {
    const invocationId = '00000000-0000-4000-8000-000000000005';
    vi.mocked(apiClient.get)
      .mockRejectedValueOnce(new Error('invocation_not_found_for_foreign_organization'))
      .mockResolvedValueOnce({
        capabilityKey: 'supply.submit_purchase_order',
        status: 'pending',
        approvalStatus: 'not_required',
        approvalExpiresAt: null,
        result: null,
      } as never);
    const user = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CapabilityInvocationCard identity={IDENTITY} invocationId={invocationId} /></QueryClientProvider>);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('업무 실행 정보를 불러올 수 없습니다.');
    expect(alert).not.toHaveTextContent('foreign');
    expect(alert).not.toHaveTextContent('not_found');

    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('heading', { name: '업무 실행 승인' })).toBeVisible();
  });

  it('polls a safe pending receipt until a bounded result arrives, then stops', async () => {
    vi.useFakeTimers();
    const invocationId = '00000000-0000-4000-8000-000000000006';
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({
        capabilityKey: 'supply.submit_purchase_order',
        status: 'pending',
        approvalStatus: 'not_required',
        approvalExpiresAt: null,
        result: null,
      } as never)
      .mockResolvedValueOnce({
        capabilityKey: 'supply.submit_purchase_order',
        status: 'succeeded',
        approvalStatus: 'not_required',
        approvalExpiresAt: null,
        result: {
          summary: '발주서를 준비했습니다.',
          resourceRefs: [],
        },
      } as never);
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CapabilityInvocationCard identity={IDENTITY} invocationId={invocationId} /></QueryClientProvider>);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('heading', { name: '업무 실행 승인' })).toBeVisible();
    expect(apiClient.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(screen.getByText('발주서를 준비했습니다.')).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });
});
