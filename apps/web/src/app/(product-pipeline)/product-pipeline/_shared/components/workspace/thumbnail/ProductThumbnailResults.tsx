'use client';

import { useState } from 'react';
import { Brush, Download, ImagePlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { RegistrationThumbnailOption } from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/registration-selection';
import {
  downloadImageFile,
  type ImageDownloadFormat,
} from '@/lib/browser-download';
import { cn } from '@/lib/utils';

type DownloadSizePresetKey =
  | 'original'
  | 'smartstore'
  | 'coupang'
  | 'elevenstreet'
  | 'gmarket'
  | 'wemakeprice';

interface ProductThumbnailResultsProps {
  options: RegistrationThumbnailOption[];
  previewImageUrls: string[];
  onPreviewThumbnail: (url: string | null) => void;
  onAddToPreviewImages: (url: string) => void;
  onEditThumbnail: (url: string) => void;
}

export default function ProductThumbnailResults({
  options,
  previewImageUrls,
  onPreviewThumbnail,
  onAddToPreviewImages,
  onEditThumbnail,
}: ProductThumbnailResultsProps) {
  const [previewOption, setPreviewOption] = useState<RegistrationThumbnailOption | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<ImageDownloadFormat>('original');
  const [downloadSizeKey, setDownloadSizeKey] = useState<DownloadSizePresetKey>('original');
  const [isDownloading, setIsDownloading] = useState(false);
  const previewImageUrlSet = new Set(previewImageUrls);

  const openPreview = (option: RegistrationThumbnailOption) => {
    setPreviewOption(option);
    onPreviewThumbnail(option.url);
  };

  const handleDownload = async () => {
    if (!previewOption || isDownloading) return;
    const sizePreset = DOWNLOAD_SIZE_PRESETS.find((preset) => preset.key === downloadSizeKey);
    setIsDownloading(true);
    try {
      await downloadImageFile(
        previewOption.url,
        buildDownloadName({
          index: options.indexOf(previewOption) + 1,
          sizeLabel: sizePreset?.fileSuffix,
        }),
        {
          format: downloadFormat,
          width: sizePreset?.width,
          height: sizePreset?.height,
          fit: sizePreset?.fit,
        },
      );
    } catch (err) {
      console.error('[thumbnail-workspace] download failed', err);
      toast.error('이미지 다운로드에 실패했어요. 다시 시도해주세요.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">생성 이미지 이력</h3>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-500">
          {options.length}장
        </span>
      </div>
      {options.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm font-semibold text-slate-400">
          아직 생성 결과가 없습니다
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-5">
          {options.map((option, index) => {
            const alreadyAdded = previewImageUrlSet.has(option.url);
            return (
              <div
                key={`${option.generatedCandidateId ?? option.url}`}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white transition hover:border-violet-300"
              >
                <button
                  type="button"
                  onClick={() => openPreview(option)}
                  className="relative block aspect-square w-full overflow-hidden"
                  aria-label={`생성 결과 미리보기 ${index + 1}`}
                >
                  <img src={option.url} alt="" className="h-full w-full object-cover" />
                  <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                    생성 {index + 1}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onAddToPreviewImages(option.url)}
                  disabled={alreadyAdded}
                  className={cn(
                    'flex w-full items-center justify-center gap-2 border-t px-3 py-2.5 text-xs font-black transition',
                    alreadyAdded
                      ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400'
                      : 'border-violet-100 bg-white text-violet-700 hover:bg-violet-50',
                  )}
                  aria-label={`생성 ${index + 1} 미리보기 이미지로 추가`}
                >
                  <ImagePlus size={14} />
                  {alreadyAdded ? '추가됨' : '미리보기 이미지로 추가'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {previewOption && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="생성 이미지 미리보기"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-sm font-black text-slate-900">생성 이미지 미리보기</h3>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  쇼핑몰 대표 이미지 크기와 파일 형식을 고릅니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewOption(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                aria-label="닫기"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <img
                  src={previewOption.url}
                  alt=""
                  className="max-h-[64vh] w-full object-contain"
                />
              </div>

              <div className="flex min-h-full flex-col lg:min-h-[64vh]">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-black text-slate-900">파일 형식</h4>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {DOWNLOAD_FORMATS.map((format) => (
                        <button
                          key={format.value}
                          type="button"
                          onClick={() => setDownloadFormat(format.value)}
                          className={cn(
                            'rounded-md border px-3 py-2 text-xs font-black transition',
                            downloadFormat === format.value
                              ? 'border-violet-500 bg-violet-50 text-violet-800'
                              : 'border-slate-200 text-slate-500 hover:border-violet-200 hover:text-violet-700',
                          )}
                        >
                          {format.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-black text-slate-900">이미지 크기</h4>
                    <div className="mt-2 space-y-2">
                      {DOWNLOAD_SIZE_PRESETS.map((preset) => (
                        <button
                          key={preset.key}
                          type="button"
                          onClick={() => setDownloadSizeKey(preset.key)}
                          className={cn(
                            'flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition',
                            downloadSizeKey === preset.key
                              ? 'border-violet-500 bg-violet-50 text-violet-800'
                              : 'border-slate-200 text-slate-600 hover:border-violet-200 hover:text-violet-700',
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-black">{preset.label}</span>
                            <span className="block truncate text-[11px] font-semibold text-slate-400">
                              {preset.description}
                            </span>
                          </span>
                          <span className="shrink-0 text-[11px] font-black">
                            {preset.sizeText}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-auto space-y-2 pt-4">
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-violet-600 px-3 py-2.5 text-xs font-black text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    {isDownloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                    다운로드
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditThumbnail(previewOption.url)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs font-black text-violet-800 transition hover:border-violet-300"
                  >
                    <Brush size={15} />
                    이미지 편집기로 가기
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const DOWNLOAD_FORMATS: Array<{ value: ImageDownloadFormat; label: string }> = [
  { value: 'original', label: '원본' },
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
];

const DOWNLOAD_SIZE_PRESETS: Array<{
  key: DownloadSizePresetKey;
  label: string;
  description: string;
  sizeText: string;
  fileSuffix?: string;
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain';
}> = [
  {
    key: 'original',
    label: '원본 크기',
    description: '생성된 이미지 그대로',
    sizeText: '원본',
  },
  {
    key: 'smartstore',
    label: '스마트스토어',
    description: '대표 이미지 권장',
    sizeText: '640 x 640',
    fileSuffix: 'smartstore-640',
    width: 640,
    height: 640,
    fit: 'cover',
  },
  {
    key: 'coupang',
    label: '쿠팡',
    description: '대표 이미지 정사각형',
    sizeText: '1000 x 1000',
    fileSuffix: 'coupang-1000',
    width: 1000,
    height: 1000,
    fit: 'cover',
  },
  {
    key: 'elevenstreet',
    label: '11번가',
    description: '대표 이미지 권장',
    sizeText: '600 x 600',
    fileSuffix: '11st-600',
    width: 600,
    height: 600,
    fit: 'cover',
  },
  {
    key: 'gmarket',
    label: '지마켓/옥션',
    description: '대표 이미지 권장',
    sizeText: '1000 x 1000',
    fileSuffix: 'gmarket-auction-1000',
    width: 1000,
    height: 1000,
    fit: 'cover',
  },
  {
    key: 'wemakeprice',
    label: '위메프',
    description: '대표 이미지 권장',
    sizeText: '460 x 460',
    fileSuffix: 'wemakeprice-460',
    width: 460,
    height: 460,
    fit: 'cover',
  },
];

function buildDownloadName(input: { index: number; sizeLabel?: string }): string {
  return input.sizeLabel
    ? `generated-thumbnail-${input.index}-${input.sizeLabel}`
    : `generated-thumbnail-${input.index}`;
}
