'use client';
import { ProductCard } from './ProductCard';
import { PaginationBar } from './PaginationBar';
import { ThumbnailStatusBadge } from '@/components/thumbnails/ThumbnailStatusBadge';
import { isApplied } from '@/lib/thumbnail-status';
import type { ThumbnailGenerationItem } from '@kiditem/shared';

interface GenerationHistoryProps {
  completedGenerations: ThumbnailGenerationItem[];
  page: number;
  pageSize: number;
  onSelectGen: (gen: ThumbnailGenerationItem) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function GenerationHistory({
  completedGenerations,
  page,
  pageSize,
  onSelectGen,
  onPageChange,
  onPageSizeChange,
}: GenerationHistoryProps) {
  const totalPages = Math.ceil(completedGenerations.length / pageSize);
  const paged = completedGenerations.slice((page - 1) * pageSize, page * pageSize);

  if (completedGenerations.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">완료된 작업이 없습니다</div>
    );
  }

  return (
    <div className="space-y-3">
      <PaginationBar
        current={page}
        total={totalPages}
        count={completedGenerations.length}
        pageSize={pageSize}
        onChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {paged.map((gen) => (
          <ProductCard
            key={gen.id}
            imageUrl={gen.selectedUrl || gen.originalUrl || gen.product.imageUrl}
            name={gen.product.name}
            badge={<ThumbnailStatusBadge status={gen.status} phase={gen.phase ?? null} />}
            overlay={isApplied(gen) ? 'applied' : 'skipped'}
            onClick={() => onSelectGen(gen)}
          />
        ))}
      </div>
    </div>
  );
}
