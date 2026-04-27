'use client';
import { Sparkles, Wand2, Loader2 } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { PaginationBar } from './PaginationBar';
import { ThumbnailStatusBadge } from '@/components/thumbnails/ThumbnailStatusBadge';
import type { ThumbnailAnalysisResult, ThumbnailGenerationItem } from '@kiditem/shared';

interface GenerationQueueProps {
  pendingProducts: ThumbnailAnalysisResult[];
  activeGenerations: ThumbnailGenerationItem[];
  generatingIds: Set<string>;
  batchGenerating: boolean;
  batchEditing: boolean;
  page: number;
  pageSize: number;
  onGenerateSingle: (productId: string) => void;
  onGenerateBatch: () => void;
  onEditBatch: (purpose: 'compliance' | 'quality') => void;
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
  batchEditing,
  page,
  pageSize,
  onGenerateSingle,
  onGenerateBatch,
  onEditBatch,
  onSelectGen,
  onSelectProduct,
  onPageChange,
  onPageSizeChange,
}: GenerationQueueProps) {
  const complianceFail = pendingProducts.filter((p) => p.complianceGrade === 'FAIL' || p.complianceGrade === 'WARN');
  const qualityLow = pendingProducts.filter((p) => p.grade === 'F' || p.grade === 'C');
  const allQueueItems = [
    ...activeGenerations.map((g) => ({ type: 'gen' as const, gen: g })),
    ...pendingProducts.map((p) => ({ type: 'pending' as const, product: p })),
  ];
  const totalPages = Math.ceil(allQueueItems.length / pageSize);
  const paged = allQueueItems.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-3">
      {complianceFail.length > 0 && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-red-50/60 border border-red-200">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-red-600" />
            <span className="text-sm font-semibold text-red-600">
              가이드라인 위반 {complianceFail.length}개 — 광고 중단 리스크
            </span>
          </div>
          <button
            onClick={() => onEditBatch('compliance')}
            disabled={batchEditing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50 bg-red-600"
          >
            {batchEditing ? (
              <><Loader2 size={14} className="animate-spin" /> 편집 중...</>
            ) : (
              <><Wand2 size={14} /> 일괄 가이드라인 수정</>
            )}
          </button>
        </div>
      )}

      {qualityLow.length > 0 && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50/60 border border-amber-200">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-amber-600" />
            <span className="text-sm font-semibold text-amber-600">
              품질 개선 필요 {qualityLow.length}개 — CTR 향상 권장
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onEditBatch('quality')}
              disabled={batchEditing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50 bg-amber-600"
            >
              {batchEditing ? (
                <><Loader2 size={14} className="animate-spin" /> 편집 중...</>
              ) : (
                <><Wand2 size={14} /> 일괄 품질 개선</>
              )}
            </button>
            <button
              onClick={onGenerateBatch}
              disabled={batchGenerating}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50 bg-slate-600"
            >
              {batchGenerating ? (
                <><Loader2 size={14} className="animate-spin" /> 생성 중...</>
              ) : (
                <><Wand2 size={14} /> 전체 AI 생성</>
              )}
            </button>
          </div>
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
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">AI 편집 대기 중인 상품이 없습니다</div>
      ) : (
        <div className="grid grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-3">
          {paged.map((item) =>
            item.type === 'gen' ? (
              <ProductCard
                key={item.gen.id}
                imageUrl={item.gen.selectedUrl || item.gen.originalUrl || item.gen.product.imageUrl}
                name={item.gen.product.name}
                badge={<ThumbnailStatusBadge status={item.gen.status} phase={item.gen.phase ?? null} />}
                overlay={item.gen.status === 'running' ? 'generating' : item.gen.selectedUrl ? 'selected' : 'ready'}
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
