'use client';

import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import type { SalesProductListItem } from '@kiditem/shared/sales-product';
import { cn } from '@/lib/utils';
import { ProductInboxCardShell } from '@/app/(product-pipeline)/product-pipeline/_shared/components/inbox/ProductInboxCardShell';
import { sourcePlatformLabel } from '../../lib/source-platform-label';

interface Props {
  /** 판매상품 초안 한 줄. 카드 id 는 초안 id 다(KID-310). */
  product: SalesProductListItem;
  /** 이 화면이 시작한 생성이 아직 도는가. 카드는 스스로 묻지 않는다 — 목록이 한 번에 묻는다. */
  isProcessing: boolean;
  isDeleting: boolean;
  selected?: boolean;
  onDelete: (id: string) => void;
  onSelectedChange?: (id: string, selected: boolean) => void;
  onNavigate: (id: string) => void;
  onOpenEditor: (id: string) => void;
  onOpenQuickProcess: (id: string) => void;
  quickProcessSelectedCount: number;
  isQuickProcessingSelected?: boolean;
}

export default function ProductCard({
  product,
  isProcessing,
  isDeleting,
  selected = false,
  onDelete,
  onSelectedChange,
  onNavigate,
  onOpenEditor,
  onOpenQuickProcess,
  quickProcessSelectedCount,
  isQuickProcessingSelected = false,
}: Props) {
  const generateBusy = isQuickProcessingSelected || isProcessing;
  const sourceLabel = sourcePlatformLabel(product.sourcePlatform);

  // 진행 중 overlay — 이 화면에서 시작한 생성만 표시한다. 다른 곳에서 시작한 생성은 그 상품의
  // 작업공간 화면이 보여준다.
  const statusBanner = isProcessing ? (
    <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-center gap-1.5 bg-[var(--primary)] px-2 py-1 text-[10px] font-semibold text-[var(--primary-contrast)] shadow">
      <Loader2 size={10} className="animate-spin" />
      생성 중
    </div>
  ) : null;

  return (
    <ProductInboxCardShell
      title={product.name}
      thumbnailUrl={product.imageUrl}
      disabled={isDeleting}
      highlighted={isProcessing}
      statusBanner={statusBanner}
      selectionAction={onSelectedChange
        ? {
            checked: selected,
            ariaLabel: `${product.name} 선택`,
            onChange: (checked) => onSelectedChange(product.id, checked),
          }
        : undefined}
      thumbnailTopLeft={
        <div className="flex flex-col gap-1">
          {product.salePrice === null && (
            <span className="w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
              판매가 미정
            </span>
          )}
          <span className="w-fit rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white backdrop-blur-sm">
            {sourceLabel}
          </span>
        </div>
      }
      deleteAction={{
        isDeleting,
        onDelete: () => onDelete(product.id),
        title: '수집상품 삭제',
      }}
      hoverAction={{
        icon: <Sparkles size={13} />,
        label: '에디터에서 바로 편집',
        onClick: () => onOpenEditor(product.id),
      }}
      onOpen={() => onNavigate(product.id)}
      footer={
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenQuickProcess(product.id);
          }}
          disabled={generateBusy}
          className={cn(
            'w-full flex h-11 items-center justify-center gap-1.5 rounded-lg border text-[12px] font-extrabold transition-all shadow-sm',
            generateBusy
              ? 'cursor-wait border-violet-200 bg-violet-50 text-violet-600'
              : 'border-[var(--text-primary)] bg-white text-[var(--text-primary)] hover:border-violet-600 hover:bg-violet-600 hover:text-white hover:shadow-md hover:shadow-violet-200',
          )}
          title="선택한 상품만 상세페이지와 썸네일 생성을 시작합니다"
        >
          {generateBusy ? (
            <>
              <Loader2 size={11} className="animate-spin" /> 처리 중...
            </>
          ) : (
            <>
              <Wand2 size={13} />
              {quickProcessSelectedCount > 0 ? `선택 ${quickProcessSelectedCount}개 AI 작업 선택` : 'AI 작업 선택'}
            </>
          )}
        </button>
      }
    />
  );
}
