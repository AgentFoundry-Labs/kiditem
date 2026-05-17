import type { ProductEditState } from '../../../lib/product-workspace-types';

export interface ProductRegistrationPreviewData {
  name: string;
  mainImage: string;
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
  preferThumbnailPreview,
}: {
  editData: ProductEditState;
  selectedRegistrationThumbnailUrl: string | null;
  thumbnailPreviewUrl: string | null;
  preferThumbnailPreview: boolean;
}): ProductRegistrationPreviewData {
  const mainImage =
    (preferThumbnailPreview ? thumbnailPreviewUrl : null) ??
    selectedRegistrationThumbnailUrl ??
    editData.thumbnails[0] ??
    EMPTY_IMAGE_URL;

  return {
    name: editData.name,
    mainImage,
    salePrice: editData.salePrice,
    originalPrice: editData.originalPrice,
    discountRate: editData.discountRate,
    rating: editData.rating,
    reviewCount: editData.reviewCount,
  };
}
