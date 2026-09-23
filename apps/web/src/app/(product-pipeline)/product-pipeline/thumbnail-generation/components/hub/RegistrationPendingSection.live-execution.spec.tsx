import type { ReactNode } from 'react';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { useAdoptAndUploadThumbnail } from '../../../_shared/hooks/useRepresentativeImage';
import { RegistrationPendingSection } from './RegistrationPendingSection';

// 서버 API 와 확장은 웹의 외부 경계라 그 둘만 바꾼다. 서버 상태는 아래 두 변수가 흉내 낸다.
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('@/lib/extension-bridge', () => ({ detectExtensionId: vi.fn(), sendToExtension: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const G1 = '00000000-0000-4000-8000-000000000001';
const SP1 = '00000000-0000-4000-8000-0000000000c1';
const A1 = '00000000-0000-4000-8000-0000000000b1';
const EXECUTION = '00000000-0000-4000-8000-0000000000e1';
const server = { adopted: false, execution: null as null | { status: string } };
const jobResponse = () => ({
  items: [{ id: G1, contentWorkspaceId: 'w', status: 'succeeded', method: 'edit', prompt: null, errorMessage: null, attemptCount: 1, createdAt: '2026-09-23T00:00:00.000Z', updatedAt: '2026-09-23T00:00:00.000Z' }],
  candidates: [{
    id: A1, contentWorkspaceId: 'w', source: 'ai', role: 'thumbnail', url: 'http://storage.local/a.png', label: null, sortOrder: 0,
    width: null, height: null, thumbnailGenerationId: G1, isCurrentThumbnail: server.adopted, createdAt: '2026-09-23T00:00:00.000Z',
  }],
  workspaces: [{ id: 'w', salesProductId: SP1, name: '곰돌이 우산', imageUrl: null }],
  total: 1,
});

function wrapperWith(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  server.adopted = false;
  server.execution = null;
  vi.mocked(apiClient.get).mockImplementation(async (href: string) => {
    if (href.startsWith('/api/ai/thumbnail-jobs')) return jobResponse();
    return { items: server.execution ? [{ salesProductId: SP1, assetId: A1, executionId: EXECUTION, status: server.execution.status, providerOutcome: 'uncertain', checkedAt: null, error: null, screenshotPath: null }] : [] };
  });
  vi.mocked(apiClient.patch).mockImplementation(async (href: string) => {
    if (href === '/api/ai/content-workspaces/w/current-thumbnail') server.adopted = true;
    return {};
  });
  vi.mocked(apiClient.post).mockImplementation(async (href: string) => {
    if (href === '/api/channels/thumbnail-executions') {
      server.execution = { status: 'executing' };
      return { executionId: EXECUTION, salesProductId: SP1, assetId: A1, productName: '곰돌이 우산', image: { dataUrl: 'data:image/png;base64,AA==', filename: 'a.png', mimeType: 'image/png' } };
    }
    server.execution = { status: 'reconciling' };
    return { salesProductId: SP1, assetId: A1, executionId: EXECUTION, success: false, status: 'reconciling', screenshotPath: null };
  });
  vi.mocked(detectExtensionId).mockResolvedValue('extension-1');
  vi.mocked(sendToExtension).mockResolvedValue({ success: true });
});
afterEach(cleanup);

describe('a live Wing thumbnail execution always has a screen', () => {
  it('adopts the candidate before an editor upload, so the pending hub lists it with its exits', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const upload = renderHook(() => useAdoptAndUploadThumbnail(), { wrapper: wrapperWith(client) });

    await act(async () => { await upload.result.current.mutateAsync({ contentWorkspaceId: 'w', salesProductId: SP1, assetId: A1 }); });
    expect(apiClient.patch).toHaveBeenCalledWith('/api/ai/content-workspaces/w/current-thumbnail', { assetId: A1 });
    expect(apiClient.post).toHaveBeenCalledWith('/api/channels/thumbnail-executions', { salesProductId: SP1, assetId: A1 });

    render(<RegistrationPendingSection />, { wrapper: wrapperWith(client) });
    expect(await screen.findByRole('button', { name: '반영됨으로 표시' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 보내기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '반영 안 됨으로 표시' })).toBeTruthy();
  });

  it('lists a job with a live execution of its candidate even when the candidate was never adopted (the Agent path)', async () => {
    server.execution = { status: 'reconciling' };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<RegistrationPendingSection />, { wrapper: wrapperWith(client) });

    expect(await screen.findByRole('button', { name: '반영 안 됨으로 표시' })).toBeTruthy();
    await waitFor(() => expect(vi.mocked(apiClient.get).mock.calls.some(([href]) => href === `/api/channels/thumbnail-executions?salesProductIds=${SP1}`)).toBe(true));
  });
});
