'use client';

import type { ChangeEvent, DragEvent } from 'react';
import { useMemo, useState } from 'react';
import {
  Brush,
  CheckCircle2,
  GripVertical,
  ImagePlus,
  Loader2,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RegistrationThumbnailOption } from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/registration-selection';

type ImageLibraryTab = 'all' | 'upload' | 'generated';

interface ThumbnailSourcePickerProps {
  thumbnailUrls: string[];
  availableOptions: RegistrationThumbnailOption[];
  selectedUrl: string | null;
  savedRepresentativeUrl: string | null;
  onSelect: (url: string) => void;
  onEditSelectedImage: () => void;
  onSaveConfiguration: () => void;
  onRegisterRepresentative: () => void;
  onAddImages: (urls: string[]) => void;
  onRemoveImage: (url: string) => void;
  onReorderImages: (images: string[]) => void;
  onUploadImages: (files: File[]) => Promise<void> | void;
  uploadingCount?: number;
}

export default function ThumbnailSourcePicker({
  thumbnailUrls,
  availableOptions,
  selectedUrl,
  savedRepresentativeUrl,
  onSelect,
  onEditSelectedImage,
  onSaveConfiguration,
  onRegisterRepresentative,
  onAddImages,
  onRemoveImage,
  onReorderImages,
  onUploadImages,
  uploadingCount = 0,
}: ThumbnailSourcePickerProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [libraryTab, setLibraryTab] = useState<ImageLibraryTab>('all');
  const [pendingUrls, setPendingUrls] = useState<Set<string>>(new Set());
  const [draggingUrl, setDraggingUrl] = useState<string | null>(null);
  const selectedOption = useMemo(
    () =>
      availableOptions.find((option) => option.url === selectedUrl) ??
      (selectedUrl ? { url: selectedUrl, kind: 'source' as const, generatedCandidateId: null } : null),
    [availableOptions, selectedUrl],
  );
  const selectedAlreadySaved = Boolean(selectedUrl && selectedUrl === savedRepresentativeUrl);
  const selectedCanBecomeRepresentative = Boolean(
    selectedUrl && selectedUrl !== savedRepresentativeUrl,
  );
  const thumbnailUrlSet = useMemo(() => new Set(thumbnailUrls), [thumbnailUrls]);
  const libraryOptions = useMemo(() => {
    if (libraryTab === 'upload') return availableOptions.filter((option) => option.kind === 'source');
    if (libraryTab === 'generated') return availableOptions.filter((option) => option.kind === 'generated');
    return availableOptions;
  }, [availableOptions, libraryTab]);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) return;
    try {
      await onUploadImages(files);
    } finally {
      input.value = '';
    }
  };
  const togglePendingUrl = (url: string) => {
    setPendingUrls((current) => {
      const next = new Set(current);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  };
  const handleAddPending = () => {
    const urls = Array.from(pendingUrls);
    if (urls.length === 0) return;
    onAddImages(urls);
    setPendingUrls(new Set());
    setModalOpen(false);
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>, targetUrl: string) => {
    event.preventDefault();
    if (!draggingUrl || draggingUrl === targetUrl) return;
    const fromIndex = thumbnailUrls.indexOf(draggingUrl);
    const toIndex = thumbnailUrls.indexOf(targetUrl);
    if (fromIndex < 0 || toIndex < 0) return;
    const next = [...thumbnailUrls];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onReorderImages(next);
    setDraggingUrl(null);
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-900">썸네일 이미지 구성</h3>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onEditSelectedImage}
            disabled={!selectedUrl}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-800 transition hover:border-violet-300 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Brush size={15} />
            선택 이미지 편집하기
          </button>
          <button
            type="button"
            onClick={onRegisterRepresentative}
            disabled={!selectedCanBecomeRepresentative}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <CheckCircle2 size={15} />
            대표 썸네일 등록
          </button>
          <button
            type="button"
            onClick={onSaveConfiguration}
            disabled={thumbnailUrls.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-violet-600 px-3 py-2 text-xs font-black text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            <Save size={15} />
            썸네일 구성 저장
          </button>
        </div>
      </div>

      <div className="grid gap-6 rounded-lg border border-violet-100 bg-violet-50/50 p-4 xl:grid-cols-[356px_1px_minmax(0,1fr)]">
        <div className="w-full max-w-[316px] sm:max-w-[356px] xl:max-w-none">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h4 className="text-xs font-black text-violet-800">대표 썸네일</h4>
            {selectedAlreadySaved && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-violet-700 ring-1 ring-violet-100">
                <CheckCircle2 size={11} />
                등록 대표
              </span>
            )}
          </div>
          {selectedOption ? (
            <div className="overflow-hidden rounded-lg border border-violet-200 bg-white">
              <div className="aspect-square">
                <img src={selectedOption.url} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="border-t border-violet-100 px-3 py-2.5">
                <p className="text-xs font-black text-slate-500">
                  {selectedOption.kind === 'generated' ? '생성 썸네일' : '상품 이미지'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-violet-200 bg-white text-xs font-bold text-slate-400">
              대표 이미지 없음
            </div>
          )}
        </div>

        <div className="hidden bg-violet-200/80 lg:block" />

        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-black text-slate-700">썸네일 미리보기 이미지</h4>
            </div>
            <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-500 ring-1 ring-slate-100">
              {thumbnailUrls.length}장
            </span>
          </div>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
            {thumbnailUrls.map((url, index) => {
              const selected = selectedUrl === url;
              const savedRepresentative = Boolean(savedRepresentativeUrl && url === savedRepresentativeUrl);
              return (
                <div
                  key={url}
                  draggable
                  onDragStart={() => setDraggingUrl(url)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleDrop(event, url)}
                  onDragEnd={() => setDraggingUrl(null)}
                  onClick={() => onSelect(url)}
                  className={cn(
                    'group relative aspect-square cursor-grab overflow-hidden rounded-lg border bg-white text-left transition active:cursor-grabbing',
                    savedRepresentative
                      ? 'border-emerald-500 ring-2 ring-emerald-100'
                      : selected
                        ? 'border-violet-500 ring-2 ring-violet-200'
                        : 'border-slate-200 hover:border-violet-300',
                    draggingUrl === url && 'opacity-50',
                  )}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(url);
                    }
                  }}
                  aria-label={`썸네일 미리보기 이미지 ${index + 1}`}
                >
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <span
                    className={cn(
                      'absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold',
                      savedRepresentative ? 'text-emerald-700' : 'text-slate-700',
                    )}
                  >
                    {savedRepresentative ? '등록 대표' : `이미지 ${index + 1}`}
                  </span>
                  <span className="absolute left-2 bottom-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-slate-500 shadow-sm ring-1 ring-slate-100">
                    <GripVertical size={14} />
                  </span>
                  <button
                    type="button"
                    aria-label={`썸네일 미리보기 이미지 ${index + 1} 제거`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveImage(url);
                    }}
                    className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-slate-500 opacity-0 shadow-sm ring-1 ring-slate-100 transition hover:text-rose-600 group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                  {(savedRepresentative || selected) && (
                    <span
                      className={cn(
                        'absolute bottom-0 left-0 right-0 py-1 text-center text-[11px] font-bold text-white',
                        savedRepresentative ? 'bg-emerald-600' : 'bg-violet-600',
                      )}
                    >
                      {savedRepresentative ? '등록 대표' : '선택됨'}
                    </span>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex aspect-square min-h-[150px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white text-xs font-bold text-slate-500 transition hover:border-violet-300 hover:text-violet-600"
            >
              <ImagePlus size={22} />
              <span>이미지 추가</span>
            </button>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="썸네일 이미지 추가"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
        >
          <div className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-sm font-black text-slate-900">이미지 추가</h3>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  상품 관련 이미지에서 썸네일 미리보기로 쓸 이미지를 고릅니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                aria-label="닫기"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
                  {[
                    ['all', '전체'],
                    ['upload', '업로드'],
                    ['generated', '생성'],
                  ].map(([tab, label]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setLibraryTab(tab as ImageLibraryTab)}
                      className={cn(
                        'rounded px-3 py-1.5 text-xs font-black transition',
                        libraryTab === tab
                          ? 'bg-white text-violet-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label
                  className={cn(
                    'relative inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:border-violet-300 hover:text-violet-700',
                    uploadingCount > 0 && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleUpload}
                    disabled={uploadingCount > 0}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                  />
                  {uploadingCount > 0 ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <ImagePlus size={15} />
                  )}
                  <span>{uploadingCount > 0 ? `${uploadingCount}장 업로드 중` : '업로드'}</span>
                </label>
              </div>

              {libraryOptions.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                  {libraryOptions.map((option, index) => {
                    const alreadyAdded = thumbnailUrlSet.has(option.url);
                    const pending = pendingUrls.has(option.url);
                    return (
                      <button
                        key={`${option.kind}-${option.url}`}
                        type="button"
                        onClick={() => {
                          if (!alreadyAdded) togglePendingUrl(option.url);
                        }}
                        disabled={alreadyAdded}
                        className={cn(
                          'relative aspect-square overflow-hidden rounded-lg border bg-white text-left transition',
                          pending
                            ? 'border-violet-500 ring-2 ring-violet-200'
                            : 'border-slate-200 hover:border-violet-300',
                          alreadyAdded && 'cursor-not-allowed opacity-55',
                        )}
                        aria-label={`상품 이미지 ${index + 1}`}
                      >
                        <img src={option.url} alt="" className="h-full w-full object-cover" />
                        <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                          {option.kind === 'generated' ? '생성' : '업로드'}
                        </span>
                        {(pending || alreadyAdded) && (
                          <span className="absolute bottom-0 left-0 right-0 bg-violet-600 py-1 text-center text-[11px] font-bold text-white">
                            {alreadyAdded ? '추가됨' : '선택'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-xs font-bold text-slate-400">
                  이미지가 없습니다.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-md border border-slate-200 px-4 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleAddPending}
                disabled={pendingUrls.size === 0}
                className="rounded-md bg-violet-600 px-4 py-2 text-xs font-black text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                선택 이미지 추가
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
