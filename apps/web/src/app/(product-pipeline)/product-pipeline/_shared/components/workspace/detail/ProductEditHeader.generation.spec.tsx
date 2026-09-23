import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductEditHeader from './ProductEditHeader';

// 네트워크(apiClient)만 막는다 — 생성 훅은 진짜 것이 요청을 만든다.
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderHeader(props: { contentWorkspaceId: string | null; sourceCandidateId: string | null }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProductEditHeader
        productName="자석 다트게임"
        productId="sales-product-1"
        salesProductId="sales-product-1"
        sourceCandidateId={props.sourceCandidateId}
        detailGenerationContentWorkspaceId={props.contentWorkspaceId}
        rawData={{ title: '자석 다트게임' }}
        imageUrls={['https://cdn.example.com/a.jpg']}
        isEditComplete={false}
        isLocked={false}
        onToggleEditComplete={vi.fn()}
        onToggleLocked={vi.fn()}
        onBack={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

function generateRequests() {
  return api.post.mock.calls.filter(([url]) => url === '/api/ai/detail-page/generate');
}

describe('ProductEditHeader 상세페이지 생성', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue([]);
    api.post.mockResolvedValue({ id: 'generation-1', imageProcessingStatus: 'pending' });
  });

  it('sends the sales-product draft so a first generation lands in the draft’s workspace (A5)', async () => {
    renderHeader({ contentWorkspaceId: null, sourceCandidateId: 'candidate-1' });

    fireEvent.click(screen.getByRole('button', { name: /상세페이지 생성/ }));
    fireEvent.click(await screen.findByRole('button', { name: /생성 시작/ }));

    await waitFor(() => expect(generateRequests()).toHaveLength(1));
    const body = generateRequests()[0]![1] as Record<string, unknown>;
    expect(body.salesProductId).toBe('sales-product-1');
    expect(body.contentWorkspaceId).toBeUndefined();
    expect(body.productId).toBeUndefined();
    // 원천 기록은 생성 입력의 출처로만 싣는다.
    expect(body.sourceReferences).toEqual([{ sourceType: 'sourcing_candidate', sourceCandidateId: 'candidate-1' }]);
  });

  it('keeps an existing workspace and sends no source reference for a draft without a source record', async () => {
    renderHeader({ contentWorkspaceId: '44444444-4444-4444-8444-444444444444', sourceCandidateId: null });

    fireEvent.click(screen.getByRole('button', { name: /상세페이지 생성/ }));
    fireEvent.click(await screen.findByRole('button', { name: /생성 시작/ }));

    await waitFor(() => expect(generateRequests()).toHaveLength(1));
    const body = generateRequests()[0]![1] as Record<string, unknown>;
    expect(body.salesProductId).toBe('sales-product-1');
    expect(body.contentWorkspaceId).toBe('44444444-4444-4444-8444-444444444444');
    expect(body).not.toHaveProperty('sourceReferences');
  });

  it('never lists detail pages by a candidate id, and without a workspace it lists nothing', async () => {
    renderHeader({ contentWorkspaceId: null, sourceCandidateId: 'candidate-1' });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.get.mock.calls.filter(([url]) => String(url).startsWith('/api/ai/detail-page'))).toEqual([]);
  });
});
