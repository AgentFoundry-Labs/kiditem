import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  cancelProductGenerationChildren,
  useProductGenerateWorkflow,
} from './useProductGenerateWorkflow';

const apiPost = vi.hoisted(() => vi.fn());
const useGenerateForm = vi.hoisted(() => vi.fn());
const createRequestId = vi.hoisted(() => vi.fn());
const invalidateQueries = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: apiPost },
}));

vi.mock('@/lib/secure-random-uuid', () => ({
  createSecureRandomUuid: createRequestId,
}));

vi.mock('../../detail-template-generation/hooks/useGenerateForm', () => ({
  useGenerateForm,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

describe('cancelProductGenerationChildren', () => {
  it('cancels each returned durable child without a parent operation key', async () => {
    apiPost.mockResolvedValue({ status: 'cancelled' });

    await cancelProductGenerationChildren({
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumbnail-1',
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/ai/detail-page/detail-1/cancel',
      { reason: '사용자 요청' },
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/ai/thumbnail-jobs/thumbnail-1/cancel',
      { reason: '사용자 요청' },
    );
  });
});

describe('useProductGenerateWorkflow', () => {
  beforeEach(() => {
    apiPost.mockReset();
    createRequestId.mockReset();
    createRequestId.mockReturnValue('product-generation-key');
    invalidateQueries.mockReset();
    invalidateQueries.mockResolvedValue(undefined);
    useGenerateForm.mockReset();
    useGenerateForm.mockReturnValue({
      rawTitle: '자석 다트게임',
      rawCategory: '완구',
      keyword: '',
      target: '',
      rawDescription: '',
      rawOptions: '',
      images: ['https://example.com/main.jpg'],
      ageGroup: 'age-8-plus',
      detailImageCount: '2',
      usageSectionMode: 'include',
      kcCertificationStatus: 'unknown',
      kcCertificationNumber: '',
      productSize: '',
      colorVariantStatus: 'auto',
      colorVariantNames: '',
      boxSetStatus: 'auto',
      boxSetQuantity: '',
      generationDialog: null,
      setError: vi.fn(),
      openGenerationDialog: vi.fn(),
      closeGenerationDialog: vi.fn(),
      markGenerationDialogCancelled: vi.fn(),
    });
  });

  it('reuses a product-generation key after a lost response and returns durable child IDs', async () => {
    apiPost
      .mockRejectedValueOnce(new Error('network response lost'))
      .mockResolvedValueOnce({
        ok: true,
        candidateId: 'candidate-1',
        salesProductId: 'sales-product-1',
        href: '/product-pipeline/collected-products/sales-product-1',
        detailGenerationId: 'detail-1',
        thumbnailGenerationId: 'thumbnail-1',
        contentWorkspaceId: 'workspace-1',
      });
    const { result } = renderHook(() => useProductGenerateWorkflow());

    await act(async () => {
      await result.current.handleSubmit('bold-vertical', ['https://example.com/main.jpg']);
    });
    await act(async () => {
      await result.current.handleSubmit('bold-vertical', ['https://example.com/main.jpg']);
    });

    expect(apiClient.post).toHaveBeenNthCalledWith(
      1,
      '/api/sourcing/product-generation',
      expect.objectContaining({ title: '자석 다트게임' }),
      { headers: { 'Idempotency-Key': 'product-generation-key' } },
    );
    expect(apiClient.post).toHaveBeenNthCalledWith(
      2,
      '/api/sourcing/product-generation',
      expect.objectContaining({ title: '자석 다트게임' }),
      { headers: { 'Idempotency-Key': 'product-generation-key' } },
    );
    expect(createRequestId).toHaveBeenCalledTimes(1);
    expect(useGenerateForm.mock.results[0]?.value.openGenerationDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        detailGenerationId: 'detail-1',
        thumbnailGenerationId: 'thumbnail-1',
        // 수집상품 화면은 판매상품 초안 id 로 연다 — 원천 기록 id 가 아니다(KID-310).
        editorUrl: '/product-pipeline/collected-products/sales-product-1',
      }),
    );
  });
});
