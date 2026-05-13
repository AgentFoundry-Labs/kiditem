'use client';

import { ImageIcon, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ProductContentGenerationItem } from '../lib/product-content-api';
import { ProductContentGenerationList } from './ProductContentGenerationList';

export function ProductContentWorkspaceSections({
  generations,
}: {
  generations: ProductContentGenerationItem[];
}) {
  const detailPages = generations.filter((item) => item.contentType === 'detail_page');
  const images = generations.filter((item) => item.contentType === 'image');

  return (
    <div className="space-y-6">
      <section>
        <SectionHeader
          icon={<Sparkles size={16} />}
          title="상세페이지"
          count={detailPages.length}
        />
        <ProductContentGenerationList
          items={detailPages}
          emptyLabel="이 workspace에는 아직 상세페이지 결과가 없습니다."
        />
      </section>
      <section>
        <SectionHeader
          icon={<ImageIcon size={16} />}
          title="이미지 생성/편집"
          count={images.length}
        />
        <ProductContentGenerationList
          items={images}
          emptyLabel="이 workspace에는 아직 이미지 생성/편집 결과가 없습니다."
        />
      </section>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  count,
}: {
  icon: ReactNode;
  title: string;
  count: number;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="inline-flex items-center gap-2 text-base font-black text-[var(--text-primary)]">
        {icon}
        {title}
      </h2>
      <span className="rounded-md bg-[var(--surface)] px-2 py-1 text-xs font-black text-[var(--text-secondary)]">
        {count}
      </span>
    </div>
  );
}
