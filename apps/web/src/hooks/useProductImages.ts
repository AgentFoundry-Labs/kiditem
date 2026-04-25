import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GetMasterImagesResponseSchema,
  UploadMasterImageResponseSchema,
  type MasterImageItem,
} from '@kiditem/shared';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

/**
 * Product image management for a single MasterProduct (`masterId`).
 *
 * W1 rewrite (ADR-0020 successor):
 * - Fetches via `GET /api/products/masters/:id/images` (not the master detail
 *   route's embedded `.images` field).
 * - Uploads to `POST /api/products/masters/:id/images/upload` and expects the
 *   canonical `{ image: MasterImageItem }` envelope.
 * - Saves the full list via `PATCH /api/products/masters/:id/images` with
 *   `{ items: MasterImageItem[] }`; the server response becomes the new truth.
 * - Errors propagate to the caller (no silent `setImages([])` fallback).
 *   Callers read `error`/`uploadError`/`saveError` and render UI accordingly.
 */
export function useProductImages(masterId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: masterId ? queryKeys.products.images(masterId) : ['products', 'images', 'disabled'],
    queryFn: async () => {
      if (!masterId) return [] as MasterImageItem[];
      const res = await apiClient.getParsed(
        `/api/products/masters/${masterId}/images`,
        GetMasterImagesResponseSchema,
      );
      return res.images;
    },
    enabled: Boolean(masterId),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File): Promise<MasterImageItem> => {
      if (!masterId) throw new Error('useProductImages.uploadFile: masterId is required');
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient.uploadParsed(
        `/api/products/masters/${masterId}/images/upload`,
        UploadMasterImageResponseSchema,
        formData,
      );
      return res.image;
    },
  });

  const uploadBase64Mutation = useMutation({
    mutationFn: async (dataUrl: string): Promise<MasterImageItem> => {
      if (!masterId) throw new Error('useProductImages.uploadBase64: masterId is required');
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const formData = new FormData();
      formData.append('file', blob, 'thumbnail.png');
      const parsed = await apiClient.uploadParsed(
        `/api/products/masters/${masterId}/images/upload`,
        UploadMasterImageResponseSchema,
        formData,
      );
      return parsed.image;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (items: MasterImageItem[]): Promise<MasterImageItem[]> => {
      if (!masterId) throw new Error('useProductImages.saveImages: masterId is required');
      const res = await apiClient.patchParsed(
        `/api/products/masters/${masterId}/images`,
        GetMasterImagesResponseSchema,
        { items },
      );
      return res.images;
    },
    onMutate: async () => {
      if (!masterId) return;
      // Cancel any in-flight GET so a late-resolving refetch can't clobber
      // the just-saved list (Codex review M1 — race condition between PATCH
      // success and a concurrent background fetch).
      await queryClient.cancelQueries({ queryKey: queryKeys.products.images(masterId) });
    },
    onSuccess: (images) => {
      if (masterId) {
        queryClient.setQueryData(queryKeys.products.images(masterId), images);
      }
    },
  });

  const uploadFile = useCallback(
    async (file: File) => uploadMutation.mutateAsync(file),
    [uploadMutation],
  );
  const uploadBase64 = useCallback(
    async (dataUrl: string) => uploadBase64Mutation.mutateAsync(dataUrl),
    [uploadBase64Mutation],
  );
  const saveImages = useCallback(
    async (items: MasterImageItem[]) => saveMutation.mutateAsync(items),
    [saveMutation],
  );

  return {
    images: query.data ?? [],
    // When masterId is null the query is disabled; React Query still reports
    // isPending=true. Mask that so consumers don't see a misleading loading
    // spinner on the empty state.
    loading: Boolean(masterId) && query.isPending,
    saving: saveMutation.isPending,
    uploading: uploadMutation.isPending || uploadBase64Mutation.isPending,
    error: query.error,
    uploadError: uploadMutation.error ?? uploadBase64Mutation.error,
    saveError: saveMutation.error,
    uploadFile,
    uploadBase64,
    saveImages,
    refetch: query.refetch,
  };
}
