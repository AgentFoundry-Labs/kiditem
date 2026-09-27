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
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));
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
// 대표이미지 몰 반영 = 등록 실행 thumbnail_update(KID-364). 확장은 operation.start로 시작하고, 웹은 실행을 읽어 기다린다.
const NEXT = '00000000-0000-4000-8000-0000000000e2';
const operation = (id: string, patch: Record<string, unknown> = {}) => ({ operation: {
  id, kind: 'channels.registration', status: 'reconciling', lockKeys: [],
  plan: { executionKind: 'thumbnail_update', salesProductId: SP1, channelListingId: null, externalListingId: 'MALL-7' },
  progress: null, result: null, window: null, errorCode: null, errorMessage: null, startedAt: '2026-09-27T09:00:00.000Z',
  finishedAt: null, expiresAt: '2026-09-27T09:30:00.000Z', attempts: 1, maxAttempts: 1, scheduledFor: null, ...patch,
} });
function extensionStarts(reply: Record<string, unknown> = { success: true, operationId: NEXT, reused: false }) {
  const starts: Array<Record<string, unknown>> = [];
  vi.mocked(detectExtensionId).mockResolvedValue('extension-1');
  vi.mocked(sendToExtension).mockImplementation(async (_id, message) => {
    const body = message as Record<string, unknown>;
    if (body.action === 'ping') {
      return { success: true, capabilities: { operationRuntime: true, channelsRegistrationOperationKindV1: true, 'mallWriteSite.coupang': true } } as never;
    }
    starts.push(body);
    return reply as never;
  });
  return starts;
}
/** 서버 읽기: 썸네일 작업·실행 상태 목록 · 실행 하나 · 저장 자격(없음). */
function serve(statusItems: unknown[], extra: (href: string) => unknown = () => undefined) {
  vi.mocked(apiClient.get).mockImplementation(async (href: string) => {
    const answered = extra(href);
    if (answered !== undefined) return answered;
    if (href.startsWith('/api/ai/thumbnail-jobs')) return jobResponse();
    if (href.startsWith('/api/operations/')) return operation(href.split('/').pop()!);
    if (href.includes('/password')) return { loginId: null, password: null };
    return { items: statusItems };
  });
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return render(<RegistrationPendingSection />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  serve([executionStatus({ error: 'port closed' })]);
});
afterEach(cleanup);

describe('RegistrationPendingSection checking actions', () => {
  it('shows the failure of the adopted candidate without a local clear — the failed run lives in /mall-tasks', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (href: string) => {
      if (href.startsWith('/api/ai/thumbnail-jobs')) return jobResponse();
      return { items: [executionStatus({ status: 'failed', providerOutcome: 'definitive_failure', error: '로그인 필요' })] };
    });
    renderSection();

    expect(await screen.findByText('등록 실패')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '에러 지우기' })).toBeNull();
    expect(screen.queryByRole('button', { name: /초기화/ })).toBeNull();
    expect(apiClient.delete).not.toHaveBeenCalled();
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

  it('marks an unknown outcome as not applied by closing the same operation', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(operation(EXECUTION, { status: 'failed' }));
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: '반영 안 됨으로 표시' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      `/api/channels/registration-operations/${EXECUTION}/close`,
      { reason: '운영자가 몰에서 확인: 반영되지 않음' },
    ));
  });

  it('resends by closing the checking operation and starting one new thumbnail operation — never the same one twice', async () => {
    const starts = extensionStarts();
    vi.mocked(apiClient.post).mockResolvedValue(operation(EXECUTION, { status: 'failed' }));
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: '다시 보내기' }));

    await waitFor(() => expect(starts).toHaveLength(1));
    expect(apiClient.post).toHaveBeenCalledWith(`/api/channels/registration-operations/${EXECUTION}/close`, { reason: '운영자가 다시 보내기로 닫음' });
    expect(starts[0]).toMatchObject({ action: 'operation.start', kind: 'channels.registration', scope: { executionKind: 'thumbnail_update', salesProductId: SP1 } });
  });

  it('records success only when the operator confirms the Wing save', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(operation(EXECUTION, { status: 'succeeded' }));
    renderSection();

    expect(await screen.findByText('Wing 저장 확인 필요')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '반영됨으로 표시' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      `/api/channels/registration-operations/${EXECUTION}/confirm`,
      { externalListingId: 'MALL-7' },
    ));
  });

  it('lets the operator pick one of several Coupang listings in the batch result and upload with it', async () => {
    serve([], (href) => (href.includes('listing-choices')
      ? { items: [{ channelListingId: '00000000-0000-4000-8000-0000000000a2', channelName: 'B', channelAccountName: 'Wing', externalId: '2' }] }
      : undefined));
    const starts = extensionStarts({ success: false, errorCode: 'ambiguous_listing', error: '리스팅이 여럿입니다 — 하나를 고르세요' });
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: '쿠팡 등록 선택' }));
    fireEvent.click(screen.getByRole('button', { name: /선택 1장 쿠팡 등록/ }));

    expect(await screen.findByRole('combobox', { name: '올릴 리스팅' })).toBeTruthy();
    expect(starts).toHaveLength(1);
  });

  it('counts a batch upload as uploaded, never as success', async () => {
    serve([]);
    const starts = extensionStarts();
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: '쿠팡 등록 선택' }));
    fireEvent.click(screen.getByRole('button', { name: /선택 1장 쿠팡 등록/ }));

    const title = await screen.findByText(/배치 완료/);
    expect(title.textContent).toContain('올림 1');
    expect(title.textContent).not.toContain('성공');
    expect(starts[0]).toMatchObject({ scope: { executionKind: 'thumbnail_update', salesProductId: SP1, assetId: A1 } });
  });
});
