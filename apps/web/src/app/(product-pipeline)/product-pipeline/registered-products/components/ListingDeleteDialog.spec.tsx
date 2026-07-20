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

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><ListingDeleteDialog listing={listing} onClose={vi.fn()} /></QueryClientProvider>);
}

describe('ListingDeleteDialog durable deletion flow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('orders authorization then provider deletion and records independent reconciliation instead of browser completion', async () => {
    get.mockResolvedValue({ configured: true, updatedAt: null });
    post.mockResolvedValueOnce({
      operationId: '22222222-2222-4222-8222-222222222222', externalId: '16311428128', displayName: '과일바구니',
      expectedVendorId: 'A00012345', listingId: listing.id, channel: 'coupang',
    }).mockResolvedValueOnce({ status: 'reconciling' });
    detectExtensionId.mockResolvedValue('extension-id');
    sendToExtension.mockResolvedValue({ ok: true, providerDeletionObserved: true });

    renderDialog();
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
    expect(post.mock.calls[1]).toEqual([expect.stringContaining('/deletion-unresolved'), {
      operationId: '22222222-2222-4222-8222-222222222222',
      reason: 'provider_delete_observed_requires_reconciliation',
    }]);
    expect(post.mock.calls[1][0]).not.toMatch(/\/deletion$/);
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
});
