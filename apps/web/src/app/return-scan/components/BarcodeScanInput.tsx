'use client';

import { ScanBarcode, Loader2 } from 'lucide-react';

interface Props {
  barcode: string;
  scanning: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onBarcodeChange: (value: string) => void;
  onSubmit: () => void;
}

export default function BarcodeScanInput({
  barcode,
  scanning,
  inputRef,
  onBarcodeChange,
  onSubmit,
}: Props) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSubmit();
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/80 rounded-t-xl">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          바코드 스캔 / 입력
        </h3>
      </div>
      <div className="p-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <ScanBarcode
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              ref={inputRef}
              type="text"
              placeholder="바코드를 스캔하거나 SKU/상품명 입력 후 Enter..."
              value={barcode}
              onChange={(e) => onBarcodeChange(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>
          <button
            disabled={!barcode.trim() || scanning}
            onClick={onSubmit}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {scanning ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              '조회'
            )}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          바코드 스캐너로 자동입력하거나, 직접 SKU/상품명을 입력하세요.
        </p>
      </div>
    </div>
  );
}
