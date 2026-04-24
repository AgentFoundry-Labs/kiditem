import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { MasterImageItem } from '@kiditem/shared';
import { useProductImages } from '../useProductImages';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getParsed: vi.fn(),
    patchParsed: vi.fn(),
    uploadParsed: vi.fn(),
  },
}));

import { apiClient } from '@/lib/api-client';

const mockGetParsed = apiClient.getParsed as ReturnType<typeof vi.fn>;
const mockPatchParsed = apiClient.patchParsed as ReturnType<typeof vi.fn>;
const mockUploadParsed = apiClient.uploadParsed as ReturnType<typeof vi.fn>;

function renderWithClient<T>(hookCallback: () => T) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return renderHook(hookCallback, { wrapper });
}

const sampleImage: MasterImageItem = {
  url: 'https://cdn.example.com/a.jpg',
  role: 'product',
  label: null,
  sortOrder: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetParsed.mockResolvedValue({ images: [] });
});

describe('useProductImages', () => {
  it('masterId가 null이면 API 호출 안함, 빈 배열 반환', () => {
    const { result } = renderWithClient(() => useProductImages(null));

    expect(result.current.images).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(mockGetParsed).not.toHaveBeenCalled();
  });

  it('masterId 있으면 /images 엔드포인트 호출하여 images 로드', async () => {
    mockGetParsed.mockResolvedValue({ images: [sampleImage] });

    const { result } = renderWithClient(() => useProductImages('prod-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetParsed).toHaveBeenCalledWith(
      '/api/products/masters/prod-1/images',
      expect.anything(),
    );
    expect(result.current.images).toEqual([sampleImage]);
  });

  it('uploadFile — FormData 전송 후 MasterImageItem 반환', async () => {
    mockUploadParsed.mockResolvedValue({ image: sampleImage });

    const { result } = renderWithClient(() => useProductImages('prod-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let uploaded: MasterImageItem | null = null;
    await act(async () => {
      const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' });
      uploaded = await result.current.uploadFile(file);
    });

    expect(uploaded).toEqual(sampleImage);
    expect(mockUploadParsed).toHaveBeenCalledWith(
      '/api/products/masters/prod-1/images/upload',
      expect.anything(),
      expect.any(FormData),
    );
  });

  it('uploadBase64 — blob 변환 후 업로드', async () => {
    mockUploadParsed.mockResolvedValue({ image: sampleImage });

    const mockBlob = new Blob(['fake'], { type: 'image/png' });
    const origFetch = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.fetch = vi.fn().mockResolvedValue({ blob: () => Promise.resolve(mockBlob) }) as any;

    const { result } = renderWithClient(() => useProductImages('prod-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let uploaded: MasterImageItem | null = null;
    await act(async () => {
      uploaded = await result.current.uploadBase64('data:image/png;base64,AAAA');
    });

    expect(uploaded).toEqual(sampleImage);
    expect(mockUploadParsed).toHaveBeenCalledWith(
      '/api/products/masters/prod-1/images/upload',
      expect.anything(),
      expect.any(FormData),
    );

    globalThis.fetch = origFetch;
  });

  it('saveImages — PATCH /images 호출 후 반환된 images 를 캐시에 반영', async () => {
    const saved = [sampleImage];
    mockPatchParsed.mockResolvedValue({ images: saved });

    const { result } = renderWithClient(() => useProductImages('prod-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveImages(saved);
    });

    expect(mockPatchParsed).toHaveBeenCalledWith(
      '/api/products/masters/prod-1/images',
      expect.anything(),
      { items: saved },
    );
    await waitFor(() => expect(result.current.images).toEqual(saved));
  });

  it('error — GET 실패는 error 상태로 surface, silent [] fallback 금지', async () => {
    mockGetParsed.mockRejectedValue(new Error('boom'));

    const { result } = renderWithClient(() => useProductImages('prod-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.images).toEqual([]);
  });
});
