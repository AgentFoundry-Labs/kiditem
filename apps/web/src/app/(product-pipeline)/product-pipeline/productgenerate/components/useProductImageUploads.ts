'use client';

import {
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { apiClient } from '@/lib/api-client';
import { friendlyError } from '@/lib/api-error';
import { moveSafetyLabelImagesToEnd } from '../../detail-template-generation/lib/detail-page-image-order';
import { prepareImageUploadFile } from '../../detail-template-generation/lib/image-whitespace-crop';

interface UseProductImageUploadsInput {
  images: string[];
  setImages: Dispatch<SetStateAction<string[]>>;
  maxImages: number;
}

const MAX_THUMBNAIL_IMAGES = 10;

export function useProductImageUploads({
  images,
  setImages,
  maxImages,
}: UseProductImageUploadsInput) {
  const [thumbnailImages, setThumbnailImages] = useState<string[]>([]);
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadImageFile = async (file: File): Promise<string> => {
    const uploadFile = await prepareImageUploadFile(file).catch((err) => {
      console.warn('[productgenerate] upload image preparation failed, using original', err);
      return file;
    });
    const formData = new FormData();
    formData.append('file', uploadFile);
    const result = await apiClient.upload<{ url: string }>(
      '/api/ai/detail-page/images',
      formData,
    );
    return result.url;
  };

  const handleThumbnailUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const files = e.target.files;
    if (!files) return;
    const slotsLeft = Math.max(0, MAX_THUMBNAIL_IMAGES - thumbnailImages.length);
    const selectedFiles = Array.from(files).slice(0, slotsLeft);
    if (selectedFiles.length === 0) {
      input.value = '';
      return;
    }
    setUploadError(null);
    setThumbnailUploading(true);
    try {
      const results = await Promise.allSettled(
        selectedFiles.map(async (file) => {
          return { name: file.name, url: await uploadImageFile(file) };
        }),
      );
      const uploaded: string[] = [];
      const failed: string[] = [];
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') uploaded.push(r.value.url);
        else {
          const name = selectedFiles[idx]?.name ?? `파일 ${idx + 1}`;
          const reason = friendlyError(r.reason);
          failed.push(reason ? `${name} (${reason})` : name);
        }
      });
      if (uploaded.length > 0) {
        setThumbnailImages((prev) => uniqueNonEmpty([...prev, ...uploaded]).slice(0, MAX_THUMBNAIL_IMAGES));
      }
      if (failed.length > 0) {
        setUploadError(`썸네일 이미지 업로드 실패: ${failed.join(', ')}`);
      }
    } catch (err) {
      console.error('[productgenerate] thumbnail upload failed', err);
      const reason = friendlyError(err) ?? '업로드 실패';
      setUploadError(`썸네일 이미지 업로드 실패: ${reason}`);
    } finally {
      setThumbnailUploading(false);
      input.value = '';
    }
  };

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const files = e.target.files;
    if (!files) return;
    const slotsLeft = Math.max(0, maxImages - images.length);
    const selectedFiles = Array.from(files).slice(0, slotsLeft);
    if (selectedFiles.length === 0) {
      input.value = '';
      return;
    }
    setUploadError(null);
    setUploadingCount(selectedFiles.length);
    try {
      const results = await Promise.allSettled(
        selectedFiles.map(async (file) => {
          return { name: file.name, url: await uploadImageFile(file) };
        }),
      );
      const uploaded: string[] = [];
      const failed: string[] = [];
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') uploaded.push(r.value.url);
        else {
          const name = selectedFiles[idx]?.name ?? `파일 ${idx + 1}`;
          const reason = friendlyError(r.reason);
          failed.push(reason ? `${name} (${reason})` : name);
        }
      });
      if (uploaded.length > 0) {
        setImages((prev) =>
          moveSafetyLabelImagesToEnd([...prev, ...uploaded]).slice(0, maxImages),
        );
      }
      if (failed.length > 0) {
        setUploadError(
          `${failed.length}개 이미지 업로드 실패: ${failed.join(', ')}`,
        );
      }
    } finally {
      setUploadingCount(0);
      input.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const removeThumbnailImage = (index: number) => {
    setThumbnailImages((prev) => prev.filter((_, i) => i !== index));
  };

  return {
    thumbnailImages,
    setThumbnailImages,
    maxThumbnailImages: MAX_THUMBNAIL_IMAGES,
    thumbnailUploading,
    uploadingCount,
    uploadError,
    handleThumbnailUpload,
    handleImageUpload,
    removeThumbnailImage,
    removeImage,
  };
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
