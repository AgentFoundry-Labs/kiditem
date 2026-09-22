import { ArrowLeft, Pencil } from 'lucide-react';
import { MasterProductImage } from '../../components/MasterProductImage';
import type { MasterProductOperationsDetail } from '@kiditem/shared/product-operations';

export default function ProductHeader({
  product,
  onBack,
  onEdit,
}: {
  product: MasterProductOperationsDetail;
  onBack: () => void;
  onEdit: () => void;
}) {
  return (
    <header className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        aria-label="이전 화면으로 돌아가기"
        className="inline-flex items-center gap-1 text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
      >
        <ArrowLeft size={16} /> 이전 화면
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-6">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--primary-soft)] text-[var(--primary)]">
            <MasterProductImage
              imageUrl={product.displayImageUrls[0]}
              productName={product.name}
              className="h-full w-full object-cover"
              loading="eager"
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-[var(--primary-soft)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--primary)]">
                상품 코드 {product.code}
              </span>
            </div>
            <h1 className="mt-2 truncate text-2xl font-extrabold text-[var(--text-primary)]">
              {product.name}
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white"
          >
            <Pencil size={14} /> 상품 정보 수정
          </button>
        </div>
      </div>
    </header>
  );
}
