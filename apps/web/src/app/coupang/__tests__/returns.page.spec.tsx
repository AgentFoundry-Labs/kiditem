import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodError } from 'zod';
import CoupangReturnsPage from '../returns/page';
import { apiClient } from '@/lib/api-client';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/coupang/returns',
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CoupangReturnsPage />
    </QueryClientProvider>,
  );
}

function summaryStub(orphan = 0) {
  return { orderCount: 100, returnCount: 5, returnRate: 0.05, orphanReturnCount: orphan };
}

describe('<CoupangReturnsPage>', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'getParsed').mockReset();
  });

  it('renders skeleton on loading', () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders KPI cards on success', async () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation((path: string) => {
      if (path.startsWith('/api/coupang-dashboard/return-summary')) return Promise.resolve(summaryStub(0));
      if (path.startsWith('/api/coupang-dashboard/return-reasons')) return Promise.resolve([]);
      return Promise.resolve({ customer: 0, vendor: 0 });
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/반품률/)).toBeTruthy();
      // returnCount = 5, formatted via formatNumber — no thousand separator needed at 5
      expect(screen.getByText('5건')).toBeTruthy();
    });
  });

  it('hides orphan badge when orphanReturnCount === 0', async () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation((path: string) => {
      if (path.startsWith('/api/coupang-dashboard/return-summary')) return Promise.resolve(summaryStub(0));
      if (path.startsWith('/api/coupang-dashboard/return-reasons')) return Promise.resolve([]);
      return Promise.resolve({ customer: 0, vendor: 0 });
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/반품률/)).toBeTruthy();
    });
    expect(screen.queryByText(/주문 연결 없는 반품/)).toBeNull();
  });

  it('shows orphan badge with correct count when orphanReturnCount > 0', async () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation((path: string) => {
      if (path.startsWith('/api/coupang-dashboard/return-summary')) return Promise.resolve(summaryStub(3));
      if (path.startsWith('/api/coupang-dashboard/return-reasons')) return Promise.resolve([]);
      return Promise.resolve({ customer: 0, vendor: 0 });
    });
    renderPage();
    await waitFor(() => {
      const badgeLabel = screen.getByText(/주문 연결 없는 반품/);
      expect(badgeLabel).toBeTruthy();
      // Scoped query per v2 A-12: assert count is inside the badge container
      const badge = badgeLabel.closest('div');
      expect(badge?.textContent).toContain('3');
    });
  });

  it('renders error on 502', async () => {
    vi.spyOn(apiClient, 'getParsed').mockRejectedValue(new Error('502 Bad Gateway'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/502 Bad Gateway/)).toBeTruthy();
    });
  });

  it('renders Zod drift message', async () => {
    const zodErr = new ZodError([
      { code: 'invalid_type', expected: 'number', received: 'string', path: ['returnRate'], message: 'x' } as Parameters<typeof ZodError.create>[0][0],
    ]);
    vi.spyOn(apiClient, 'getParsed').mockRejectedValue(zodErr);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/응답 형식 오류/)).toBeTruthy();
    });
  });
});
