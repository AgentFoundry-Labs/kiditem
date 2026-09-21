'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * 상품 사진, 없거나 깨지면 머리글자 타일. 사진은 몰 리스팅에 붙은 것만 있고 상품 마스터는
 * 사진을 들고 있지 않다 — 깨진 이미지 자리를 남기는 것보다 타일이 낫다.
 */
export function DashboardProductThumb({
  imageUrl,
  name,
  size = 'md',
}: {
  imageUrl: string | null;
  name: string;
  size?: 'sm' | 'md';
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const box = size === 'sm' ? 'h-10 w-10 rounded-md text-xs' : 'h-14 w-14 rounded-lg text-sm';
  if (imageUrl && failed !== imageUrl) {
    return (
      // 몰 CDN 은 next/image 허용 호스트가 아니다 — 그냥 img 로 그린다.
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(imageUrl)}
        className={cn('flex-none border border-slate-200 bg-white object-cover', box)}
      />
    );
  }
  return (
    <span
      aria-hidden
      title="저장된 상품 사진이 없습니다."
      className={cn('flex flex-none items-center justify-center bg-slate-100 font-bold text-slate-500 ring-1 ring-inset ring-slate-200/70', box)}
    >
      {monogram(name)}
    </span>
  );
}
/** 가격 접두('3500') 같은 숫자를 건너 첫 글자 하나. */
function monogram(name: string): string {
  const letters = name.replace(/^[\d\s,.]+/, '').trim();
  return (letters[0] ?? name[0] ?? '?').toUpperCase();
}
