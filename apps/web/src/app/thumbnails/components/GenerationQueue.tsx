'use client';
import { Sparkles, Wand2, Loader2, Clock, CheckCircle, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProductCard } from './ProductCard';
import { PaginationBar } from './PaginationBar';
import type { ThumbnailAnalysisResult, ThumbnailGenerationItem } from '@kiditem/shared';

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

interface GenerationQueueProps {
  pendingProducts: ThumbnailAnalysisResult[];
  activeGenerations: ThumbnailGenerationItem[];
  generatingIds: Set<string>;
  batchGenerating: boolean;
  page: number;
  pageSize: number;
  onGenerateSingle: (productId: string) => void;
  onGenerateBatch: () => void;
  onSelectGen: (gen: ThumbnailGenerationItem) => void;
  onSelectProduct: (product: ThumbnailAnalysisResult) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function GenerationQueue({
  pendingProducts,
  activeGenerations,
  generatingIds,
  batchGenerating,
  page,
  pageSize,
  onGenerateSingle,
  onGenerateBatch,
  onSelectGen,
  onSelectProduct,
  onPageChange,
  onPageSizeChange,
}: GenerationQueueProps) {
  const fPending = pendingProducts.filter((p) => p.grade === 'F');
  const allQueueItems = [
    ...activeGenerations.map((g) => ({ type: 'gen' as const, gen: g })),
    ...pendingProducts.map((p) => ({ type: 'pending' as const, product: p })),
  ];
  const totalPages = Math.ceil(allQueueItems.length / pageSize);
  const paged = allQueueItems.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-3">
      {fPending.length > 0 && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-red-50/60 border border-red-200">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-red-600" />
            <span className="text-sm font-semibold text-red-600">
              F등급 {fPending.length}개 — 썸네일 재생성 필요
            </span>
          </div>
          <button
            onClick={onGenerateBatch}
            disabled={batchGenerating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50 bg-red-600"
          >
            {batchGenerating ? (
              <><Loader2 size={14} className="animate-spin" /> Gemini 생성 중...</>
            ) : (
              <><Wand2 size={14} /> 전체 AI 생성</>
            )}
          </button>
        </div>
      )}

      {allQueueItems.length > 0 && (
        <PaginationBar
          current={page}
          total={totalPages}
          count={allQueueItems.length}
          pageSize={pageSize}
          onChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}

      {allQueueItems.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">재생성 대기 중인 상품이 없습니다</div>
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {paged.map((item) =>
            item.type === 'gen' ? (
              <ProductCard
                key={item.gen.id}
                imageUrl={item.gen.selectedUrl || item.gen.originalUrl || item.gen.product.imageUrl}
                name={item.gen.product.name}
                badge={<StatusBadge status={item.gen.status} />}
                overlay={item.gen.status === 'generating' ? 'generating' : item.gen.selectedUrl ? 'selected' : 'ready'}
                candidateCount={item.gen.candidates.length}
                onClick={() => onSelectGen(item.gen)}
              />
            ) : (
              <ProductCard
                key={item.product.productId}
                imageUrl={item.product.imageUrl}
                name={item.product.productName}
                grade={item.product.grade}
                score={item.product.overallScore}
                isGenerating={generatingIds.has(item.product.productId)}
                onGenerate={() => onGenerateSingle(item.product.productId)}
                onClick={() => onSelectProduct(item.product)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
