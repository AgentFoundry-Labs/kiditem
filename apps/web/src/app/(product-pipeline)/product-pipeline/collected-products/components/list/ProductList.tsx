'use client';

import { ProductInboxListFrame } from '@/app/(product-pipeline)/product-pipeline/_shared/components/inbox/ProductInboxListFrame';
import ProductCard from './ProductCard';
import { isInProgress, type SourcedProduct } from '../../lib/sourcing-api';

interface Props {
  isLoading: boolean;
  products: SourcedProduct[];
  processingIds: Set<string>;
  deletingIds: Set<string>;
  selectedIds: Set<string>;
  isDeletingSelected: boolean;
  emptyState: {
    title: string;
    description: string;
  };
  onDelete: (id: string) => void;
  onDeleteSelected: () => void;
  onSelectVisible: (selected: boolean) => void;
  onSelectedChange: (id: string, selected: boolean) => void;
  onNavigate: (id: string) => void;
  onOpenEditor: (id: string) => void;
  onOpenQuickProcess: (id: string) => void;
  isQuickProcessingSelected: boolean;
}

export default function ProductList({
  isLoading,
  products,
  processingIds,
  deletingIds,
  selectedIds,
  isDeletingSelected,
  emptyState,
  onDelete,
  onDeleteSelected,
  onSelectVisible,
  onSelectedChange,
  onNavigate,
  onOpenEditor,
  onOpenQuickProcess,
  isQuickProcessingSelected,
}: Props) {
  const visibleIds = products.map((product) => product.id);
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const selectedCount = selectedIds.size;

  return (
    <ProductInboxListFrame
      isLoading={isLoading}
      isEmpty={products.length === 0}
      emptyState={emptyState}
      selectionAction={{
        checked: allVisibleSelected,
        onChange: onSelectVisible,
        deleteAction: {
          label: `선택 삭제${selectedCount > 0 ? ` ${selectedCount}` : ''}`,
          disabled: selectedCount === 0 || isDeletingSelected,
          onClick: onDeleteSelected,
        },
      }}
    >
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          isProcessing={processingIds.has(product.id) || isInProgress(product.status)}
          isDeleting={deletingIds.has(product.id)}
          selected={selectedIds.has(product.id)}
          onDelete={onDelete}
          onSelectedChange={onSelectedChange}
          onNavigate={onNavigate}
          onOpenEditor={onOpenEditor}
          onOpenQuickProcess={onOpenQuickProcess}
          quickProcessSelectedCount={selectedCount}
          isQuickProcessingSelected={isQuickProcessingSelected}
        />
      ))}
    </ProductInboxListFrame>
  );
}
