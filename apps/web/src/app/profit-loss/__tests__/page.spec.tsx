import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProfitLossPage from '../page';
import { apiClient } from '@/lib/api-client';

// next/navigation mock — the page uses useSearchParams/useRouter/usePathname
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/profit-loss',
}));

function renderWithProvider() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProfitLossPage />
    </QueryClientProvider>,
  );
}

describe('<ProfitLossPage> 3-state', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'getParsed').mockReset();
    // syncInfo query uses apiClient.get — stub to avoid unrelated noise
    vi.spyOn(apiClient, 'get').mockResolvedValue({ lastSyncedAt: null });
  });

  it('renders skeleton on loading', async () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation(() => new Promise(() => {})); // never resolves
    renderWithProvider();
    // PageSkeleton renders outer div with animate-pulse class
    const skeletonMarker = document.querySelector('.animate-pulse');
    expect(skeletonMarker).toBeTruthy();
  });

  it('renders empty state on [] response', async () => {
    vi.spyOn(apiClient, 'getParsed').mockResolvedValue([]);
    renderWithProvider();
    // ProfitLossTable empty-state cell: "해당 기간 데이터가 없습니다."
    await waitFor(() => {
      expect(screen.getByText(/해당 기간 데이터가 없습니다/)).toBeTruthy();
    });
  });

  it('renders error state on rejected promise', async () => {
    vi.spyOn(apiClient, 'getParsed').mockRejectedValue(new Error('502 Bad Gateway'));
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText(/502 Bad Gateway/)).toBeTruthy();
    });
  });

  it('renders Zod schema drift as user-friendly message', async () => {
    // Import ZodError from the same zod as the app
    const { ZodError } = await import('zod');
    // Create a real ZodError so the page's branch picks up "응답 형식 오류"
    const zodErr = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['0', 'listingId'],
        message: 'expected string',
      } as Parameters<typeof ZodError.create>[0][0],
    ]);
    vi.spyOn(apiClient, 'getParsed').mockRejectedValue(zodErr);
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText(/응답 형식 오류/)).toBeTruthy();
    });
  });
});
