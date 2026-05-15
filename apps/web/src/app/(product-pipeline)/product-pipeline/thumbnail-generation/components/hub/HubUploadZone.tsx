'use client';

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageIcon, UploadCloud, X } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

import { thumbnailGenerationEditHref } from '../../../_shared/lib/product-pipeline-routes';
import { writeThumbnailEditorUpload } from '../../edit/lib/upload-session';

export type HubUploadZoneHandle = {
  openFilePicker: (mode?: 'edit' | 'creative' | null) => void;
};

type Props = {
  hideDropzone?: boolean;
  returnTo?: string | null;
};

export const HubUploadZone = forwardRef<HubUploadZoneHandle, Props>(function HubUploadZone(
  { hideDropzone = false, returnTo = null },
  ref,
) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingModeRef = useRef<'edit' | 'creative' | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [productName, setProductName] = useState('');
  const [pendingDataUrl, setPendingDataUrl] = useState<string | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useImperativeHandle(ref, () => ({
    openFilePicker: (mode = null) => {
      pendingModeRef.current = mode;
      setProductName('');
      setPendingDataUrl(null);
      setPendingFileName(null);
      setModalOpen(true);
    },
  }));

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setPendingDataUrl(reader.result);
      setPendingFileName(file.name);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const closeModal = () => {
    setModalOpen(false);
    pendingModeRef.current = null;
    setProductName('');
    setPendingDataUrl(null);
    setPendingFileName(null);
  };

  const handleSubmit = () => {
    const trimmedName = productName.trim();
    if (!trimmedName) {
      toast.error('상품명을 입력해 주세요.');
      return;
    }
    if (!pendingDataUrl) {
      toast.error('상품 이미지를 업로드해 주세요.');
      return;
    }

    const mode = pendingModeRef.current ?? 'edit';
    const uploadKey = writeThumbnailEditorUpload(pendingDataUrl, {
      productName: trimmedName,
      mode,
    });
    closeModal();
    router.push(thumbnailGenerationEditHref({
      editCase: mode === 'edit' ? 'single' : null,
      extraParams: { uploadKey },
      mode,
      productName: trimmedName,
      returnTo,
    }));
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        e.target.value = '';
      }}
    />
  );

  return (
    <>
      {hideDropzone ? (
        fileInput
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'backdrop-blur-xl border-2 border-dashed rounded-2xl px-8 py-16 min-h-[280px] flex flex-col items-center justify-center text-center transition-colors cursor-pointer shadow-[0_4px_24px_rgba(99,102,241,0.05)]',
            dragOver
              ? 'bg-violet-100/40 border-violet-400'
              : 'bg-slate-200/50 border-slate-300/70 hover:bg-slate-200/70',
          )}
        >
          <div className="w-16 h-16 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center shadow-sm border border-white/60 mb-4">
            <UploadCloud size={30} className="text-violet-600" />
          </div>
          <h4 className="text-lg font-bold text-gray-900 mb-1.5">편집할 이미지를 업로드하세요</h4>
          <p className="text-sm text-gray-500 mb-5">파일을 여기로 드래그하거나 클릭하여 탐색기 열기</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="bg-violet-600 text-white px-5 py-2 rounded-lg font-bold text-sm shadow-md shadow-violet-300/50 hover:bg-violet-700 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
            >
              파일 업로드
            </button>
            <span className="text-xs text-gray-500 font-medium">또는</span>
            <button
              type="button"
              className="bg-white/70 backdrop-blur-sm border border-white/70 text-gray-900 px-5 py-2 rounded-lg font-bold text-sm hover:bg-white transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
            >
              내 컴퓨터 탐색
            </button>
          </div>
          {fileInput}
        </div>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-500">
                  Thumbnail
                </div>
                <h2 className="mt-0.5 text-base font-extrabold text-gray-900">이미지 넣기</h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                aria-label="닫기"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <label className="block">
                <span className="text-xs font-bold text-gray-700">상품명</span>
                <input
                  autoFocus
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="예: 키즈 LED 무드등"
                  className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-violet-400 focus:bg-white"
                />
              </label>

              <div>
                <span className="text-xs font-bold text-gray-700">상품 이미지 업로드</span>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className={cn(
                    'mt-1.5 flex w-full items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-4 text-left transition-colors',
                    pendingDataUrl
                      ? 'border-violet-200 bg-violet-50/70'
                      : 'border-gray-200 bg-gray-50 hover:border-violet-300 hover:bg-violet-50/50',
                  )}
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm">
                    {pendingDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={pendingDataUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon size={20} className="text-violet-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-gray-900">
                      {pendingFileName ?? '이미지 선택'}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      JPG, PNG, WebP 이미지를 업로드하세요.
                    </div>
                  </div>
                  <UploadCloud size={18} className="shrink-0 text-violet-500" />
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-100"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-violet-300/50 transition-colors hover:bg-violet-700"
              >
                생성 화면으로 이동
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
