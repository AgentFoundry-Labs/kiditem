import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { fileToCompressedDataUrl } from '../../../lib/compress-image';

interface KcImageFieldProps {
  value: string;
  busy?: boolean;
  onChange: (value: string) => void;
}

export function KcImageField({ value, busy = false, onChange }: KcImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const hasImage = value.trim().length > 0;
  const isBusy = isProcessing || busy;

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 등록할 수 있습니다.');
      return;
    }
    setIsProcessing(true);
    try {
      onChange(await fileToCompressedDataUrl(file));
    } catch {
      toast.error('KC 인증 이미지를 불러오지 못했습니다.');
    } finally {
      setIsProcessing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        aria-label="KC 인증 이미지 업로드"
        className="hidden"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />
      {hasImage ? (
        <img
          src={value}
          alt="KC 인증 이미지"
          className="h-24 w-24 shrink-0 rounded-lg border border-slate-200 bg-slate-50 object-contain"
        />
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isBusy}
          className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400 transition hover:border-emerald-300 hover:text-emerald-500 disabled:cursor-wait"
        >
          {isBusy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
          <span className="text-[11px] font-bold">{isBusy ? '처리 중' : '이미지 추가'}</span>
        </button>
      )}
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isBusy}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
        >
          {isBusy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
          {hasImage ? '이미지 변경' : '이미지 업로드'}
        </button>
        {hasImage && (
          <button
            type="button"
            onClick={() => onChange('')}
            disabled={isBusy}
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-black text-rose-600 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
          >
            <Trash2 size={13} />
            삭제
          </button>
        )}
        <p className="text-[11px] font-semibold text-slate-400">JPG·PNG · 자동 압축 저장</p>
      </div>
    </div>
  );
}
