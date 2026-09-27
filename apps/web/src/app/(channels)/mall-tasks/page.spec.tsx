import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import MallTasksPage from './page';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const operation = (id: string, status: string, plan: Record<string, unknown>) => ({
  id, kind: 'channels.registration', status, lockKeys: [], plan, progress: null, result: null, window: null,
  errorCode: null, errorMessage: null, startedAt: '2026-09-27T09:00:00.000Z', finishedAt: null,
  expiresAt: '2026-09-27T09:30:00.000Z', attempts: 1, maxAttempts: 1, scheduledFor: null,
});

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockResolvedValue({ operations: [
    operation('11111111-1111-4111-8111-111111111111', 'reconciling', { executionKind: 'register', mallKey: 'art09' }),
    operation('22222222-2222-4222-8222-222222222222', 'executing', { executionKind: 'sold_out', mallKey: 'coupang', payload: { listings: [{}, {}] } }),
  ] });
});
afterEach(cleanup);

describe('/mall-tasks', () => {
  it('⭐ 등록 실행을 조회 하나로 읽어 한 표에 상태로 보이고, 확인 필요는 그 자리에서 닫는다', async () => {
    render(wrap(<MallTasksPage />));

    expect(await screen.findByText('아트공구')).toBeTruthy();
    expect(apiClient.get).toHaveBeenCalledWith('/api/operations?kinds=channels.registration&limit=100');
    expect(screen.getByText('쿠팡 WING')).toBeTruthy();
    expect(screen.getByText('리스팅 2개')).toBeTruthy();
    expect(screen.getByText('진행 중')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '확인 필요' }));
    expect(screen.getByLabelText('등록상품ID')).toBeTruthy();
  });
});
