import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { ApiError } from '@/lib/api-error';
import {
  EXTENSION_REQUIRED_MESSAGE,
  ListingChoiceRequiredError,
  fetchRepresentativeImageListingChoices,
  confirmRepresentativeImageApplied,
  markRepresentativeImageNotApplied,
  submitRepresentativeImageViaExtension,
  representativeImageUploadedMessage,
  resendRepresentativeImageViaExtension,
} from './representative-image-execution';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

const mockedApiPost = vi.mocked(apiClient.post);
const mockedDetectExtensionId = vi.mocked(detectExtensionId);
const mockedSendToExtension = vi.mocked(sendToExtension);

const EXECUTION_ID = '00000000-0000-4000-8000-0000000000e1';
const SUBJECT = { salesProductId: 'product-1', assetId: 'asset-1' };
const prepared = {
  executionId: EXECUTION_ID,
  salesProductId: 'product-1',
  assetId: 'asset-1',
  productName: '쿠팡 상품명',
  image: {
    dataUrl: 'data:image/png;base64,aW1hZ2U=',
    filename: 'asset-1.png',
    mimeType: 'image/png',
  },
};

describe('submitRepresentativeImageViaExtension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires the local Chrome extension and does not prepare an execution without it', async () => {
    mockedDetectExtensionId.mockResolvedValueOnce(null);

    await expect(submitRepresentativeImageViaExtension(SUBJECT)).rejects.toThrow(EXTENSION_REQUIRED_MESSAGE);

    expect(mockedApiPost).not.toHaveBeenCalled();
  });

  it('prepares a Channels execution, sends the unchanged message to the extension and reports the upload as waiting for the mall save', async () => {
    mockedDetectExtensionId.mockResolvedValueOnce('extension-1');
    mockedApiPost
      .mockResolvedValueOnce(prepared)
      .mockResolvedValueOnce({ salesProductId: 'product-1', assetId: 'asset-1', executionId: EXECUTION_ID, success: true, screenshotPath: 'shot' });
    mockedSendToExtension.mockResolvedValueOnce({ success: true, screenshotUrl: 'shot' });

    await expect(submitRepresentativeImageViaExtension(SUBJECT)).resolves.toEqual({
      salesProductId: 'product-1', assetId: 'asset-1', executionId: EXECUTION_ID, success: true, screenshotPath: 'shot',
    });

    expect(mockedApiPost).toHaveBeenNthCalledWith(1, '/api/channels/thumbnail-executions', { salesProductId: 'product-1', assetId: 'asset-1' });
    expect(mockedSendToExtension).toHaveBeenCalledWith('extension-1', {
      action: 'registerRepresentativeImage',
      attemptId: EXECUTION_ID,
      salesProductId: 'product-1',
      assetId: 'asset-1',
      productName: '쿠팡 상품명',
      image: prepared.image,
    });
    expect(mockedApiPost).toHaveBeenNthCalledWith(2, `/api/channels/thumbnail-executions/${EXECUTION_ID}/report`, {
      outcome: 'uploaded_pending_save',
      screenshotUrl: 'shot',
    });
  });

  it('reports a definitive failure when the extension answers that the upload failed', async () => {
    mockedDetectExtensionId.mockResolvedValueOnce('extension-1');
    mockedApiPost
      .mockResolvedValueOnce(prepared)
      .mockResolvedValueOnce({ salesProductId: 'product-1', assetId: 'asset-1', executionId: EXECUTION_ID, success: false, screenshotPath: null, error: 'dropzone missing' });
    mockedSendToExtension.mockResolvedValueOnce({ success: false, error: 'dropzone missing' });

    await expect(submitRepresentativeImageViaExtension(SUBJECT)).rejects.toThrow('dropzone missing');

    expect(mockedApiPost).toHaveBeenNthCalledWith(2, `/api/channels/thumbnail-executions/${EXECUTION_ID}/report`, {
      outcome: 'definitive_failure',
      error: 'dropzone missing',
    });
  });

  it('reports a pending mall login as a definitive failure', async () => {
    mockedDetectExtensionId.mockResolvedValueOnce('extension-1');
    mockedApiPost.mockResolvedValueOnce(prepared).mockResolvedValueOnce({ success: false, screenshotPath: null });
    mockedSendToExtension.mockResolvedValueOnce({ success: false, pendingLogin: true });

    await expect(submitRepresentativeImageViaExtension(SUBJECT)).rejects.toThrow('쿠팡 WING 로그인 필요');

    expect(mockedApiPost).toHaveBeenNthCalledWith(2, `/api/channels/thumbnail-executions/${EXECUTION_ID}/report`, {
      outcome: 'definitive_failure',
      error: '쿠팡 WING 로그인 필요 — 열린 탭에서 로그인한 뒤 다시 시도하세요.',
    });
  });

  it('reports an unknown outcome when talking to the extension breaks, because the image may have been uploaded', async () => {
    mockedDetectExtensionId.mockResolvedValueOnce('extension-1');
    mockedApiPost.mockResolvedValueOnce(prepared).mockResolvedValueOnce({ success: false, screenshotPath: null });
    mockedSendToExtension.mockRejectedValueOnce(new Error('The message port closed before a response was received.'));

    await expect(submitRepresentativeImageViaExtension(SUBJECT)).rejects.toThrow('The message port closed');

    expect(mockedApiPost).toHaveBeenNthCalledWith(2, `/api/channels/thumbnail-executions/${EXECUTION_ID}/report`, {
      outcome: 'uncertain',
      error: 'The message port closed before a response was received.',
    });
  });

  it('resends the same execution to the extension and reports on it, without preparing a new one', async () => {
    mockedDetectExtensionId.mockResolvedValueOnce('extension-1');
    mockedApiPost
      .mockResolvedValueOnce(prepared)
      .mockResolvedValueOnce({ salesProductId: 'product-1', assetId: 'asset-1', executionId: EXECUTION_ID, success: true, screenshotPath: null });
    mockedSendToExtension.mockResolvedValueOnce({ success: true });

    await expect(resendRepresentativeImageViaExtension(EXECUTION_ID)).resolves.toMatchObject({ success: true });

    expect(mockedApiPost).toHaveBeenNthCalledWith(1, `/api/channels/thumbnail-executions/${EXECUTION_ID}/resend`, {});
    expect(mockedSendToExtension).toHaveBeenCalledWith('extension-1', expect.objectContaining({ attemptId: EXECUTION_ID, action: 'registerRepresentativeImage' }));
    expect(mockedApiPost).toHaveBeenNthCalledWith(2, `/api/channels/thumbnail-executions/${EXECUTION_ID}/report`, { outcome: 'uploaded_pending_save' });
    expect(mockedApiPost).not.toHaveBeenCalledWith('/api/channels/thumbnail-executions', expect.anything());
  });

  it('marks an unknown outcome as not applied through the Channels route', async () => {
    mockedApiPost.mockResolvedValueOnce({ salesProductId: 'product-1', assetId: 'asset-1', executionId: EXECUTION_ID, success: false, screenshotPath: null });

    await markRepresentativeImageNotApplied(EXECUTION_ID);

    expect(mockedApiPost).toHaveBeenCalledWith(`/api/channels/thumbnail-executions/${EXECUTION_ID}/not-applied`, {});
  });

  it('confirms the mall save through the Channels applied route', async () => {
    mockedApiPost.mockResolvedValueOnce({ salesProductId: 'product-1', assetId: 'asset-1', executionId: EXECUTION_ID, success: true, status: 'succeeded', screenshotPath: null });

    await expect(confirmRepresentativeImageApplied(EXECUTION_ID)).resolves.toMatchObject({ success: true });

    expect(mockedApiPost).toHaveBeenCalledWith(`/api/channels/thumbnail-executions/${EXECUTION_ID}/applied`, {});
  });

  it('asks the operator to pick a listing when the product has several, without touching the extension', async () => {
    mockedDetectExtensionId.mockResolvedValueOnce('extension-1');
    mockedApiPost.mockRejectedValueOnce(new ApiError(400, 'Bad Request', '리스팅이 여럿입니다 — 하나를 고르세요', { reason: 'ambiguous_listing', }));

    const error = await submitRepresentativeImageViaExtension(SUBJECT).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ListingChoiceRequiredError);
    expect(error).toMatchObject({ salesProductId: 'product-1', message: '리스팅이 여럿입니다 — 하나를 고르세요' });
    expect(mockedSendToExtension).not.toHaveBeenCalled();
  });

  it('prepares with the listing the operator picked', async () => {
    mockedDetectExtensionId.mockResolvedValueOnce('extension-1');
    mockedApiPost.mockResolvedValueOnce(prepared).mockResolvedValueOnce({ success: false, status: 'reconciling', screenshotPath: null });
    mockedSendToExtension.mockResolvedValueOnce({ success: true });

    await submitRepresentativeImageViaExtension(SUBJECT, { channelListingId: 'listing-2' });

    expect(mockedApiPost).toHaveBeenNthCalledWith(1, '/api/channels/thumbnail-executions', { salesProductId: 'product-1', assetId: 'asset-1', channelListingId: 'listing-2' });
  });

  it('reads the listings the operator can pick from Channels', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ items: [{ channelListingId: 'listing-2', channelName: '두번째', channelAccountName: 'Wing', externalId: '99' }] });

    await expect(fetchRepresentativeImageListingChoices('product-1')).resolves.toEqual([
      { channelListingId: 'listing-2', channelName: '두번째', channelAccountName: 'Wing', externalId: '99' },
    ]);
    expect(apiClient.get).toHaveBeenCalledWith('/api/channels/thumbnail-executions/listing-choices?salesProductId=product-1');
  });
});

describe('representativeImageUploadedMessage', () => {
  it('names the channel that takes representative images from the registry, never a hard-coded screen', () => {
    const message = representativeImageUploadedMessage();
    expect(message).toBe('쿠팡 WING 상품 수정 화면에 올렸습니다 — 저장한 뒤 반영됨으로 표시하세요');
    expect(representativeImageUploadedMessage({ uploaded: 3 })).toBe(
      '쿠팡 WING 상품 수정 화면에 3장 올렸습니다 — 저장한 뒤 반영됨으로 표시하세요',
    );
    expect(representativeImageUploadedMessage({ uploaded: 2, failed: 1 })).toBe(
      '쿠팡 WING 상품 수정 화면에 2장 올림 / 실패 1 — 올린 것은 저장 뒤 반영됨으로 표시하세요',
    );
    expect(representativeImageUploadedMessage({ resent: true })).toBe(
      '쿠팡 WING 상품 수정 화면에 다시 올렸습니다 — 저장한 뒤 반영됨으로 표시하세요',
    );
  });
});
