'use client';

import type { ChangeEvent } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Field } from './ProductInputFields';

interface ProductImageInputsProps {
  thumbnailImages: string[];
  maxThumbnailImages: number;
  thumbnailUploading: boolean;
  uploadingCount: number;
  images: string[];
  maxImages: number;
  onThumbnailUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onImageUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onThumbnailRemove: (index: number) => void;
  onImageRemove: (index: number) => void;
}

export function ProductImageInputs({
  thumbnailImages,
  maxThumbnailImages,
  thumbnailUploading,
  uploadingCount,
  images,
  maxImages,
  onThumbnailUpload,
  onImageUpload,
  onThumbnailRemove,
  onImageRemove,
}: ProductImageInputsProps) {
  return (
    <>
      <Field label="썸네일 이미지" trailing={`${thumbnailImages.length} / ${maxThumbnailImages}`}>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-3">
          <div className="flex h-[116px] gap-3 overflow-x-auto pb-1">
            <label
              className={cn(
                'relative flex h-[104px] w-[104px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]',
                thumbnailUploading || thumbnailImages.length >= maxThumbnailImages
                  ? 'cursor-not-allowed opacity-50'
                  : 'cursor-pointer',
              )}
            >
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={onThumbnailUpload}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                disabled={thumbnailUploading || thumbnailImages.length >= maxThumbnailImages}
              />
              {thumbnailUploading ? (
                <Loader2 size={22} className="animate-spin" />
              ) : (
                <ImagePlus size={24} />
              )}
              <span className="text-[11px] font-bold">
                {thumbnailUploading ? '업로드 중' : '썸네일 추가'}
              </span>
            </label>

            {thumbnailImages.map((thumbnailImage, idx) => (
              <div
                key={`${thumbnailImage}-${idx}`}
                className="group relative h-[104px] w-[104px] shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]"
              >
                <img
                  src={thumbnailImage}
                  alt={`등록 썸네일 이미지 ${idx + 1}`}
                  className="h-full w-full object-cover"
                />
                {idx === 0 && (
                  <span className="absolute bottom-1.5 left-1.5 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white shadow-sm">
                    대표
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onThumbnailRemove(idx)}
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
                  aria-label="썸네일 이미지 삭제"
                >
                  <X size={13} />
                </button>
              </div>
            ))}

            {thumbnailImages.length === 0 && (
              <div className="flex h-[104px] min-w-[220px] items-center text-xs font-medium text-[var(--text-muted)]">
                상품 썸네일 후보를 여러 장 추가할 수 있습니다. 첫 번째 이미지가 대표로 사용됩니다.
              </div>
            )}
          </div>
        </div>
      </Field>

      <Field label="상품 이미지" required trailing={`필수 · ${images.length} / ${maxImages}`}>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-3">
          <div className="flex h-[116px] gap-3 overflow-x-auto pb-1">
            <label
              className={cn(
                'relative flex h-[104px] w-[104px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]',
                images.length >= maxImages || uploadingCount > 0
                  ? 'cursor-not-allowed opacity-50'
                  : 'cursor-pointer',
              )}
            >
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={onImageUpload}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                disabled={images.length >= maxImages || uploadingCount > 0}
              />
              {uploadingCount > 0 ? (
                <Loader2 size={22} className="animate-spin" />
              ) : (
                <ImagePlus size={24} />
              )}
              <span className="text-[11px] font-bold">
                {uploadingCount > 0 ? `${uploadingCount}장 업로드` : '이미지 추가'}
              </span>
            </label>

            {images.map((img, idx) => (
              <div
                key={`${img}-${idx}`}
                className="group relative h-[104px] w-[104px] shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]"
              >
                <img
                  src={img}
                  alt={`상품 이미지 ${idx + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => onImageRemove(idx)}
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
                  aria-label="이미지 삭제"
                >
                  <X size={13} />
                </button>
              </div>
            ))}

            {images.length === 0 && (
              <div className="flex h-[104px] min-w-[220px] items-center text-xs font-medium text-[var(--text-muted)]">
                상세페이지 생성에는 상품 이미지가 최소 1장 필요합니다.
              </div>
            )}
          </div>
        </div>
      </Field>
    </>
  );
}
