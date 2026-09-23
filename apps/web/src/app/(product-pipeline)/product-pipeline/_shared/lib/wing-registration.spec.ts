import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { ApiError } from '@/lib/api-error';
import {
  EXTENSION_REQUIRED_MESSAGE,
  WingListingChoiceRequiredError,
  fetchWingListingChoices,
  confirmWingThumbnailApplied,
  markWingThumbnailNotApplied,
  registerWingThumbnailViaExtension,
  representativeImageUploadedMessage,
  resendWingThumbnailViaExtension,
} from './wing-registration';

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
const prepared = {
  executionId: EXECUTION_ID,
  generationId: 'gen-1',
  productName: '쿠팡 상품명',
  image: {
    dataUrl: 'data:image/png;base64,aW1hZ2U=',
    filename: 'gen-1.png',
    mimeType: 'image/png',
  },
};

describe('registerWingThumbnailViaExtension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires the local Chrome extension and does not prepare an execution without it', async () => {
    mockedDetectExtensionId.mockResolvedValueOnce(null);

    await expect(registerWingThumbnailViaExtension('gen-1')).rejects.toThrow(EXTENSION_REQUIRED_MESSAGE);

    expect(mockedApiPost).not.toHaveBeenCalled();
  });

  it('prepares a Channels execution, sends the unchanged message to the extension and reports the upload as waiting for the Wing save', async () => {
    mockedDetectExtensionId.mockResolvedValueOnce('extension-1');
    mockedApiPost
      .mockResolvedValueOnce(prepared)
      .mockResolvedValueOnce({ generationId: 'gen-1', executionId: EXECUTION_ID, success: true, screenshotPath: 'shot' });
    mockedSendToExtension.mockResolvedValueOnce({ success: true, screenshotUrl: 'shot' });

    await expect(registerWingThumbnailViaExtension('gen-1')).resolves.toEqual({
      generationId: 'gen-1', executionId: EXECUTION_ID, success: true, screenshotPath: 'shot',
    });

    expect(mockedApiPost).toHaveBeenNthCalledWith(1, '/api/channels/thumbnail-executions', { generationId: 'gen-1' });
    expect(mockedSendToExtension).toHaveBeenCalledWith('extension-1', {
      action: 'registerRepresentativeImage',
      attemptId: EXECUTION_ID,
      generationId: 'gen-1',
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
      .mockResolvedValueOnce({ generationId: 'gen-1', executionId: EXECUTION_ID, success: false, screenshotPath: null, error: 'dropzone missing' });
    mockedSendToExtension.mockResolvedValueOnce({ success: false, error: 'dropzone missing' });

    await expect(registerWingThumbnailViaExtension('gen-1')).rejects.toThrow('dropzone missing');

    expect(mockedApiPost).toHaveBeenNthCalledWith(2, `/api/channels/thumbnail-executions/${EXECUTION_ID}/report`, {
      outcome: 'definitive_failure',
      error: 'dropzone missing',
    });
  });

  it('reports a pending Wing login as a definitive failure', async () => {
    mockedDetectExtensionId.mockResolvedValueOnce('extension-1');
    mockedApiPost.mockResolvedValueOnce(prepared).mockResolvedValueOnce({ success: false, screenshotPath: null });
    mockedSendToExtension.mockResolvedValueOnce({ success: false, pendingLogin: true });

    await expect(registerWingThumbnailViaExtension('gen-1')).rejects.toThrow('쿠팡 Wing 로그인 필요');

    expect(mockedApiPost).toHaveBeenNthCalledWith(2, `/api/channels/thumbnail-executions/${EXECUTION_ID}/report`, {
      outcome: 'definitive_failure',
      error: '쿠팡 Wing 로그인 필요 — 열린 Wing 탭에서 로그인 후 다시 시도하세요.',
    });
  });

  it('reports an unknown outcome when talking to the extension breaks, because the image may have been uploaded', async () => {
    mockedDetectExtensionId.mockResolvedValueOnce('extension-1');
    mockedApiPost.mockResolvedValueOnce(prepared).mockResolvedValueOnce({ success: false, screenshotPath: null });
    mockedSendToExtension.mockRejectedValueOnce(new Error('The message port closed before a response was received.'));

    await expect(registerWingThumbnailViaExtension('gen-1')).rejects.toThrow('The message port closed');

    expect(mockedApiPost).toHaveBeenNthCalledWith(2, `/api/channels/thumbnail-executions/${EXECUTION_ID}/report`, {
      outcome: 'uncertain',
      error: 'The message port closed before a response was received.',
    });
  });

  it('resends the same execution to the extension and reports on it, without preparing a new one', async () => {
    mockedDetectExtensionId.mockResolvedValueOnce('extension-1');
    mockedApiPost
      .mockResolvedValueOnce(prepared)
      .mockResolvedValueOnce({ generationId: 'gen-1', executionId: EXECUTION_ID, success: true, screenshotPath: null });
    mockedSendToExtension.mockResolvedValueOnce({ success: true });

    await expect(resendWingThumbnailViaExtension(EXECUTION_ID)).resolves.toMatchObject({ success: true });

    expect(mockedApiPost).toHaveBeenNthCalledWith(1, `/api/channels/thumbnail-executions/${EXECUTION_ID}/resend`, {});
    expect(mockedSendToExtension).toHaveBeenCalledWith('extension-1', expect.objectContaining({ attemptId: EXECUTION_ID, action: 'registerRepresentativeImage' }));
    expect(mockedApiPost).toHaveBeenNthCalledWith(2, `/api/channels/thumbnail-executions/${EXECUTION_ID}/report`, { outcome: 'uploaded_pending_save' });
    expect(mockedApiPost).not.toHaveBeenCalledWith('/api/channels/thumbnail-executions', expect.anything());
  });

  it('marks an unknown outcome as not applied through the Channels route', async () => {
    mockedApiPost.mockResolvedValueOnce({ generationId: 'gen-1', executionId: EXECUTION_ID, success: false, screenshotPath: null });

    await markWingThumbnailNotApplied(EXECUTION_ID);

    expect(mockedApiPost).toHaveBeenCalledWith(`/api/channels/thumbnail-executions/${EXECUTION_ID}/not-applied`, {});
  });

  it('confirms the Wing save through the Channels applied route', async () => {
    mockedApiPost.mockResolvedValueOnce({ generationId: 'gen-1', executionId: EXECUTION_ID, success: true, status: 'succeeded', screenshotPath: null });

    await expect(confirmWingThumbnailApplied(EXECUTION_ID)).resolves.toMatchObject({ success: true });

    expect(mockedApiPost).toHaveBeenCalledWith(`/api/channels/thumbnail-executions/${EXECUTION_ID}/applied`, {});
  });

  it('asks the operator to pick a listing when the product has several, without touching the extension', async () => {
    mockedDetectExtensionId.mockResolvedValueOnce('extension-1');
    mockedApiPost.mockRejectedValueOnce(new ApiError(400, 'Bad Request', '리스팅이 여럿입니다 — 하나를 고르세요', { code: 'ambiguous_listing' }));

    const error = await registerWingThumbnailViaExtension('gen-1').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WingListingChoiceRequiredError);
    expect(error).toMatchObject({ generationId: 'gen-1', message: '리스팅이 여럿입니다 — 하나를 고르세요' });
    expect(mockedSendToExtension).not.toHaveBeenCalled();
  });

  it('prepares with the listing the operator picked', async () => {
    mockedDetectExtensionId.mockResolvedValueOnce('extension-1');
    mockedApiPost.mockResolvedValueOnce(prepared).mockResolvedValueOnce({ success: false, status: 'reconciling', screenshotPath: null });
    mockedSendToExtension.mockResolvedValueOnce({ success: true });

    await registerWingThumbnailViaExtension('gen-1', { channelListingId: 'listing-2' });

    expect(mockedApiPost).toHaveBeenNthCalledWith(1, '/api/channels/thumbnail-executions', { generationId: 'gen-1', channelListingId: 'listing-2' });
  });

  it('reads the listings the operator can pick from Channels', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ items: [{ channelListingId: 'listing-2', channelName: '두번째', channelAccountName: 'Wing', externalId: '99' }] });

    await expect(fetchWingListingChoices('gen-1')).resolves.toEqual([
      { channelListingId: 'listing-2', channelName: '두번째', channelAccountName: 'Wing', externalId: '99' },
    ]);
    expect(apiClient.get).toHaveBeenCalledWith('/api/channels/thumbnail-executions/listing-choices?generationId=gen-1');
  });
});

describe('representativeImageUploadedMessage', () => {
  it('names the channel that takes representative images from the registry, never a hard-coded Wing screen', () => {
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
