import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodError } from 'zod';
import CoupangOrdersPage from '../orders/page';
import { apiClient } from '@/lib/api-client';

// next/navigation mock — parameterized per test via `navMock.current`
const navMock = {
  current: {
    searchParams: new URLSearchParams(),
    pathname: '/coupang/orders',
  },
};

vi.mock('next/navigation', () => ({
  useSearchParams: () => navMock.current.searchParams,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => navMock.current.pathname,
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CoupangOrdersPage />
    </QueryClientProvider>,
  );
}

const summaryStub = {
  todayOrders: { count: 0, revenue: 0 },
  pendingAccept: 0,
  pendingReturns: 0,
  lastModifiedAt: null,
};

describe('<CoupangOrdersPage>', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'getParsed').mockReset();
    navMock.current = { searchParams: new URLSearchParams(), pathname: '/coupang/orders' };
  });

  it('renders skeleton on loading', () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders successfully on empty response', async () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation((path: string) => {
      if (path === '/api/coupang-dashboard') return Promise.resolve(summaryStub);
      return Promise.resolve([]);
    });
    renderPage();
    await waitFor(() => {
      expect(document.querySelector('.animate-pulse')).toBeFalsy();
    });
  });

  it('renders error state on 502 rejection', async () => {
    vi.spyOn(apiClient, 'getParsed').mockRejectedValue(new Error('502 Bad Gateway'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/502 Bad Gateway/)).toBeTruthy();
    });
  });

  it('renders Zod drift as friendly message', async () => {
    const zodErr = new ZodError([
      { code: 'invalid_type', expected: 'string', received: 'number', path: ['day'], message: 'x' } as Parameters<typeof ZodError.create>[0][0],
    ]);
    vi.spyOn(apiClient, 'getParsed').mockRejectedValue(zodErr);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/응답 형식 오류/)).toBeTruthy();
    });
  });

  it('URL state: ?preset=7 triggers trend query with 7-day from/to', async () => {
    navMock.current = {
      searchParams: new URLSearchParams('preset=7'),
      pathname: '/coupang/orders',
    };

    const getParsed = vi.fn().mockImplementation((path: string) => {
      if (path === '/api/coupang-dashboard') return Promise.resolve(summaryStub);
      return Promise.resolve([]);
    });
    vi.spyOn(apiClient, 'getParsed').mockImplementation(getParsed);

    renderPage();

    await waitFor(() => {
      // Trend + ranking should have fired with from/to ~7 days apart
      const trendCalls = getParsed.mock.calls.filter(([path]) =>
        typeof path === 'string' && path.startsWith('/api/coupang-dashboard/trend'),
      );
      expect(trendCalls.length).toBeGreaterThan(0);

      // Extract the `from` and `to` date params from the URL and verify spread is ~7 days
      const url = trendCalls[0][0] as string;
      const params = new URL(url, 'http://localhost').searchParams;
      const from = params.get('from');
      const to = params.get('to');
      expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      if (from && to) {
        const diffMs = new Date(to).getTime() - new Date(from).getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        expect(diffDays).toBeGreaterThanOrEqual(6.9);
        expect(diffDays).toBeLessThanOrEqual(7.1);
      }
    });
  });
});
