import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useProductImages } from '../useProductImages';

// Mock apiClient
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    patch: vi.fn(),
    upload: vi.fn(),
  },
}));

import { apiClient } from '@/lib/api-client';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;
const mockPatch = apiClient.patch as ReturnType<typeof vi.fn>;
const mockUpload = apiClient.upload as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: get returns empty images
  mockGet.mockResolvedValue({ images: [] });
});

describe('useProductImages', () => {
  it('productId가 null이면 빈 배열', () => {
    const { result } = renderHook(() => useProductImages(null));

    expect(result.current.images).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('productId 있으면 API 호출하여 images 로드', async () => {
    const mockImages = [
      { url: 'https://cdn.example.com/a.jpg', role: 'main', sortOrder: 0 },
    ];
    mockGet.mockResolvedValue({ images: mockImages });

    const { result } = renderHook(() => useProductImages('prod-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/api/products/prod-1');
    expect(result.current.images).toEqual(mockImages);
  });

  it('uploadFile -- FormData 전송 후 URL 반환', async () => {
    mockUpload.mockResolvedValue({ url: 'https://cdn.example.com/uploaded.jpg' });

    const { result } = renderHook(() => useProductImages('prod-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    let url: string | null = null;
    await act(async () => {
      const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' });
      url = await result.current.uploadFile(file);
    });

    expect(url).toBe('https://cdn.example.com/uploaded.jpg');
    expect(mockUpload).toHaveBeenCalledWith(
      '/api/products/prod-1/images/upload',
      expect.any(FormData),
    );
  });

  it('uploadBase64 -- blob 변환 후 업로드', async () => {
    mockUpload.mockResolvedValue({ url: 'https://cdn.example.com/gen.png' });

    // Mock global fetch for base64 → blob conversion
    const mockBlob = new Blob(['fake'], { type: 'image/png' });
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ blob: () => Promise.resolve(mockBlob) }) as any;

    const { result } = renderHook(() => useProductImages('prod-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let url: string | null = null;
    await act(async () => {
      url = await result.current.uploadBase64('data:image/png;base64,AAAA');
    });

    expect(url).toBe('https://cdn.example.com/gen.png');
    expect(mockUpload).toHaveBeenCalledWith(
      '/api/products/prod-1/images/upload',
      expect.any(FormData),
    );

    globalThis.fetch = origFetch;
  });

  it('saveImages -- PATCH 호출', async () => {
    mockPatch.mockResolvedValue({});

    const { result } = renderHook(() => useProductImages('prod-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newImages = [
      { url: 'https://cdn.example.com/a.jpg', role: 'main', sortOrder: 0 },
    ];

    await act(async () => {
      await result.current.saveImages(newImages as any);
    });

    expect(mockPatch).toHaveBeenCalledWith('/api/products/prod-1/images', {
      images: newImages,
    });
    expect(result.current.images).toEqual(newImages);
  });
});
