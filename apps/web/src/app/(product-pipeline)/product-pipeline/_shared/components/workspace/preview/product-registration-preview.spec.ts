import { describe, expect, it } from 'vitest';
import { buildProductRegistrationPreviewData } from './product-registration-preview';
import type { ProductEditState } from '../../../lib/product-workspace-types';

const editData: ProductEditState = {
  category: '',
  discountRate: 15,
  features: [],
  name: '테스트 자석 다트',
  originalPrice: 20000,
  productInfo: [],
  rating: 4.7,
  reviewCount: 123,
  salePrice: 17000,
  tags: [],
  thumbnails: ['https://cdn.example.com/source.jpg'],
};

describe('buildProductRegistrationPreviewData', () => {
  it('uses the selected registration thumbnail by default', () => {
    expect(buildProductRegistrationPreviewData({
      editData,
      selectedRegistrationThumbnailUrl: 'https://cdn.example.com/selected.jpg',
      thumbnailPreviewUrl: null,
      preferThumbnailPreview: false,
    }).mainImage).toBe('https://cdn.example.com/selected.jpg');
  });

  it('uses a transient thumbnail candidate only when the thumbnail tab asks for it', () => {
    expect(buildProductRegistrationPreviewData({
      editData,
      selectedRegistrationThumbnailUrl: 'https://cdn.example.com/selected.jpg',
      thumbnailPreviewUrl: 'https://cdn.example.com/candidate.jpg',
      preferThumbnailPreview: true,
    }).mainImage).toBe('https://cdn.example.com/candidate.jpg');
  });

  it('falls back to a stable placeholder when no image is available', () => {
    expect(buildProductRegistrationPreviewData({
      editData: { ...editData, thumbnails: [] },
      selectedRegistrationThumbnailUrl: null,
      thumbnailPreviewUrl: null,
      preferThumbnailPreview: false,
    }).mainImage).toContain('placehold.co');
  });
});
