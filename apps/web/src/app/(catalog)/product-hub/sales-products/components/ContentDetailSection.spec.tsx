import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contentWorkspacesApi } from '@/app/(product-pipeline)/product-pipeline/_shared/lib/content-workspaces-api';
import { ContentDetailSection } from './ContentDetailSection';

vi.mock('@/app/(product-pipeline)/product-pipeline/_shared/lib/content-workspaces-api', () => ({
  contentWorkspacesApi: {
    getForSalesProduct: vi.fn(), createManualDetailPage: vi.fn(), selectCurrentDetailPage: vi.fn(), getDetailPageRevisions: vi.fn(),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const workspaceWithoutDetail = {
  id: 'workspace', salesProductId: 'product', currentDetailPageId: null, currentDetailPageRevisionId: null, history: [],
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
      workspaceId: 'workspace', revisionId: 'revision', detailPageId: 'detail-page',
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

describe('ContentDetailSection with detail pages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads and saves the current detail page by its id, shows its revision history, and switches the current page by detail page id', async () => {
    vi.mocked(contentWorkspacesApi.getForSalesProduct).mockResolvedValue({
      id: 'workspace', salesProductId: 'product', currentDetailPageId: 'page-a', currentDetailPageRevisionId: 'rev-a2',
      history: [
        { id: 'page-a', source: 'generated', title: '말랑 장화', currentRevisionId: 'rev-a2', createdAt: '2026-09-20T00:00:00.000Z' },
        { id: 'page-b', source: 'imported', title: null, currentRevisionId: 'rev-b1', createdAt: '2026-09-21T00:00:00.000Z' },
        { id: 'page-c', source: 'generated', title: '아직 저장 전', currentRevisionId: null, createdAt: '2026-09-22T00:00:00.000Z' },
      ],
    } as never);
    vi.mocked(contentWorkspacesApi.getDetailPageRevisions).mockResolvedValue({
      id: 'page-a', source: 'generated', revisions: [{ revisionType: 'manual_edit' }, { revisionType: 'generated' }],
    } as never);
    vi.mocked(contentWorkspacesApi.selectCurrentDetailPage).mockResolvedValue({} as never);
    const get = vi.spyOn((await import('@/lib/api-client')).apiClient, 'get').mockResolvedValue({ html: '<p>현재 상세</p>', savedAt: null });
    mount();

    expect(await screen.findByDisplayValue('<p>현재 상세</p>')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/api/ai/detail-page/page-a/edited-html');
    expect(await screen.findByText(/이력 2개/)).toHaveTextContent('AI 생성 · 이력 2개 (편집 ← 생성)');
    const picker = screen.getByRole('combobox');
    expect([...picker.querySelectorAll('option')].map((option) => option.value)).toEqual(['page-a', 'page-b']);
    fireEvent.change(picker, { target: { value: 'page-b' } });

    await waitFor(() => expect(contentWorkspacesApi.selectCurrentDetailPage).toHaveBeenCalledWith('workspace', 'page-b'));
  });
});
