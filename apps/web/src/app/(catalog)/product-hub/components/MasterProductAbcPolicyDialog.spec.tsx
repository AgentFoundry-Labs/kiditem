import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { MasterProductAbcPolicyDialog } from './MasterProductAbcPolicyDialog';

vi.mock('@/lib/api-client', () => ({
  apiClient: { getParsed: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

describe('MasterProductAbcPolicyDialog', () => {
  it('defaults to gross profit and validates the provisional-to-established month boundary', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue({
      metric: 'GROSS_PROFIT',
      periodDays: 360,
      aCumulativeThreshold: 70,
      bCumulativeThreshold: 90,
      minProvisionalMonths: 3,
      minClassifiedMonths: 6,
      lastCalculatedAt: '2026-08-01T00:00:00.000Z',
      sourceCapturedAt: '2026-07-31T00:00:00.000Z',
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MasterProductAbcPolicyDialog open onOpenChange={() => undefined} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('지표')).toHaveValue('GROSS_PROFIT'));

    expect(screen.getByRole('option', { name: '매출총이익' })).toHaveValue('GROSS_PROFIT');
    expect(screen.getByText(/광고비·마켓 수수료·배송비·반품비는 포함하지 않습니다/)).toBeInTheDocument();
    expect(screen.getByLabelText('예비 등급 시작 완료 월')).toHaveValue(3);
    expect(screen.getByLabelText('정식 등급 시작 완료 월')).toHaveValue(6);
    expect(screen.getByText(/마지막 계산:/)).toBeInTheDocument();
    expect(screen.getByText(/원본 수집:/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('정식 등급 시작 완료 월'), { target: { value: '3' } });

    expect(screen.getByRole('alert')).toHaveTextContent('정식 등급 시작 완료 월은 예비 등급 시작 완료 월보다 커야 합니다.');
    expect(screen.getByRole('button', { name: '저장 후 재계산' })).toBeDisabled();
  });
});
