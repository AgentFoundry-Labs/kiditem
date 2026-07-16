import Link from 'next/link';
import { ArrowLeft, ChevronDown, Play } from 'lucide-react';

export default function ProductHeader() {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <Link
        href="/product-hub"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft size={16} aria-hidden="true" /> 상품 관리
      </Link>

      <div className="flex max-w-lg flex-col items-end gap-1.5">
        <button
          type="button"
          disabled
          aria-describedby="sellpia-workflow-unavailable"
          className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <Play size={14} aria-hidden="true" /> 워크플로우 실행 <ChevronDown size={14} aria-hidden="true" />
        </button>
        <p id="sellpia-workflow-unavailable" className="text-right text-xs text-slate-400">
          워크플로우 실행은 현재 Sellpia 읽기 전용 상품에서 지원하지 않습니다.
        </p>
      </div>
    </header>
  );
}
