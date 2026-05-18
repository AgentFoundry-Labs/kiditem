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
      thumbnailPreviewImages: ['https://cdn.example.com/gallery.jpg'],
      preferThumbnailPreview: false,
    })).toMatchObject({
      mainImage: 'https://cdn.example.com/selected.jpg',
      previewImages: [
        'https://cdn.example.com/selected.jpg',
        'https://cdn.example.com/gallery.jpg',
      ],
    });
  });

  it('uses a transient thumbnail candidate only when the thumbnail tab asks for it', () => {
    expect(buildProductRegistrationPreviewData({
      editData,
      selectedRegistrationThumbnailUrl: 'https://cdn.example.com/selected.jpg',
      thumbnailPreviewUrl: 'https://cdn.example.com/candidate.jpg',
      thumbnailPreviewImages: ['https://cdn.example.com/gallery.jpg'],
      preferThumbnailPreview: true,
    })).toMatchObject({
      mainImage: 'https://cdn.example.com/candidate.jpg',
      previewImages: [
        'https://cdn.example.com/candidate.jpg',
        'https://cdn.example.com/gallery.jpg',
        'https://cdn.example.com/selected.jpg',
      ],
    });
  });

  it('falls back to a stable placeholder when no image is available', () => {
    expect(buildProductRegistrationPreviewData({
      editData: { ...editData, thumbnails: [] },
      selectedRegistrationThumbnailUrl: null,
      thumbnailPreviewUrl: null,
      thumbnailPreviewImages: [],
      preferThumbnailPreview: false,
    }).mainImage).toContain('placehold.co');
  });
});
