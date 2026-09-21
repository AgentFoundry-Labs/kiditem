import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { ProductEditorDialog } from './ProductEditorDialog';

vi.mock('@/lib/api-client', () => ({ apiClient: { post: vi.fn(), patch: vi.fn() } }));
const product = { id: '11111111-1111-4111-8111-111111111111', code: 'KID00000001', name: '원천 상품', imageUrls: [] as string[] };

function show() {
  const onSaved = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    <ProductEditorDialog open onOpenChange={vi.fn()} onSaved={onSaved} product={product} />
  </QueryClientProvider>);
  return onSaved;
}

describe('source product image editing', () => {
  beforeEach(() => vi.clearAllMocks());
  it('only submits operator images and displays the immutable KID code', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ id: product.id });
    const onSaved = show();
    expect(screen.getByText(/KID00000001/)).toBeInTheDocument();
    for (const label of ['상품 코드', '상품명', '카테고리', '브랜드', '태그', '설명', '판매 활성', '광고 예산 한도']) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
    fireEvent.change(screen.getByLabelText('이미지 URL'), { target: { value: 'https://example.test/a.png' } });
    fireEvent.click(screen.getByRole('button', { name: '이미지 저장' }));
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith(`/api/products/masters/${product.id}`, { imageUrls: ['https://example.test/a.png'] }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(product.id));
    expect(apiClient.post).not.toHaveBeenCalled();
  });
  it('allows clearing operator images', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ id: product.id });
    show();
    fireEvent.click(screen.getByRole('button', { name: '이미지 저장' }));
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith(`/api/products/masters/${product.id}`, { imageUrls: [] }));
  });
});
