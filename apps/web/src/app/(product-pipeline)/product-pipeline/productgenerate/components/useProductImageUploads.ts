'use client';

import {
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { apiClient } from '@/lib/api-client';
import { moveSafetyLabelImagesToEnd } from '../../detail-template-generation/lib/detail-page-image-order';
import { cropImageWhitespaceFile } from '../../detail-template-generation/lib/image-whitespace-crop';

interface UseProductImageUploadsInput {
  images: string[];
  setImages: Dispatch<SetStateAction<string[]>>;
  maxImages: number;
}

export function useProductImageUploads({
  images,
  setImages,
  maxImages,
}: UseProductImageUploadsInput) {
  const [thumbnailImage, setThumbnailImage] = useState<string | null>(null);
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadImageFile = async (file: File): Promise<string> => {
    const uploadFile = await cropImageWhitespaceFile(file).catch((err) => {
      console.warn('[productgenerate] upload image whitespace crop failed, using original', err);
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
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setThumbnailUploading(true);
    try {
      setThumbnailImage(await uploadImageFile(file));
    } catch {
      setUploadError(`썸네일 이미지 업로드 실패: ${file.name}`);
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
        else failed.push(selectedFiles[idx]?.name ?? `파일 ${idx + 1}`);
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

  return {
    thumbnailImage,
    setThumbnailImage,
    thumbnailUploading,
    uploadingCount,
    uploadError,
    handleThumbnailUpload,
    handleImageUpload,
    removeImage,
  };
}
