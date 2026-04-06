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
  inputRef: React.RefObject<HTMLInputElement>;
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
    <div className="mb-4 p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
      <div className="flex items-center gap-2">
        <LinkIcon size={16} className="text-slate-500" />
        <input
          ref={inputRef}
          type="text"
          value={scrapeUrl}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="1688.com 또는 alibaba.com 상품 URL 입력"
          className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-white"
          disabled={isPending}
        />
        <button
          onClick={onSubmit}
          disabled={isPending || !scrapeUrl.trim()}
          className="px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? <Loader2 size={16} className="animate-spin" /> : '수집'}
        </button>
        <button
          onClick={onClose}
          disabled={isPending}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-50 transition-colors"
        >
          <X size={16} />
        </button>
      </div>
      {error && (
        <div className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-2 text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
          {success}
        </div>
      )}
    </div>
  );
}
