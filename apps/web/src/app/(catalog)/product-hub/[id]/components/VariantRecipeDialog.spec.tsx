import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { VariantRecipeDialog } from './VariantRecipeDialog';

vi.mock('@/lib/api-client', () => ({
  apiClient: { getParsed: vi.fn(), put: vi.fn() },
}));

describe('<VariantRecipeDialog>', () => {
  it('searches confirmed inventory identities and keeps the selected recipe row stable', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.getParsed).mockResolvedValue({
      items: [{
        sellpiaInventorySkuId: '44444444-4444-4444-8444-444444444444',
        code: 'SP-100',
        name: '블록 본품',
        optionName: '분홍',
        barcode: null,
        currentStock: 6,
      }],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <VariantRecipeDialog
          open
          onOpenChange={vi.fn()}
          variant={{
            id: '22222222-2222-4222-8222-222222222222',
            code: 'KI-100',
            name: '기본 옵션',
            optionLabel: null,
            isDefault: true,
            isActive: true,
            capacity: null,
            warningState: 'configuration_required',
            components: [],
          }}
        />
      </QueryClientProvider>,
    );

    const search = await screen.findByLabelText('Sellpia 재고 SKU 검색');
    await user.type(search, 'SP-100');
    expect(search).toHaveValue('SP-100');
    expect(search).toHaveFocus();
    expect(await screen.findByText('SP-100 · 블록 본품')).toBeInTheDocument();
    expect(screen.getByText('분홍 · 재고 6')).toBeInTheDocument();
    expect(apiClient.getParsed).toHaveBeenLastCalledWith(
      '/api/products/recipe-component-candidates?search=SP-100&limit=20',
      expect.anything(),
    );

    await user.click(screen.getByRole('button', { name: 'SP-100 구성품 추가' }));
    const quantity = screen.getByLabelText('SP-100 필요 수량');
    expect(screen.getAllByLabelText('SP-100 필요 수량')).toHaveLength(1);
    expect(quantity).toHaveValue(null);
    expect(quantity).toBeRequired();
    expect(screen.getByRole('button', { name: '전체 레시피 저장' })).toBeDisabled();
    expect(apiClient.put).not.toHaveBeenCalled();
    await user.type(quantity, '0');
    expect(screen.getByRole('button', { name: '전체 레시피 저장' })).toBeDisabled();
    await user.clear(quantity);
    await user.type(quantity, '1.5');
    expect(screen.getByRole('button', { name: '전체 레시피 저장' })).toBeDisabled();
    await user.clear(quantity);
    await user.type(quantity, '12');
    expect(quantity).toHaveValue(12);
    expect(quantity).toHaveFocus();
    expect(screen.getByRole('button', { name: '전체 레시피 저장' })).toBeEnabled();
    expect(screen.queryByLabelText(/Sellpia SKU ID/)).not.toBeInTheDocument();
  });

  it('prefills a deep-link search without adding a draft component', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue({ items: [] });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <VariantRecipeDialog open initialInventorySearch="SP-77" onOpenChange={vi.fn()} variant={{ id: '22222222-2222-4222-8222-222222222222', code: 'KI-1', name: '옵션', optionLabel: null, isDefault: true, isActive: true, capacity: null, warningState: 'configuration_required', components: [] }} />
    </QueryClientProvider>);
    expect(screen.getByLabelText('Sellpia 재고 SKU 검색')).toHaveValue('SP-77');
    expect(screen.queryByLabelText(/필요 수량/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '전체 레시피 저장' })).toBeEnabled();
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and asks for a reload after a stale 409', async () => {
    vi.mocked(apiClient.put).mockRejectedValue(new ApiError(409, null, 'changed'));
    const onOpenChange = vi.fn();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <VariantRecipeDialog open onOpenChange={onOpenChange} variant={{ id: '22222222-2222-4222-8222-222222222222', code: 'KI-1', name: '옵션', optionLabel: null, isDefault: true, isActive: true, capacity: 1, warningState: 'none', components: [{ id: '33333333-3333-4333-8333-333333333333', sellpiaInventorySkuId: '44444444-4444-4444-8444-444444444444', code: 'SP-1', name: '본품', optionName: null, barcode: null, currentStock: 1, isActive: true, quantity: 1, source: 'manual', confirmedBy: null, confirmedAt: '2026-07-16T00:00:00.000Z' }] }} />
    </QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: '전체 레시피 저장' }));
    expect(await screen.findByText(/다른 운영자가 레시피를 변경했습니다/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('replaces the complete central variant recipe atomically', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue({ items: [] });
    vi.mocked(apiClient.put).mockResolvedValue({ id: 'variant-1' });
    const onOpenChange = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(
      <QueryClientProvider client={client}>
        <VariantRecipeDialog
          open
          onOpenChange={onOpenChange}
          variant={{
            id: '22222222-2222-4222-8222-222222222222',
            code: 'KI-100',
            name: '기본 옵션',
            optionLabel: null,
            isDefault: true,
            isActive: true,
            capacity: 3,
            warningState: 'none',
            components: [{
              id: '33333333-3333-4333-8333-333333333333',
              sellpiaInventorySkuId: '44444444-4444-4444-8444-444444444444',
              code: 'SP-100',
              name: '블록 본품',
              optionName: null,
              barcode: null,
              currentStock: 6,
              isActive: true,
              quantity: 2,
              source: 'manual',
              confirmedBy: null,
              confirmedAt: '2026-07-16T00:00:00.000Z',
            }],
          }}
        />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText('SP-100 필요 수량'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: '전체 레시피 저장' }));

    await waitFor(() => expect(apiClient.put).toHaveBeenCalledWith(
      '/api/products/variants/22222222-2222-4222-8222-222222222222/components',
      {
        components: [{ sellpiaInventorySkuId: '44444444-4444-4444-8444-444444444444', quantity: 3 }],
        expectedRecipe: [{
          id: '33333333-3333-4333-8333-333333333333',
          sellpiaInventorySkuId: '44444444-4444-4444-8444-444444444444',
          quantity: 2,
          source: 'manual',
          confirmedBy: null,
          confirmedAt: '2026-07-16T00:00:00.000Z',
        }],
      },
    ));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['products', 'operations'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['channelProductMappings'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['channelSkuAvailability'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory'] });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
