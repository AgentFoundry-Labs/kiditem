'use client';

import { ImageIcon, Layers3, Package, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { ProductContentArchiveType } from '../lib/product-content-api';

export interface ProductContentWorkspaceFilterValue {
  contentType: ProductContentArchiveType | null;
  linkState: 'linked' | 'unlinked' | null;
}

export function ProductContentWorkspaceFilters({
  value,
  onChange,
}: {
  value: ProductContentWorkspaceFilterValue;
  onChange: (next: ProductContentWorkspaceFilterValue) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
        <FilterButton
          active={value.linkState === null}
          onClick={() => onChange({ ...value, linkState: null })}
        >
          <Layers3 size={14} />
          전체
        </FilterButton>
        <FilterButton
          active={value.linkState === 'linked'}
          onClick={() => onChange({ ...value, linkState: 'linked' })}
        >
          <Package size={14} />
          상품
        </FilterButton>
        <FilterButton
          active={value.linkState === 'unlinked'}
          onClick={() => onChange({ ...value, linkState: 'unlinked' })}
        >
          <Sparkles size={14} />
          미연결
        </FilterButton>
      </div>
      <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
        <FilterButton
          active={value.contentType === null}
          onClick={() => onChange({ ...value, contentType: null })}
        >
          <Layers3 size={14} />
          전체 콘텐츠
        </FilterButton>
        <FilterButton
          active={value.contentType === 'detail_page'}
          onClick={() => onChange({ ...value, contentType: 'detail_page' })}
        >
          <Sparkles size={14} />
          상세페이지
        </FilterButton>
        <FilterButton
          active={value.contentType === 'image'}
          onClick={() => onChange({ ...value, contentType: 'image' })}
        >
          <ImageIcon size={14} />
          이미지
        </FilterButton>
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-black transition',
        active
          ? 'bg-[var(--text-primary)] text-white'
          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]',
      )}
    >
      {children}
    </button>
  );
}
