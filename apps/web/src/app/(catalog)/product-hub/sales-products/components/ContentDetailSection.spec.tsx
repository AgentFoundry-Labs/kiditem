import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contentWorkspacesApi } from '@/app/(product-pipeline)/product-pipeline/_shared/lib/content-workspaces-api';
import { ContentDetailSection } from './ContentDetailSection';

vi.mock('@/app/(product-pipeline)/product-pipeline/_shared/lib/content-workspaces-api', () => ({
  contentWorkspacesApi: { getForSalesProduct: vi.fn(), createManualDetailPage: vi.fn(), selectCurrentDetailPage: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const workspaceWithoutDetail = {
  id: 'workspace', salesProductId: 'product', currentDetailPageGenerationId: null, currentDetailPageRevisionId: null, history: [],
};

function mount() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ContentDetailSection salesProductId="product" />
  </QueryClientProvider>);
}

describe('ContentDetailSection without a detail page', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lets the operator write the first detail page and saves it through the manual first-detail route', async () => {
    vi.mocked(contentWorkspacesApi.getForSalesProduct).mockResolvedValue(workspaceWithoutDetail as never);
    vi.mocked(contentWorkspacesApi.createManualDetailPage).mockResolvedValue({
      workspaceId: 'workspace', revisionId: 'revision', contentGenerationId: 'generation',
    });
    mount();

    const textarea = await screen.findByRole('textbox', { name: '상세 HTML' });
    const save = screen.getByRole('button', { name: /저장/ });
    expect(save).toBeDisabled();
    fireEvent.change(textarea, { target: { value: '<p>처음 쓴 상세</p>' } });
    fireEvent.click(save);

    await waitFor(() => expect(contentWorkspacesApi.createManualDetailPage).toHaveBeenCalledWith('product', '<p>처음 쓴 상세</p>'));
  });
});
