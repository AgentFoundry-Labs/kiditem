import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { RegistrationPendingSection } from './RegistrationPendingSection';

// 서버 API 와 확장은 웹의 외부 경계라 그 둘만 바꾼다.
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('@/lib/extension-bridge', () => ({ detectExtensionId: vi.fn(), sendToExtension: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const G1 = '00000000-0000-4000-8000-000000000001';
const EXECUTION = '00000000-0000-4000-8000-0000000000e1';
const generation = {
  id: G1, contentWorkspaceId: 'w', originalUrl: null, candidates: [], selectedUrl: 'http://storage.local/a.png', status: 'succeeded',
  phase: 'applied', grade: 'A', score: 90, method: 'edit', editAnalysis: null, createdAt: '2026-09-23T00:00:00.000Z',
  contentWorkspace: { id: 'w', name: '곰돌이 우산', imageUrl: null, coupangProductId: null, category: null },
};

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return render(<RegistrationPendingSection />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockImplementation(async (href: string) => {
    if (href.startsWith('/api/thumbnail-analysis/generations')) return { items: [generation], total: 1 };
    return { items: [{ generationId: G1, executionId: EXECUTION, status: 'reconciling', providerOutcome: 'uncertain', checkedAt: null, error: 'port closed', screenshotPath: null }] };
  });
});
afterEach(cleanup);

describe('RegistrationPendingSection checking actions', () => {
  it('marks an unknown outcome as not applied on the same execution', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ generationId: G1, executionId: EXECUTION, success: false, screenshotPath: null });
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: '반영 안 됨으로 표시' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(`/api/channels/thumbnail-executions/${EXECUTION}/not-applied`, {}));
  });

  it('resends the same execution to the extension and reports on it', async () => {
    vi.mocked(detectExtensionId).mockResolvedValue('extension-1');
    vi.mocked(sendToExtension).mockResolvedValue({ success: true });
    vi.mocked(apiClient.post).mockImplementation(async (href: string) => (href.endsWith('/resend')
      ? { executionId: EXECUTION, generationId: G1, productName: '곰돌이 우산', image: { dataUrl: 'data:image/png;base64,AA==', filename: 'a.png', mimeType: 'image/png' } }
      : { generationId: G1, executionId: EXECUTION, success: false, status: 'reconciling', screenshotPath: null }));
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: '다시 보내기' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(`/api/channels/thumbnail-executions/${EXECUTION}/report`, { outcome: 'uploaded_pending_save' }));
    expect(apiClient.post).toHaveBeenCalledWith(`/api/channels/thumbnail-executions/${EXECUTION}/resend`, {});
    expect(apiClient.post).not.toHaveBeenCalledWith('/api/channels/thumbnail-executions', expect.anything());
  });

  it('records success only when the operator confirms the Wing save', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ generationId: G1, executionId: EXECUTION, success: true, status: 'succeeded', screenshotPath: null });
    renderSection();

    expect(await screen.findByText('Wing 저장 확인 필요')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '반영됨으로 표시' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(`/api/channels/thumbnail-executions/${EXECUTION}/applied`, {}));
  });
});
