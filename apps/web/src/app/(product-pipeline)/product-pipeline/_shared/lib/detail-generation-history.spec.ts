import { describe, expect, it } from 'vitest';
import {
  contentWorkspaceHistoryToGenerationHistory,
  toLegacyGenerationStatus,
} from './detail-generation-history';

describe('detail generation history', () => {
  it('normalizes backend statuses for the existing history tab UI', () => {
    expect(toLegacyGenerationStatus('completed')).toBe('COMPLETED');
    expect(toLegacyGenerationStatus('failed')).toBe('FAILED');
    expect(toLegacyGenerationStatus('processing')).toBe('PROCESSING');
    expect(toLegacyGenerationStatus('pending')).toBe('PENDING');
  });

  it('uses the workspace detail pages as immediate history rows, keyed by detail page id', () => {
    const [item] = contentWorkspaceHistoryToGenerationHistory([
      {
        id: 'generation-1',
        source: 'generated',
        status: 'ready',
        title: '테스트 상세페이지',
        templateId: 'kiditem',
        generationInput: { rawTitle: '테스트 상품' },
        detailPageData: { hook: { text: '테스트 상품' } },
        imageUrls: ['https://example.com/product.jpg'],
        processedImages: { __heroBanner: 'https://example.com/hero.jpg' },
        currentRevisionId: 'revision-1',
        errorMessage: null,
        href: '/product-pipeline/detail-pages/generation-1/editor',
        createdAt: '2026-05-15T12:00:00.000Z',
        updatedAt: '2026-05-15T12:01:00.000Z',
      },
    ]);

    expect(item).toMatchObject({
      id: 'generation-1',
      generatedTitle: '테스트 상세페이지',
      status: 'READY',
      templateId: 'kiditem',
      detailPageRevisionId: 'revision-1',
      detailPageData: { hook: { text: '테스트 상품' } },
      imageUrls: ['https://example.com/product.jpg'],
      processedImages: { __heroBanner: 'https://example.com/hero.jpg' },
      productId: null,
      createdAt: '2026-05-15T12:00:00.000Z',
    });
  });
});
