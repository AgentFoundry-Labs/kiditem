import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PurchaseOrderTable } from './PurchaseOrderTable';

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: 'po-1',
    supplierName: 'Supplier',
    totalAmountCny: '10',
    status: 'pending',
    orderDate: '2026-07-16T00:00:00.000Z',
    expectedDeliveryDate: null,
    trackingNumber: null,
    items: [],
    supplier: null,
    latestSubmissionAttempt: null,
    ...overrides,
  };
}

function renderTable(input: { orders?: ReturnType<typeof order>[] } = {}) {
  const onStatusChange = vi.fn();
  const onSubmit = vi.fn();
  const onReconcile = vi.fn();
  render(
    <PurchaseOrderTable
      orders={input.orders ?? [order()]}
      loading={false}
      actionLoading={null}
      page={1}
      pageSize={20}
      total={1}
      onPageChange={vi.fn()}
      onStatusChange={onStatusChange}
      onSubmit={onSubmit}
      onReconcile={onReconcile}
      onDelete={vi.fn()}
    />,
  );
  return { onStatusChange, onSubmit, onReconcile };
}

describe('PurchaseOrderTable', () => {
  it('routes pending→ordered through submit instead of generic updateStatus', () => {
    const { onStatusChange, onSubmit } = renderTable();

    fireEvent.click(screen.getByRole('button', { name: '발주확정' }));

    expect(onSubmit).toHaveBeenCalledWith('po-1');
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('shows ambiguous provider state and explicit reconciliation outcomes', () => {
    const { onReconcile } = renderTable({
      orders: [order({
        latestSubmissionAttempt: {
          id: 'attempt-1',
          idempotencyKey: 'submit-1',
          status: 'provider_unknown',
          providerReference: null,
          errorCode: 'provider_response_unknown',
          errorMessage: 'timeout',
          reconciliationOutcome: null,
          reconciledAt: null,
          createdAt: '2026-07-16T00:00:00.000Z',
          updatedAt: '2026-07-16T00:00:00.000Z',
        },
      })],
    });

    expect(screen.getByText('외부 주문 생성됨 · 반영 확인 필요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '외부 주문 확인' }));
    fireEvent.click(screen.getByRole('button', { name: '외부 주문 없음' }));

    expect(onReconcile).toHaveBeenNthCalledWith(1, 'po-1', 'provider_succeeded');
    expect(onReconcile).toHaveBeenNthCalledWith(2, 'po-1', 'provider_failed');
  });

  it('allows a clear provider failure to be reconciled before a caller starts a new attempt', () => {
    const { onReconcile } = renderTable({
      orders: [order({
        latestSubmissionAttempt: {
          id: 'attempt-1',
          idempotencyKey: 'submit-1',
          status: 'provider_failed',
          providerReference: null,
          errorCode: 'provider_rejected',
          errorMessage: 'status 422',
          reconciliationOutcome: null,
          reconciledAt: null,
          createdAt: '2026-07-16T00:00:00.000Z',
          updatedAt: '2026-07-16T00:00:00.000Z',
        },
      })],
    });

    expect(screen.getByText('외부 주문 실패 · 재시도 전 확인 필요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '외부 주문 없음' }));
    expect(onReconcile).toHaveBeenCalledWith('po-1', 'provider_failed');
    expect(screen.queryByRole('button', { name: '발주확정' })).not.toBeInTheDocument();
  });
});
