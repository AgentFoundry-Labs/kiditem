import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { ListingPicker } from './ListingPicker';

// 서버 API 와 확장은 웹의 외부 경계라 그 둘만 바꾼다.
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('@/lib/extension-bridge', () => ({ detectExtensionId: vi.fn(), sendToExtension: vi.fn() }));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));

const SP1 = '00000000-0000-4000-8000-0000000000c1';
const A1 = '00000000-0000-4000-8000-0000000000b1';
const L1 = '00000000-0000-4000-8000-0000000000a1';
const L2 = '00000000-0000-4000-8000-0000000000a2';
const EXECUTION = '00000000-0000-4000-8000-0000000000e1';
const CHOICES = {
  items: [
    { channelListingId: L1, channelName: '곰돌이 우산 A', channelAccountName: 'Wing 본점', externalId: '1001' },
    { channelListingId: L2, channelName: null, channelAccountName: 'Wing 본점', externalId: '1002' },
  ],
};

/** 대표이미지 반영 = 등록 실행 thumbnail_update(KID-364). 확장 operation.start와 실행 읽기만 흉내 낸다. */
function extensionOperation(status: 'reconciling' | 'failed') {
  const starts: Array<Record<string, unknown>> = [];
  vi.mocked(detectExtensionId).mockResolvedValue('extension-1');
  vi.mocked(sendToExtension).mockImplementation(async (_id, message) => {
    const body = message as Record<string, unknown>;
    if (body.action === 'ping') {
      return { success: true, capabilities: { operationRuntime: true, channelsRegistrationOperationKindV1: true, 'mallWriteSite.coupang': true } } as never;
    }
    starts.push(body);
    return { success: true, operationId: EXECUTION, reused: false } as never;
  });
  vi.mocked(apiClient.get).mockImplementation(async (href: string) => {
    if (href.startsWith('/api/operations/')) {
      return { operation: {
        id: EXECUTION, kind: 'channels.registration', status, lockKeys: [], plan: { executionKind: 'thumbnail_update' },
        progress: null, result: null, window: null, errorCode: status === 'failed' ? 'SITE_LOGIN_REQUIRED' : null, errorMessage: null,
        startedAt: '2026-09-27T09:00:00.000Z', finishedAt: null, expiresAt: '2026-09-27T09:30:00.000Z', attempts: 1, maxAttempts: 1, scheduledFor: null,
      } };
    }
    if (href.includes('/password')) return { loginId: null, password: null };
    return CHOICES;
  });
  return starts;
}

function renderPicker(onDone = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  render(<ListingPicker subject={{ salesProductId: SP1, assetId: A1 }} onDone={onDone} />, { wrapper });
  return onDone;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockResolvedValue(CHOICES);
});
afterEach(cleanup);

it('names no mall in its own copy — the mall comes from each listing row', async () => {
  renderPicker();
  await screen.findByRole('combobox', { name: '올릴 리스팅' });
  const ownCopy = Array.from(document.body.querySelectorAll('button, p')).map((node) => node.textContent).join(' ');
  expect(ownCopy).not.toMatch(/쿠팡|Wing|WING/);
});

describe('ListingPicker', () => {
  it('shows the product listings on channels that take representative images and uploads again with the chosen one', async () => {
    const starts = extensionOperation('reconciling');
    const onDone = renderPicker();

    const select = await screen.findByRole('combobox', { name: '올릴 리스팅' });
    expect(screen.getByRole('option', { name: '곰돌이 우산 A · Wing 본점 · 1001' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '이름 없음 · Wing 본점 · 1002' })).toBeTruthy();
    fireEvent.change(select, { target: { value: L2 } });
    fireEvent.click(screen.getByRole('button', { name: '이 리스팅으로 올리기' }));

    await waitFor(() => expect(starts).toHaveLength(1));
    expect(starts[0]).toMatchObject({
      action: 'operation.start',
      kind: 'channels.registration',
      scope: { executionKind: 'thumbnail_update', salesProductId: SP1, assetId: A1, channelListingId: L2 },
    });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(apiClient.get).toHaveBeenCalledWith(`/api/channels/thumbnail-executions/listing-choices?salesProductId=${SP1}`);
  });

  it('keeps the picker open when the upload with the chosen listing did not reach the mall', async () => {
    const starts = extensionOperation('failed');
    const onDone = renderPicker();

    fireEvent.click(await screen.findByRole('button', { name: '이 리스팅으로 올리기' }));

    await waitFor(() => expect(starts).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onDone).not.toHaveBeenCalled();
  });
});
