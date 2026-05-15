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

describe('registerWingThumbnailViaExtension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires the local Chrome extension and does not call prepare without it', async () => {
    mockedDetectExtensionId.mockResolvedValueOnce(null);

    await expect(registerWingThumbnailViaExtension('gen-1')).rejects.toThrow(
      EXTENSION_REQUIRED_MESSAGE,
    );

    expect(mockedApiPost).not.toHaveBeenCalled();
  });

  it('runs prepare, local extension upload, and complete for the current browser', async () => {
    mockedDetectExtensionId.mockResolvedValueOnce('extension-1');
    mockedApiPost
      .mockResolvedValueOnce({
        attemptId: 'attempt-1',
        generationId: 'gen-1',
        productName: '쿠팡 상품명',
        image: {
          dataUrl: 'data:image/png;base64,aW1hZ2U=',
          filename: 'gen-1.png',
          mimeType: 'image/png',
        },
      })
      .mockResolvedValueOnce({ success: true, screenshotPath: null });
    mockedSendToExtension.mockResolvedValueOnce({ success: true });

    const result = await registerWingThumbnailViaExtension('gen-1');

    expect(result).toEqual({ success: true, screenshotPath: null });
    expect(mockedApiPost).toHaveBeenNthCalledWith(
      1,
      '/api/thumbnail-analysis/generations/gen-1/wing-register/prepare',
      {},
    );
    expect(mockedSendToExtension).toHaveBeenCalledWith('extension-1', {
      action: 'registerWingThumbnail',
      attemptId: 'attempt-1',
      generationId: 'gen-1',
      productName: '쿠팡 상품명',
      image: {
        dataUrl: 'data:image/png;base64,aW1hZ2U=',
        filename: 'gen-1.png',
        mimeType: 'image/png',
      },
    });
    expect(mockedApiPost).toHaveBeenNthCalledWith(
      2,
      '/api/thumbnail-analysis/generations/gen-1/wing-register/complete',
      {
        attemptId: 'attempt-1',
        success: true,
        screenshotUrl: undefined,
      },
    );
  });

  it('records a failed attempt when the extension upload fails', async () => {
    mockedDetectExtensionId.mockResolvedValueOnce('extension-1');
    mockedApiPost
      .mockResolvedValueOnce({
        attemptId: 'attempt-1',
        generationId: 'gen-1',
        productName: '쿠팡 상품명',
        image: {
          dataUrl: 'data:image/png;base64,aW1hZ2U=',
          filename: 'gen-1.png',
          mimeType: 'image/png',
        },
      })
      .mockResolvedValueOnce({
        success: false,
        screenshotPath: null,
        error: 'dropzone missing',
      });
    mockedSendToExtension.mockResolvedValueOnce({
      success: false,
      error: 'dropzone missing',
    });

    await expect(registerWingThumbnailViaExtension('gen-1')).rejects.toThrow(
      'dropzone missing',
    );

    expect(mockedApiPost).toHaveBeenNthCalledWith(
      2,
      '/api/thumbnail-analysis/generations/gen-1/wing-register/complete',
      {
        attemptId: 'attempt-1',
        success: false,
        error: 'dropzone missing',
      },
    );
  });
});
