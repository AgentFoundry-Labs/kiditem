'use client';
import { Clock, Loader2, CheckCircle, SkipForward, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProductCard } from './ProductCard';
import { PaginationBar } from './PaginationBar';
import type { ThumbnailGenerationItem } from '@kiditem/shared';

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    pending: { label: '대기중', color: 'bg-slate-100 text-slate-600', icon: Clock },
    generating: { label: '생성중', color: 'bg-blue-100 text-blue-700', icon: Loader2 },
    ready: { label: '후보 선택', color: 'bg-amber-100 text-amber-700', icon: Sparkles },
    applied: { label: '적용 완료', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
    skipped: { label: '건너뜀', color: 'bg-slate-100 text-slate-500', icon: SkipForward },
  };
  const c = config[status] || config.pending;
  const Icon = c.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium', c.color)}>
      <Icon size={10} className={status === 'generating' ? 'animate-spin' : ''} /> {c.label}
    </span>
  );
}

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
            badge={<StatusBadge status={gen.status} />}
            overlay={gen.status === 'applied' ? 'applied' : 'skipped'}
            onClick={() => onSelectGen(gen)}
          />
        ))}
      </div>
    </div>
  );
}
