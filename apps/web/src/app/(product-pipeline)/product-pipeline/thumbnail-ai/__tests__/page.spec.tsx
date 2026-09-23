import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import ThumbnailsPage from '../page';

// 서버 API 는 웹의 외부 경계라 apiClient 만 바꾼다.
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const searchParams = vi.hoisted(() => ({ value: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams.value,
  usePathname: () => '/product-pipeline/thumbnail-ai',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const L1 = '00000000-0000-4000-8000-0000000000d1';
const L2 = '00000000-0000-4000-8000-0000000000d2';
const L3 = '00000000-0000-4000-8000-0000000000d3';
const W1 = '00000000-0000-4000-8000-000000000001';
const J1 = '00000000-0000-4000-8000-0000000000a1';
const A1 = '00000000-0000-4000-8000-0000000000b1';

// 몰이 보고한 대표이미지(imageUrl)와 우리 작업공간의 대표이미지(thumbnailUrl)는 다르다 — 평가는 몰 것을 본다.
const listing = (id: string, listingName: string, imageUrl: string | null) => ({
  id, listingName, imageUrl, thumbnailUrl: `https://cdn/ours-${id.slice(-2)}.png`, detailPageRevisionId: null, channel: 'coupang', channelAccountId: null,
  channelAccountName: '본점', externalId: id.slice(-2), channelName: listingName, category: null, brand: null, manufacturer: null,
  channelPrice: null, salesProductId: null, sourceRecordId: null, contentWorkspaceId: W1, status: 'active', exposureStatus: null, optionCount: 1,
  mappingStatus: 'matched', createdAt: '2026-09-23T00:00:00.000Z', updatedAt: '2026-09-23T00:00:00.000Z',
});

const evaluation = {
  id: '00000000-0000-4000-8000-0000000000f1', channelListingId: L1, imageUrl: 'https://mall/a.jpg', grade: 'C', score: 62,
  details: { suggestions: ['상품을 더 크게'] }, method: 'vision_model', modelId: 'gemini-3.1-flash-lite', evaluatedAt: '2026-09-23T01:00:00.000Z',
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return render(<ThumbnailsPage />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.value = new URLSearchParams();
  vi.mocked(apiClient.get).mockImplementation(async (href: string) => {
    if (href.startsWith('/api/channels/listings')) {
      return { items: [listing(L1, '곰돌이 우산', 'https://mall/a.jpg'), listing(L2, '토끼 컵', 'https://mall/b.jpg'), listing(L3, '사진 없는 컵', null)], total: 3, page: 1, limit: 50, marketCounts: [] };
    }
    if (href.startsWith('/api/thumbnail-analysis/generations')) {
      return {
        items: [{ id: J1, contentWorkspaceId: W1, status: 'succeeded', method: 'edit', prompt: null, errorMessage: null, attemptCount: 1, createdAt: '2026-09-23T00:00:00.000Z', updatedAt: '2026-09-23T00:00:00.000Z' }],
        candidates: [{ id: A1, contentWorkspaceId: W1, source: 'ai', role: 'thumbnail', url: 'https://cdn/a1.png', label: null, sortOrder: 0, width: null, height: null, thumbnailGenerationId: J1, isCurrentThumbnail: false, createdAt: '2026-09-23T00:00:00.000Z' }],
        workspaces: [{ id: W1, salesProductId: null, name: '곰돌이 우산', imageUrl: null }],
        total: 1,
      };
    }
    return { items: [] };
  });
  vi.mocked(apiClient.post).mockImplementation(async (href: string) => {
    if (href === '/api/ai/listing-thumbnails/current') {
      return { evaluations: [evaluation], summary: { evaluated: 1, unevaluated: 1, byGrade: { S: 0, A: 0, B: 0, C: 1, D: 0, F: 0 } } };
    }
    return { evaluation: { ...evaluation, channelListingId: L2, imageUrl: 'https://mall/b.jpg', grade: 'A', score: 88 }, imageSpec: null };
  });
});
afterEach(cleanup);

describe('thumbnail AI page', () => {
  it('has only the listing evaluation and AI edit tabs', async () => {
    renderPage();

    expect(await screen.findByRole('tab', { name: /리스팅 평가/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /AI 편집/ })).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.queryByText(/추적|분석 이력|미분류/)).toBeNull();
  });

  it('reads the evaluation of each listing image the mall shows and its grade summary', async () => {
    renderPage();

    const row = await screen.findByTestId(`listing-evaluation-${L1}`);
    await waitFor(() => expect(within(row).getByText('C')).toBeTruthy());
    expect(within(row).getByText('62점')).toBeTruthy();
    expect(within(screen.getByTestId(`listing-evaluation-${L2}`)).getByText('미평가')).toBeTruthy();
    expect(apiClient.post).toHaveBeenCalledWith('/api/ai/listing-thumbnails/current', {
      listings: [
        { channelListingId: L1, imageUrl: 'https://mall/a.jpg' },
        { channelListingId: L2, imageUrl: 'https://mall/b.jpg' },
        { channelListingId: L3, imageUrl: null },
      ],
    });
  });

  it('cannot evaluate a listing whose mall reported no representative image', async () => {
    renderPage();

    const row = await screen.findByTestId(`listing-evaluation-${L3}`);
    fireEvent.change(screen.getByRole('combobox', { name: '평가 모델' }), { target: { value: 'gemini-3.1-flash-lite' } });
    expect(within(row).getByText('몰 대표이미지 없음')).toBeTruthy();
    expect((within(row).getByRole('button', { name: '평가' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('evaluates a listing image only after the operator picks a model', async () => {
    renderPage();

    const row = await screen.findByTestId(`listing-evaluation-${L2}`);
    const evaluate = within(row).getByRole('button', { name: '평가' });
    expect((evaluate as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByRole('combobox', { name: '평가 모델' }), { target: { value: 'gemini-3.1-flash-lite' } });
    fireEvent.click(within(screen.getByTestId(`listing-evaluation-${L2}`)).getByRole('button', { name: '평가' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(`/api/ai/listing-thumbnails/${L2}/evaluate`, {
      imageUrl: 'https://mall/b.jpg',
      modelId: 'gemini-3.1-flash-lite',
    }));
  });

  it('adopts an AI candidate as the workspace representative image from the AI edit tab', async () => {
    searchParams.value = new URLSearchParams('tab=ai-edit');
    vi.mocked(apiClient.patch).mockResolvedValue({ id: A1, isCurrentThumbnail: true });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '대표이미지로 채택' }));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith(`/api/ai/content-workspaces/${W1}/current-thumbnail`, { assetId: A1 }));
  });
});
