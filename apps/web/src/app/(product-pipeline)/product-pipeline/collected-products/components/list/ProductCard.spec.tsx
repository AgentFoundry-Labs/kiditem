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

function account(state: 'registered' | 'submitting' | 'unregistered', changedSinceRegistration = false) {
  return {
    channelAccountId: '00000000-0000-4000-8000-000000000001',
    channel: 'mall-a',
    channelAccountName: '몰 A',
    registrationTargetId: null,
    channelListingId: null,
    externalListingId: null,
    state,
    soldOut: false,
    changedSinceRegistration,
    selectedThumbnailAssetId: null,
    selectedDetailPageRevisionId: null,
    lastExecution: null,
  };
}

describe('ProductCard', () => {
  it('shows the product registration summary from the accounts the list carries', () => {
    renderCard({
      product: salesProductDraftListItem({
        registrationAccounts: [account('registered', true), account('registered'), account('unregistered')],
      }),
    });

    expect(screen.getByText('2몰 등록 · 1 변경됨')).toBeInTheDocument();
  });

  it('shows no registration badge for a draft with no account yet', () => {
    renderCard({ product: salesProductDraftListItem({ registrationAccounts: [] }) });
    expect(screen.queryByText('미등록')).toBeNull();
  });

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
