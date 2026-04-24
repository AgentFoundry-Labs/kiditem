import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import type { MasterImageItem } from '@kiditem/shared';

export function useProductImages(productId: string | null) {
  const [images, setImages] = useState<MasterImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!productId) {
      setImages([]);
      return;
    }
    setLoading(true);
    apiClient
      .get<{ images?: unknown }>(`/api/products/masters/${productId}`)
      .then((master) => {
        const imgs = (master as { images?: unknown })?.images;
        if (Array.isArray(imgs)) setImages(imgs as MasterImageItem[]);
        else setImages([]);
      })
      .catch(() => setImages([]))
      .finally(() => setLoading(false));
  }, [productId]);

  /** Upload a File object (e.g. from file input / drag-and-drop) */
  const uploadFile = useCallback(
    async (file: File): Promise<string | null> => {
      if (!productId) return null;
      const formData = new FormData();
      formData.append('file', file);
      try {
        const result = await apiClient.upload<{ url: string }>(
          `/api/products/masters/${productId}/images/upload`,
          formData,
        );
        return result.url;
      } catch {
        return null;
      }
    },
    [productId],
  );

  /** Upload a base64 data-URL string (e.g. from canvas / generated thumbnail) */
  const uploadBase64 = useCallback(
    async (dataUrl: string): Promise<string | null> => {
      if (!productId) return null;
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const formData = new FormData();
        formData.append('file', blob, 'thumbnail.png');
        const result = await apiClient.upload<{ url: string }>(
          `/api/products/masters/${productId}/images/upload`,
          formData,
        );
        return result.url;
      } catch {
        return null;
      }
    },
    [productId],
  );

  const saveImages = useCallback(
    async (imgs: MasterImageItem[]) => {
      if (!productId) return;
      setSaving(true);
      try {
        await apiClient.patch(`/api/products/masters/${productId}`, { images: imgs });
        setImages(imgs);
      } finally {
        setSaving(false);
      }
    },
    [productId],
  );

  return { images, loading, saving, uploadFile, uploadBase64, saveImages, setImages };
}
