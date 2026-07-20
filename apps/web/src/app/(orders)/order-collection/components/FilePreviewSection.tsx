import { Download, X } from 'lucide-react';
import { PreviewTable } from './PreviewTable';
import type { ConversionHistoryItem } from '../lib/order-collection-page-model';

interface FilePreviewSectionProps {
  item: ConversionHistoryItem;
  onDownload: (item: ConversionHistoryItem) => void;
  onClose: () => void;
}

export function FilePreviewSection({ item, onDownload, onClose }: FilePreviewSectionProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">파일 미리보기</div>
          <div className="mt-1 max-w-full truncate text-xs text-slate-500">{item.fileName}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onDownload(item)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download size={15} />
            다운로드
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="미리보기 닫기"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <PreviewTable rows={item.previewRows} />
    </section>
  );
}
