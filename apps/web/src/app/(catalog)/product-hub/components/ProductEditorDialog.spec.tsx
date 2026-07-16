import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { ProductEditorDialog } from './ProductEditorDialog';
import type { MasterProductOperationsMetadata } from '@kiditem/shared/product-operations';

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: vi.fn(), patch: vi.fn() },
}));

describe('<ProductEditorDialog>', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a KidItem product and relies on the backend default variant', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: 'product-1' });
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    renderDialog({ onOpenChange, onSaved });

    fireEvent.change(screen.getByLabelText('상품 코드'), { target: { value: 'KI-100' } });
    fireEvent.change(screen.getByLabelText('상품명'), { target: { value: '동물 친구들 블록' } });
    fireEvent.click(screen.getByRole('button', { name: '상품 만들기' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/products/masters', {
      code: 'KI-100',
      name: '동물 친구들 블록',
      description: null,
      category: null,
      brand: null,
      tags: [],
      imageUrls: [],
      abcGrade: null,
      profitTag: null,
      adTier: null,
      adBudgetLimit: null,
      healthScore: null,
      isActive: true,
    }));
    expect(onSaved).toHaveBeenCalledWith('product-1');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows the channel product number without exposing the internal CP code', () => {
    renderDialog({
      onOpenChange: vi.fn(),
      onSaved: vi.fn(),
      product: {
        id: '11111111-1111-4111-8111-111111111111',
        code: 'CP-11111111-1111-4111-8111-111111111111',
        displayReference: {
          type: 'channel_product',
          label: 'Coupang Wing 상품번호',
          value: '13712531060',
        },
        name: '채널 원본 상품',
        description: null,
        category: null,
        brand: null,
        tags: [],
        imageUrls: [],
        abcGrade: null,
        profitTag: null,
        adTier: null,
        adBudgetLimit: null,
        healthScore: null,
        healthUpdatedAt: null,
        isActive: true,
      },
    });

    expect(screen.getByText('Coupang Wing 상품번호')).toBeInTheDocument();
    expect(screen.getByText('13712531060')).toBeInTheDocument();
    expect(screen.queryByLabelText('상품 코드')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(/CP-/)).not.toBeInTheDocument();
  });
});

function renderDialog(props: {
  onOpenChange: (open: boolean) => void;
  onSaved: (id: string) => void;
  product?: MasterProductOperationsMetadata;
}) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProductEditorDialog
        open
        onOpenChange={props.onOpenChange}
        onSaved={props.onSaved}
        product={props.product}
      />
    </QueryClientProvider>,
  );
}
