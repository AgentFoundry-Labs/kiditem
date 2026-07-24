'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';
import type { SellpiaProductDestination } from '@kiditem/shared/dashboard';

export type ProductOutflowDestinationsProps = {
  destinations: SellpiaProductDestination[];
};

export function ProductOutflowDestinations({
  destinations,
}: ProductOutflowDestinationsProps) {
  const [failedImageVariantIds, setFailedImageVariantIds] = useState<Set<string>>(
    () => new Set(),
  );
  if (destinations.length === 0) {
    return <span className="whitespace-nowrap text-xs font-semibold text-slate-400">운영 상품 미연결</span>;
  }

  return (
    <div
      className="min-w-0 space-y-1"
      title={destinations.map((destination) => (
        `${destination.masterProductName} · ${destination.productVariantName}`
      )).join('\n')}
    >
      {destinations.slice(0, 2).map((destination) => {
        const alt = `${destination.masterProductName} · ${destination.productVariantName}`;
        const showImage = destination.displayImage
          && !failedImageVariantIds.has(destination.productVariantId);
        return (
          <Link
            key={destination.productVariantId}
            href={`/product-hub/${destination.masterProductId}`}
            aria-label={alt}
            className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-violet-700 hover:underline"
          >
            {showImage ? (
              <img
                src={destination.displayImage.url}
                alt={alt}
                className="h-9 w-9 shrink-0 rounded object-cover bg-slate-100"
                onError={() => setFailedImageVariantIds((current) => {
                  const next = new Set(current);
                  next.add(destination.productVariantId);
                  return next;
                })}
              />
            ) : (
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-400"
                aria-label="이미지 없음"
              >
                <Package className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">이미지 없음</span>
              </span>
            )}
            <span className="truncate">{alt}</span>
          </Link>
        );
      })}
      {destinations.length > 2 ? (
        <span className="block text-[10px] text-slate-500">외 {destinations.length - 2}개</span>
      ) : null}
    </div>
  );
}
