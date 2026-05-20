import type { ProductEditState } from '../../../lib/product-workspace-types';

export interface ProductRegistrationPreviewData {
  name: string;
  mainImage: string;
  previewImages: string[];
  salePrice: number;
  originalPrice: number;
  discountRate: number;
  rating: number;
  reviewCount: number;
}

const EMPTY_IMAGE_URL = 'https://placehold.co/400x400/e2e8f0/64748b?text=No+Image';

export function buildProductRegistrationPreviewData({
  editData,
  selectedRegistrationThumbnailUrl,
  thumbnailPreviewUrl,
  thumbnailPreviewImages,
  preferThumbnailPreview,
}: {
  editData: ProductEditState;
  selectedRegistrationThumbnailUrl: string | null;
  thumbnailPreviewUrl: string | null;
  thumbnailPreviewImages: string[];
  preferThumbnailPreview: boolean;
}): ProductRegistrationPreviewData {
  const mainImage =
    (preferThumbnailPreview ? thumbnailPreviewUrl : null) ??
    selectedRegistrationThumbnailUrl ??
    thumbnailPreviewImages[0] ??
    editData.thumbnails[0] ??
    EMPTY_IMAGE_URL;
  const previewImages = uniqueNonEmpty([
    mainImage,
    ...thumbnailPreviewImages,
    selectedRegistrationThumbnailUrl,
    preferThumbnailPreview ? thumbnailPreviewUrl : null,
  ]);

  return {
    name: editData.name,
    mainImage,
    previewImages: previewImages.length > 0 ? previewImages : [EMPTY_IMAGE_URL],
    salePrice: editData.salePrice,
    originalPrice: editData.originalPrice,
    discountRate: editData.discountRate,
    rating: editData.rating,
    reviewCount: editData.reviewCount,
  };
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
}
