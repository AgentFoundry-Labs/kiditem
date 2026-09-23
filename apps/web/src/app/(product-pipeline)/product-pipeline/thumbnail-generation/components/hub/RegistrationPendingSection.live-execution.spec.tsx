import type { ReactNode } from 'react';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { useWingUploadAndApply } from '../../../_shared/hooks/useThumbnailGenerations';
import { RegistrationPendingSection } from './RegistrationPendingSection';

// 서버 API 와 확장은 웹의 외부 경계라 그 둘만 바꾼다. 서버 상태는 아래 두 변수가 흉내 낸다.
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('@/lib/extension-bridge', () => ({ detectExtensionId: vi.fn(), sendToExtension: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const G1 = '00000000-0000-4000-8000-000000000001';
const EXECUTION = '00000000-0000-4000-8000-0000000000e1';
const server = { phase: 'ready' as 'ready' | 'applied', execution: null as null | { status: string } };
const generation = () => ({
  id: G1, contentWorkspaceId: 'w', originalUrl: null, candidates: [], selectedUrl: 'http://storage.local/a.png', status: 'succeeded',
  phase: server.phase, grade: 'A', score: 90, method: 'edit', editAnalysis: null, createdAt: '2026-09-23T00:00:00.000Z',
  contentWorkspace: { id: 'w', name: '곰돌이 우산', imageUrl: null, coupangProductId: null, category: null },
});

function wrapperWith(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  server.phase = 'ready';
  server.execution = null;
  vi.mocked(apiClient.get).mockImplementation(async (href: string) => {
    if (href.startsWith('/api/thumbnail-analysis/generations')) return { items: [generation()], total: 1 };
    return { items: server.execution ? [{ generationId: G1, executionId: EXECUTION, status: server.execution.status, providerOutcome: 'uncertain', checkedAt: null, error: null, screenshotPath: null }] : [] };
  });
  vi.mocked(apiClient.put).mockImplementation(async (href: string) => {
    if (href === `/api/thumbnail-analysis/generations/${G1}/apply`) server.phase = 'applied';
    return {};
  });
  vi.mocked(apiClient.post).mockImplementation(async (href: string) => {
    if (href === '/api/channels/thumbnail-executions') {
      server.execution = { status: 'executing' };
      return { executionId: EXECUTION, generationId: G1, productName: '곰돌이 우산', image: { dataUrl: 'data:image/png;base64,AA==', filename: 'a.png', mimeType: 'image/png' } };
    }
    server.execution = { status: 'reconciling' };
    return { generationId: G1, executionId: EXECUTION, success: false, status: 'reconciling', screenshotPath: null };
  });
  vi.mocked(detectExtensionId).mockResolvedValue('extension-1');
  vi.mocked(sendToExtension).mockResolvedValue({ success: true });
});
afterEach(cleanup);

describe('a live Wing thumbnail execution always has a screen', () => {
  it('applies the generation after an editor upload, so the pending hub lists it with its exits', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const upload = renderHook(() => useWingUploadAndApply(), { wrapper: wrapperWith(client) });

    await act(async () => { await upload.result.current.mutateAsync(G1); });
    expect(apiClient.put).toHaveBeenCalledWith(`/api/thumbnail-analysis/generations/${G1}/apply`, {});

    render(<RegistrationPendingSection />, { wrapper: wrapperWith(client) });
    expect(await screen.findByRole('button', { name: '반영됨으로 표시' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 보내기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '반영 안 됨으로 표시' })).toBeTruthy();
  });

  it('lists a generation with a live execution even when Content never applied it (the Agent path)', async () => {
    server.execution = { status: 'reconciling' };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<RegistrationPendingSection />, { wrapper: wrapperWith(client) });

    expect(await screen.findByRole('button', { name: '반영 안 됨으로 표시' })).toBeTruthy();
    await waitFor(() => expect(vi.mocked(apiClient.get).mock.calls.some(([href]) => href === `/api/channels/thumbnail-executions?generationIds=${G1}`)).toBe(true));
  });
});
