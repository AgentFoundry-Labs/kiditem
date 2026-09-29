import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  detectOrderCollectionExtensionRuntime: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-bridge', () => bridge);

import { PUBLIC_IMAGE_BATCH, uploadPublicImages } from './public-image-upload';

const local = (index: number) => `http://localhost:9000/kiditem/candidates/${index}.jpg`;
const hosted = (url: string) => ({ sourceUrl: url, publicUrl: `https://kids-wi.kakaocdn.net/dn/${url.split('/').pop()}` });

describe('uploadPublicImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.detectOrderCollectionExtensionId.mockResolvedValue('ext');
    bridge.detectOrderCollectionExtensionRuntime.mockResolvedValue({ status: 'ready', extensionId: 'ext', version: '1.3.0' });
  });

  it('sends our storage photos in batches, saves each batch right away and reports progress', async () => {
    const urls = Array.from({ length: PUBLIC_IMAGE_BATCH + 1 }, (_, index) => local(index));
    bridge.sendToExtension.mockImplementation(async (_id, message: { urls: string[] }) => ({
      success: true,
      images: message.urls.map((url) => (url === local(3) ? { sourceUrl: url, publicUrl: null, error: '사진 파일이 아닙니다.' } : hosted(url))),
    }));
    const save = vi.fn(async (body: { images: unknown[] }) => ({ saved: body.images.length }));
    const progress: number[] = [];
    const result = await uploadPublicImages([...urls, 'https://cdn.example.com/a.jpg'], {
      save,
      onProgress: (value) => progress.push(value.done),
    });

    expect(bridge.sendToExtension).toHaveBeenCalledTimes(2);
    expect(bridge.sendToExtension.mock.calls[0]![1]).toEqual({ action: 'hostPublicImages', urls: urls.slice(0, PUBLIC_IMAGE_BATCH) });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[0]![0].images[0]).toEqual({ ...hosted(local(0)), host: 'kidsnote' });
    expect(result.saved).toBe(PUBLIC_IMAGE_BATCH);
    expect(result.failed.map((item) => item.url)).toEqual(['https://cdn.example.com/a.jpg', local(3)]);
    expect(progress).toEqual([0, PUBLIC_IMAGE_BATCH, PUBLIC_IMAGE_BATCH + 1]);
  });

  it('stops when the Kidsnote admin is logged out and keeps what was saved', async () => {
    bridge.sendToExtension.mockResolvedValue({
      success: false,
      errorCode: 'SITE_LOGIN_REQUIRED',
      error: '키즈노트 관리자에 로그인되어 있지 않습니다.',
    });
    const save = vi.fn();
    const result = await uploadPublicImages([local(0), local(1)], { save });
    expect(result).toMatchObject({ saved: 0, needsLogin: true });
    expect(save).not.toHaveBeenCalled();
  });

  it('finds the extension by the new runtime photo host capability', async () => {
    bridge.sendToExtension.mockResolvedValue({ success: true, images: [hosted(local(0))] });
    await uploadPublicImages([local(0)], { save: vi.fn(async () => ({ saved: 1 })) });
    expect(bridge.detectOrderCollectionExtensionRuntime).toHaveBeenCalledWith(1200, ['mallImageHostV1']);
  });

  it('rejects a photo host answer outside the shared contract', async () => {
    bridge.sendToExtension.mockResolvedValue({ success: true, ok: true, images: [] });
    await expect(uploadPublicImages([local(0)], { save: vi.fn() })).rejects.toThrow('확장 답이 약속한 모양과 다릅니다');
  });

  it('refuses an extension that does not know photo uploads', async () => {
    bridge.detectOrderCollectionExtensionRuntime.mockResolvedValue({ status: 'incompatible', version: '1.2.26' });
    await expect(uploadPublicImages([local(0)], { save: vi.fn() })).rejects.toThrow('1.2.26');
    expect(bridge.sendToExtension).not.toHaveBeenCalled();
  });
});
