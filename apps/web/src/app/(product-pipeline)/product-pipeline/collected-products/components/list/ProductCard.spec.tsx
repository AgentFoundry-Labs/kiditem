import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { salesProductDraftListItem, DRAFT_ID } from '@/test/fixtures/sales-product-draft';
import ProductCard from './ProductCard';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));

function renderCard(props: Partial<Parameters<typeof ProductCard>[0]> = {}) {
  return render(
    <ProductCard
      product={salesProductDraftListItem()}
      isProcessing={false}
      isDeleting={false}
      onDelete={vi.fn()}
      onNavigate={vi.fn()}
      onOpenEditor={vi.fn()}
      onOpenQuickProcess={vi.fn()}
      quickProcessSelectedCount={0}
      {...props}
    />,
  );
}

describe('ProductCard', () => {
  it('runs no request of its own — progress comes from the list', () => {
    renderCard();

    expect(apiClient.get).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(screen.queryByText('생성 중')).toBeNull();
  });

  it('opens the quick processing modal with the sales-product draft id', () => {
    const onOpenQuickProcess = vi.fn();
    renderCard({ onOpenQuickProcess, quickProcessSelectedCount: 2 });

    fireEvent.click(screen.getByRole('button', { name: '선택 2개 AI 작업 선택' }));

    expect(onOpenQuickProcess).toHaveBeenCalledWith(DRAFT_ID);
  });

  it('shows 생성 중 and blocks quick processing while a generation the page started runs', () => {
    const onOpenQuickProcess = vi.fn();
    renderCard({ onOpenQuickProcess, isProcessing: true });

    expect(screen.getByText('생성 중')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /처리 중/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onOpenQuickProcess).not.toHaveBeenCalled();
  });
});
