'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Download, FileImage, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DetailPageDownloadFormat = 'png' | 'jpeg';

export interface DetailPageDownloadOptions {
  format: DetailPageDownloadFormat;
  quality: number;
  viewportWidth: number;
  renderScale: number;
  outputWidth: number;
}

interface DownloadOptionsModalProps {
  open: boolean;
  options: DetailPageDownloadOptions;
  isDownloading: boolean;
  contentHeight: number;
  onOptionsChange: (options: DetailPageDownloadOptions) => void;
  onClose: () => void;
  onDownload: (options: DetailPageDownloadOptions) => void;
}

const FORMAT_OPTIONS: Array<{
  value: DetailPageDownloadFormat;
  label: string;
  hint: string;
}> = [
  { value: 'png', label: 'PNG', hint: '무손실' },
  { value: 'jpeg', label: 'JPEG', hint: '용량 작게' },
];

const OUTPUT_WIDTH_OPTIONS = [
  { value: 760, label: '760px', hint: '쿠팡' },
  { value: 780, label: '780px', hint: '쿠팡 권장' },
  { value: 800, label: '800px', hint: '11번가' },
  { value: 860, label: '860px', hint: '네이버/G마켓' },
];

function estimateOutputHeight(options: DetailPageDownloadOptions, contentHeight: number): number {
  const ratio = options.outputWidth / options.viewportWidth;
  return Math.max(1, Math.round(contentHeight * ratio));
}

function estimateFileSize(options: DetailPageDownloadOptions, outputHeight: number): string {
  const megapixels = (options.outputWidth * outputHeight) / 1_000_000;
  const bytesPerMegapixel = options.format === 'png'
    ? 480_000
    : 220_000 * (options.quality / 92);
  const estimatedMb = Math.max(0.1, (megapixels * bytesPerMegapixel) / 1_000_000);
  if (estimatedMb < 1) return `약 ${Math.round(estimatedMb * 1000)}KB`;
  return `약 ${estimatedMb.toFixed(1)}MB`;
}

export function DownloadOptionsModal({
  open,
  options,
  isDownloading,
  contentHeight,
  onOptionsChange,
  onClose,
  onDownload,
}: DownloadOptionsModalProps) {
  const qualityDisabled = options.format === 'png';
  const outputHeight = estimateOutputHeight(options, contentHeight);
  const estimatedSize = estimateFileSize(options, outputHeight);

  const updateOptions = (next: Partial<DetailPageDownloadOptions>) => {
    onOptionsChange({ ...options, ...next });
  };

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => (!nextOpen && !isDownloading ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/35 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[110] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-[var(--border,#e2e8f0)] bg-[var(--surface,white)] shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          onEscapeKeyDown={(e) => {
            if (isDownloading) e.preventDefault();
          }}
        >
          <div className="flex items-center justify-between border-b border-[var(--border,#e2e8f0)] px-5 py-3">
            <Dialog.Title className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary,#0f172a)]">
              <FileImage size={16} />
              다운로드 옵션
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              상세페이지 이미지 파일 형식, 너비, 화질을 선택합니다.
            </Dialog.Description>
            <button
              type="button"
              onClick={onClose}
              disabled={isDownloading}
              className="rounded-md p-1 text-[var(--text-tertiary,#94a3b8)] transition-colors hover:bg-[var(--surface-sunken,#f1f5f9)] hover:text-[var(--text-secondary,#475569)] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="닫기"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-5 px-5 py-4">
            <div>
              <div className="mb-2 text-xs font-bold text-[var(--text-secondary,#475569)]">파일 형식</div>
              <div className="grid grid-cols-2 gap-2">
                {FORMAT_OPTIONS.map((format) => (
                  <button
                    key={format.value}
                    type="button"
                    onClick={() => updateOptions({ format: format.value })}
                    disabled={isDownloading}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                      options.format === format.value
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-[var(--border,#e2e8f0)] text-[var(--text-secondary,#475569)] hover:border-emerald-200 hover:bg-emerald-50/50',
                    )}
                  >
                    <span className="block text-sm font-bold">{format.label}</span>
                    <span className="block text-[11px] font-medium opacity-75">{format.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--text-secondary,#475569)]">최종 파일 폭</span>
                <span className="text-xs font-semibold text-[var(--text-tertiary,#94a3b8)]">
                  {options.outputWidth}px
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {OUTPUT_WIDTH_OPTIONS.map((width) => (
                  <button
                    key={width.value}
                    type="button"
                    onClick={() => updateOptions({ outputWidth: width.value })}
                    disabled={isDownloading}
                    className={cn(
                      'rounded-md border px-2 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                      options.outputWidth === width.value
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-[var(--border,#e2e8f0)] text-[var(--text-secondary,#475569)] hover:bg-[var(--surface-sunken,#f1f5f9)]',
                    )}
                  >
                    <span className="block text-xs font-bold">{width.label}</span>
                    <span className="block text-[10px] font-medium opacity-75">{width.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">예상 용량</span>
                <span className="font-black text-slate-900">{estimatedSize}</span>
              </div>
              <div className="mt-1 text-[11px] font-medium text-slate-500">
                {options.outputWidth}px × {outputHeight}px 기준
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--text-secondary,#475569)]">JPEG 화질</span>
                <span
                  className={cn(
                    'text-xs font-semibold',
                    qualityDisabled ? 'text-[var(--text-tertiary,#94a3b8)]' : 'text-emerald-700',
                  )}
                >
                  {qualityDisabled ? 'PNG는 무손실' : `${options.quality}%`}
                </span>
              </div>
              <input
                type="range"
                min={60}
                max={100}
                step={1}
                value={options.quality}
                onChange={(e) => updateOptions({ quality: Number(e.target.value) })}
                disabled={qualityDisabled || isDownloading}
                className="h-2 w-full accent-emerald-500 disabled:opacity-40"
                aria-label="JPEG 화질"
              />
              <div className="mt-1 flex justify-between text-[11px] font-medium text-[var(--text-tertiary,#94a3b8)]">
                <span>작은 용량</span>
                <span>최고 화질</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-[var(--border,#e2e8f0)] px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isDownloading}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-[var(--text-secondary,#475569)] transition-colors hover:bg-[var(--surface-sunken,#f1f5f9)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => onDownload(options)}
              disabled={isDownloading}
              className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              다운로드
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
