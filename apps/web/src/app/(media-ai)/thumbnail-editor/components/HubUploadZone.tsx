'use client';

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

import { ProductPickerModal } from './ProductPickerModal';

export type HubUploadZoneHandle = {
  openFilePicker: () => void;
};

type Props = {
  pendingMode?: 'edit' | 'creative' | null;
};

export const HubUploadZone = forwardRef<HubUploadZoneHandle, Props>(function HubUploadZone(
  { pendingMode },
  ref,
) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingDataUrl, setPendingDataUrl] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useImperativeHandle(ref, () => ({
    openFilePicker: () => inputRef.current?.click(),
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
      setPickerOpen(true);
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

  const handlePick = (product: { id: string; name: string }) => {
    if (!pendingDataUrl) return;
    setPickerOpen(false);
    const params = new URLSearchParams({ productId: product.id, imageUrl: pendingDataUrl });
    if (pendingMode) params.set('mode', pendingMode);
    router.push(`/thumbnail-editor/edit?${params.toString()}`);
    setPendingDataUrl(null);
  };

  return (
    <>
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
      </div>

      <ProductPickerModal
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setPendingDataUrl(null);
        }}
        onPick={handlePick}
      />
    </>
  );
});
