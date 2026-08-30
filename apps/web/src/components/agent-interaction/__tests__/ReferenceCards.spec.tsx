import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { OperationReferenceCard } from '../OperationReferenceCard';
import { ResourceReferenceCard } from '../ResourceReferenceCard';

vi.mock('@/lib/api-client', () => ({ apiClient: { getParsed: vi.fn() } }));

const OPERATION_ID = '00000000-0000-4000-8000-000000000123';

function renderWithQuery(node: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {node}
    </QueryClientProvider>,
  );
}

describe('Agent result reference cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it('uses the existing operation query owner to show a business title and active status without its opaque reference', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue({
      id: OPERATION_ID,
      title: '소싱 후보 수집',
      status: 'running',
    } as never);
    renderWithQuery(<OperationReferenceCard reference={{ kind: 'operation_run', id: OPERATION_ID }} />);

    expect(await screen.findByRole('heading', { name: '소싱 후보 수집' })).toBeVisible();
    expect(screen.getByText('진행 중')).toBeVisible();
    expect(apiClient.getParsed).toHaveBeenCalledWith(`/api/operations/runs/${OPERATION_ID}`, expect.anything());
    expect(screen.queryByText('operation_run')).not.toBeInTheDocument();
    expect(screen.queryByText(OPERATION_ID)).not.toBeInTheDocument();
    expect(screen.getByLabelText('소싱 후보 수집')).toHaveClass('border', 'bg-evidence-surface');
  });

  it('links a purchase-order reference only to its verified destination without exposing its opaque ID', () => {
    renderWithQuery(<ResourceReferenceCard reference={{ kind: 'purchase_order', id: 'purchase/order?1', version: 'v7' }} />);

    expect(screen.getByRole('heading', { name: '발주서' })).toBeVisible();
    expect(screen.getByRole('link', { name: '발주서 열기' }))
      .toHaveAttribute('href', '/purchase-orders?orderId=purchase%2Forder%3F1');
    expect(screen.queryByText('purchase/order?1')).not.toBeInTheDocument();
    expect(screen.queryByText('v7')).not.toBeInTheDocument();
  });

  it('links a sourcing candidate only to its verified detail route', () => {
    renderWithQuery(<ResourceReferenceCard reference={{ kind: 'sourcing_candidate', id: 'candidate/123', version: null }} />);

    expect(screen.getByRole('heading', { name: '소싱 후보' })).toBeVisible();
    expect(screen.getByRole('link', { name: '소싱 후보 열기' }))
      .toHaveAttribute('href', '/product-pipeline/collected-products/candidate%2F123');
    expect(screen.queryByText('candidate/123')).not.toBeInTheDocument();
  });

  it('keeps an unknown resource kind as a safe non-action card', () => {
    renderWithQuery(<ResourceReferenceCard reference={{ kind: 'internal_projection', id: 'internal-123', version: 'v9' }} />);

    expect(screen.getByRole('heading', { name: '업무 결과' })).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('internal_projection')).not.toBeInTheDocument();
    expect(screen.queryByText('internal-123')).not.toBeInTheDocument();
    expect(screen.queryByText('v9')).not.toBeInTheDocument();
  });

  it('stops background operation polling after a permanent error and retries only when requested', async () => {
    vi.useFakeTimers();
    vi.mocked(apiClient.getParsed)
      .mockRejectedValueOnce(new Error(`private operation ${OPERATION_ID} failed`))
      .mockResolvedValueOnce({
        id: OPERATION_ID,
        title: '소싱 후보 수집',
        status: 'succeeded',
    } as never);
    renderWithQuery(<OperationReferenceCard reference={{ kind: 'operation_run', id: OPERATION_ID }} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('작업 상태를 불러올 수 없습니다.');
    expect(alert).not.toHaveTextContent(OPERATION_ID);
    expect(apiClient.getParsed).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(apiClient.getParsed).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('heading', { name: '소싱 후보 수집' })).toBeVisible();
    expect(apiClient.getParsed).toHaveBeenCalledTimes(2);
  });
});
