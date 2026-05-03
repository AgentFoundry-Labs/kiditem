'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

export interface ProductImageItem {
  url: string;
  role?: string;
  label?: string | null;
}

export function useProductImages(productId: string | null) {
  const [images, setImages] = useState<ProductImageItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productId) {
      setImages([]);
      return;
    }
    setLoading(true);
    apiClient
      .get<{ images?: unknown }>(`/api/products/masters/${productId}`)
      .then((product) => {
        const rawImages = product.images;
        if (!Array.isArray(rawImages)) {
          setImages([]);
          return;
        }
        setImages(
          rawImages
            .map((image) => {
              if (typeof image === 'string') return { url: image };
              if (image && typeof image === 'object' && typeof (image as { url?: unknown }).url === 'string') {
                return image as ProductImageItem;
              }
              return null;
            })
            .filter((image): image is ProductImageItem => image !== null),
        );
      })
      .catch(() => setImages([]))
      .finally(() => setLoading(false));
  }, [productId]);

  return { images, loading };
}
