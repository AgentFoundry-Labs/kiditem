import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import {
  EXTENSION_REQUIRED_MESSAGE,
  registerWingThumbnailViaExtension,
} from './wing-registration';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: vi.fn(),
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

  it('prepares a Channels execution, sends the unchanged message to the extension and reports success', async () => {
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
      action: 'registerWingThumbnail',
      attemptId: EXECUTION_ID,
      generationId: 'gen-1',
      productName: '쿠팡 상품명',
      image: prepared.image,
    });
    expect(mockedApiPost).toHaveBeenNthCalledWith(2, `/api/channels/thumbnail-executions/${EXECUTION_ID}/report`, {
      outcome: 'succeeded',
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
});
