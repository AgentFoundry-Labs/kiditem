import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { RegistrationPendingSection } from './RegistrationPendingSection';

// 서버 API 와 확장은 웹의 외부 경계라 그 둘만 바꾼다.
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('@/lib/extension-bridge', () => ({ detectExtensionId: vi.fn(), sendToExtension: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const G1 = '00000000-0000-4000-8000-000000000001';
const SP1 = '00000000-0000-4000-8000-0000000000c1';
const A1 = '00000000-0000-4000-8000-0000000000b1';
const EXECUTION = '00000000-0000-4000-8000-0000000000e1';
const jobResponse = (items = [{ id: G1, createdAt: '2026-09-23T00:00:00.000Z', assetId: A1 }]) => ({
  items: items.map((item) => ({
    id: item.id, contentWorkspaceId: 'w', status: 'succeeded', method: 'edit', prompt: null, errorMessage: null, attemptCount: 1,
    createdAt: item.createdAt, updatedAt: item.createdAt,
  })),
  candidates: items.map((item) => ({
    id: item.assetId, contentWorkspaceId: 'w', source: 'ai', role: 'thumbnail', url: 'http://storage.local/a.png', label: null, sortOrder: 0,
    width: null, height: null, thumbnailGenerationId: item.id, isCurrentThumbnail: true, createdAt: item.createdAt,
  })),
  workspaces: [{ id: 'w', salesProductId: SP1, name: '곰돌이 우산', imageUrl: null }],
  total: items.length,
});
const executionStatus = (patch: Record<string, unknown>) => ({
  salesProductId: SP1, assetId: A1, executionId: EXECUTION, status: 'reconciling', providerOutcome: 'uncertain', checkedAt: null, error: null, screenshotPath: null, ...patch,
});
const prepared = { executionId: EXECUTION, salesProductId: SP1, assetId: A1, productName: '곰돌이 우산', image: { dataUrl: 'data:image/png;base64,AA==', filename: 'a.png', mimeType: 'image/png' } };
const reported = (patch: Record<string, unknown>) => ({ salesProductId: SP1, assetId: A1, executionId: EXECUTION, success: false, status: 'reconciling', screenshotPath: null, ...patch });

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return render(<RegistrationPendingSection />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockImplementation(async (href: string) => {
    if (href.startsWith('/api/ai/thumbnail-jobs')) return jobResponse();
    return { items: [executionStatus({ error: 'port closed' })] };
  });
});
afterEach(cleanup);

describe('RegistrationPendingSection checking actions', () => {
  it('shows the failure of the adopted candidate and clears it for the sales product', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (href: string) => {
      if (href.startsWith('/api/ai/thumbnail-jobs')) return jobResponse();
      return { items: [executionStatus({ status: 'failed', providerOutcome: 'definitive_failure', error: '로그인 필요' })] };
    });
    vi.mocked(apiClient.delete).mockResolvedValue({ dismissed: true });
    renderSection();

    expect(await screen.findByText('등록 실패')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '에러 지우기' }));

    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith(`/api/channels/thumbnail-executions/failed/${SP1}`));
  });

  it('offers resend and not-applied but no confirmation while the upload itself is still running', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (href: string) => {
      if (href.startsWith('/api/ai/thumbnail-jobs')) return jobResponse();
      return { items: [executionStatus({ status: 'executing' })] };
    });
    renderSection();

    expect(await screen.findByRole('button', { name: '다시 보내기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '반영 안 됨으로 표시' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '반영됨으로 표시' })).toBeNull();
  });

  it('marks an unknown outcome as not applied on the same execution', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(reported({}));
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: '반영 안 됨으로 표시' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(`/api/channels/thumbnail-executions/${EXECUTION}/not-applied`, {}));
  });

  it('resends the same execution to the extension and reports on it', async () => {
    vi.mocked(detectExtensionId).mockResolvedValue('extension-1');
    vi.mocked(sendToExtension).mockResolvedValue({ success: true });
    vi.mocked(apiClient.post).mockImplementation(async (href: string) => (href.endsWith('/resend')
      ? prepared
      : reported({})));
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: '다시 보내기' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(`/api/channels/thumbnail-executions/${EXECUTION}/report`, { outcome: 'uploaded_pending_save' }));
    expect(apiClient.post).toHaveBeenCalledWith(`/api/channels/thumbnail-executions/${EXECUTION}/resend`, {});
    expect(apiClient.post).not.toHaveBeenCalledWith('/api/channels/thumbnail-executions', expect.anything());
  });

  it('records success only when the operator confirms the Wing save', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(reported({ success: true, status: 'succeeded' }));
    renderSection();

    expect(await screen.findByText('Wing 저장 확인 필요')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '반영됨으로 표시' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(`/api/channels/thumbnail-executions/${EXECUTION}/applied`, {}));
  });

  it('lets the operator pick one of several Coupang listings in the batch result and upload with it', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (href: string) => {
      if (href.startsWith('/api/ai/thumbnail-jobs')) return jobResponse();
      if (href.includes('listing-choices')) return { items: [{ channelListingId: '00000000-0000-4000-8000-0000000000a2', channelName: 'B', channelAccountName: 'Wing', externalId: '2' }] };
      return { items: [] };
    });
    vi.mocked(detectExtensionId).mockResolvedValue('extension-1');
    vi.mocked(apiClient.post).mockRejectedValueOnce(new ApiError(400, 'Bad Request', '리스팅이 여럿입니다 — 하나를 고르세요', { reason: 'ambiguous_listing', }));
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: '쿠팡 등록 선택' }));
    fireEvent.click(screen.getByRole('button', { name: /선택 1장 쿠팡 등록/ }));

    expect(await screen.findByRole('combobox', { name: '올릴 리스팅' })).toBeTruthy();
    expect(sendToExtension).not.toHaveBeenCalled();
  });

  it('counts a batch upload as uploaded, never as success', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (href: string) => {
      if (href.startsWith('/api/ai/thumbnail-jobs')) return jobResponse();
      return { items: [] };
    });
    vi.mocked(detectExtensionId).mockResolvedValue('extension-1');
    vi.mocked(sendToExtension).mockResolvedValue({ success: true });
    vi.mocked(apiClient.post).mockImplementation(async (href: string) => (href === '/api/channels/thumbnail-executions'
      ? prepared
      : reported({})));
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: '쿠팡 등록 선택' }));
    fireEvent.click(screen.getByRole('button', { name: /선택 1장 쿠팡 등록/ }));

    const title = await screen.findByText(/배치 완료/);
    expect(title.textContent).toContain('올림 1');
    expect(title.textContent).not.toContain('성공');
    expect(apiClient.post).toHaveBeenCalledWith('/api/channels/thumbnail-executions', { salesProductId: SP1, assetId: A1 });
  });
});
