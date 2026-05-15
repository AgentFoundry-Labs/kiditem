'use client';

import { Link as LinkIcon, Loader2, X } from 'lucide-react';

interface Props {
  scrapeUrl: string;
  onChange: (url: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
  onClose: () => void;
  isPending: boolean;
  error: string | null;
  success: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export default function ScrapeUrlInput({
  scrapeUrl,
  onChange,
  onKeyDown,
  onSubmit,
  onClose,
  isPending,
  error,
  success,
  inputRef,
}: Props) {
  return (
    <div className="mb-4 p-3 bg-white border border-slate-200 rounded-md">
      <div className="flex items-center gap-2">
        <LinkIcon size={14} className="text-slate-400 ml-1" />
        <input
          ref={inputRef}
          type="text"
          value={scrapeUrl}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="1688.com 또는 alibaba.com 상품 URL 입력"
          className="flex-1 px-2.5 h-8 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-white"
          disabled={isPending}
        />
        <button
          onClick={onSubmit}
          disabled={isPending || !scrapeUrl.trim()}
          className="h-8 px-3 bg-emerald-500 text-white text-xs font-semibold rounded-md hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : '수집'}
        </button>
        <button
          onClick={onClose}
          disabled={isPending}
          className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md disabled:opacity-50 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
      {error && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-md">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-2 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-md">
          {success}
        </div>
      )}
    </div>
  );
}
