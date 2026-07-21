import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ListingDeleteDialog from './ListingDeleteDialog';

const { get, post, detectExtensionId, sendToExtension } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), detectExtensionId: vi.fn(), sendToExtension: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({ apiClient: { get, post } }));
vi.mock('@/lib/extension-bridge', () => ({ detectExtensionId, sendToExtension }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const listing = {
  id: '11111111-1111-4111-8111-111111111111', listingName: '과일바구니', thumbnailUrl: null,
  detailPageArtifactId: null, detailPageRevisionId: null, channel: 'coupang', channelAccountId: 'account',
  channelAccountName: '쿠팡', externalId: '16311428128', channelName: null, channelPrice: null,
  sourceCandidateId: 'candidate', contentWorkspaceId: null, status: 'active', exposureStatus: null,
  optionCount: 1, mappingStatus: 'matched' as const, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderDialog(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const rendered = render(<QueryClientProvider client={queryClient}><ListingDeleteDialog listing={listing} onClose={onClose} /></QueryClientProvider>);
  return { ...rendered, invalidate };
}

describe('ListingDeleteDialog durable deletion flow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('independently verifies an observed provider deletion, refreshes the list, and closes', async () => {
    get.mockResolvedValue({ configured: true, updatedAt: null });
    post.mockResolvedValueOnce({
      operationId: '22222222-2222-4222-8222-222222222222', externalId: '16311428128', displayName: '과일바구니',
      expectedVendorId: 'A00012345', listingId: listing.id, channel: 'coupang',
    }).mockResolvedValueOnce({ status: 'succeeded', providerOutcome: 'succeeded' });
    detectExtensionId.mockResolvedValue('extension-id');
    sendToExtension.mockResolvedValue({ ok: true, providerDeletionObserved: true });

    const onClose = vi.fn();
    const { invalidate } = renderDialog(onClose);
    const password = await waitFor(() => {
      const input = document.querySelector<HTMLInputElement>('input[type="password"]');
      if (!input) throw new Error('password input not rendered');
      return input;
    });
    fireEvent.change(password, { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[0][0]).toContain('/deletion-authorization');
    expect(post.mock.calls[0][1]).toEqual(expect.objectContaining({ password: 'secret', idempotencyKey: expect.any(String) }));
    expect(sendToExtension).toHaveBeenCalledWith('extension-id', expect.objectContaining({
      operationId: '22222222-2222-4222-8222-222222222222', listingId: listing.id,
    }), expect.any(Number));
    expect(post.mock.calls[1]).toEqual([
      expect.stringContaining('/deletion-reconciliation'),
      { operationId: '22222222-2222-4222-8222-222222222222' },
    ]);
    expect(invalidate).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('marks the durable operation unresolved after a browser failure instead of starting a fresh deletion', async () => {
    get.mockResolvedValue({ configured: true, updatedAt: null });
    post.mockResolvedValueOnce({
      operationId: '22222222-2222-4222-8222-222222222222', externalId: '16311428128', displayName: '과일바구니',
      expectedVendorId: 'A00012345', listingId: listing.id, channel: 'coupang',
    }).mockResolvedValueOnce({ status: 'reconciling' });
    detectExtensionId.mockResolvedValue('extension-id');
    sendToExtension.mockResolvedValue({ ok: false, error: 'timeout' });

    renderDialog();
    const password = await waitFor(() => {
      const input = document.querySelector<HTMLInputElement>('input[type="password"]');
      if (!input) throw new Error('password input not rendered');
      return input;
    });
    fireEvent.change(password, { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1]).toEqual([expect.stringContaining('/deletion-unresolved'), expect.objectContaining({
      operationId: '22222222-2222-4222-8222-222222222222', reason: 'extension_unknown',
    })]);
  });

  it('offers an explicit verification retry when provider observation cannot yet be independently confirmed', async () => {
    get.mockResolvedValue({ configured: true, updatedAt: null });
    post.mockResolvedValueOnce({
      operationId: '22222222-2222-4222-8222-222222222222', externalId: '16311428128', displayName: '과일바구니',
      expectedVendorId: 'A00012345', listingId: listing.id, channel: 'coupang',
    }).mockRejectedValueOnce(new Error('transport down'))
      .mockResolvedValueOnce({ status: 'reconciling' });
    detectExtensionId.mockResolvedValue('extension-id');
    sendToExtension.mockResolvedValue({ ok: true, providerDeletionObserved: true });
    const onClose = vi.fn();
    const { invalidate } = renderDialog(onClose);

    const password = await waitFor(() => {
      const input = document.querySelector<HTMLInputElement>('input[type="password"]');
      if (!input) throw new Error('password input not rendered');
      return input;
    });
    fireEvent.change(password, { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(3));
    expect(post.mock.calls[1][0]).toContain('/deletion-reconciliation');
    expect(post.mock.calls[2][0]).toContain('/deletion-unresolved');
    expect(onClose).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '삭제 상태 다시 확인' })).toBeEnabled();
  });

  it('resumes reconciliation without repeating the provider deletion after the dialog is reopened', async () => {
    get.mockResolvedValue({ configured: true, updatedAt: null });
    post.mockResolvedValueOnce({
      operationId: '22222222-2222-4222-8222-222222222222',
      externalId: '16311428128',
      displayName: '과일바구니',
      expectedVendorId: 'A00012345',
      listingId: listing.id,
      channel: 'coupang',
      status: 'reconciling',
      providerOutcome: 'uncertain',
      extensionClaimed: true,
    }).mockResolvedValueOnce({ status: 'succeeded', providerOutcome: 'succeeded' });
    const onClose = vi.fn();
    renderDialog(onClose);
    const password = await waitFor(() => {
      const input = document.querySelector<HTMLInputElement>('input[type="password"]');
      if (!input) throw new Error('password input not rendered');
      return input;
    });
    fireEvent.change(password, { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1][0]).toContain('/deletion-reconciliation');
    expect(sendToExtension).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
