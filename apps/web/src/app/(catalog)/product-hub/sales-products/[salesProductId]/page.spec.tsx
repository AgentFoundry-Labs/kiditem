import { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { salesProductDraft } from '@/test/fixtures/sales-product-draft';
import SalesProductEditorPage from './page';

const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), replaceOptions: vi.fn() }));

vi.mock('@/lib/sales-product-api', () => ({
  salesProductKeys: { all: ['sales-products'], detail: (id: string) => ['sales-products', 'detail', id] },
  salesProductApi: api,
}));
vi.mock('../components/ChannelListingsSection', () => ({ ChannelListingsSection: () => null }));
vi.mock('../components/ChannelOverridesSection', () => ({ ChannelOverridesSection: () => null }));
vi.mock('../components/ContentDetailSection', () => ({ ContentDetailSection: () => null }));
vi.mock('../components/OptionTableEditor', () => ({ OptionTableEditor: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

async function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const params = Promise.resolve({ salesProductId: 'sp-1' });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <Suspense fallback={null}>
          <SalesProductEditorPage params={params} />
        </Suspense>
      </QueryClientProvider>,
    );
  });
}

describe('판매상품 편집 — KC 인증 상태(KID-310 c)', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.update.mockReset();
    api.get.mockResolvedValue(salesProductDraft({ id: 'sp-1', kcStatus: 'unknown', version: 4 }));
    api.update.mockImplementation(async (_id: string, body: Record<string, unknown>) =>
      salesProductDraft({ id: 'sp-1', kcStatus: body.kcStatus as 'exists', version: 5 }));
  });

  it('edits the KC status with the same choices as the workspace basics and saves only that change', async () => {
    await renderEditor();

    const select = await screen.findByLabelText('KC 인증 상태');
    expect(select).toHaveValue('');
    expect(screen.getByRole('option', { name: '확인 필요' })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'exists' } });
    fireEvent.click(screen.getByRole('button', { name: /저장/ }));

    await waitFor(() => expect(api.update).toHaveBeenCalledWith('sp-1', { kcStatus: 'exists', expectedVersion: 4 }));
  });
});
