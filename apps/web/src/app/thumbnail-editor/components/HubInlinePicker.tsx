'use client';

import { useMemo } from 'react';
import { Loader2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { HUB_ROLE_CONFIG, type ProductImageRole } from '@/lib/hub-roles';
import type { ProductImageItem } from '@kiditem/shared';

type SelectMode = 'single' | 'multi';

interface Props {
  images: ProductImageItem[];  // 부모가 useProductImages 로 fetch 한 전체 목록
  loading: boolean;            // 부모의 loading 상태
  productId: string;           // "이미지 허브로 이동" 링크용
  role: ProductImageRole;
  mode: SelectMode;
  selectedUrls: string[];
  onSelect: (url: string) => void;
  maxRemaining?: number;
}

export function HubInlinePicker({
  images,
  loading,
  productId,
  role,
  mode,
  selectedUrls,
  onSelect,
  maxRemaining,
}: Props) {
  const roleImages = useMemo(() => images.filter((img) => img.role === role), [images, role]);
  const roleConfig = useMemo(() => HUB_ROLE_CONFIG.find((c) => c.role === role), [role]);

  const isSelected = (url: string) => selectedUrls.includes(url);

  const handleClick = (url: string) => {
    // multi 모드 cap 검사
    if (mode === 'multi' && maxRemaining !== undefined) {
      if (!isSelected(url) && maxRemaining <= 0) {
        toast.error('이미 최대 장수에 도달했습니다');
        return;
      }
    }
    onSelect(url);
  };

  return (
    <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-2 mt-2">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-semibold text-violet-700">
          {roleConfig?.label ?? role} <span className="text-gray-400 font-normal">허브에서 선택</span>
        </div>
        <span className="text-[10px] text-gray-400">{roleImages.length}장</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-3 text-gray-400">
          <Loader2 size={12} className="animate-spin mr-1" />
          <span className="text-[10px]">로딩 중...</span>
        </div>
      ) : roleImages.length === 0 ? (
        <div className="text-center py-3">
          <div className="text-[10px] text-gray-500 mb-1">허브에 등록된 이미지 없음</div>
          <Link
            href={`/image-hub?productId=${productId}`}
            className="inline-flex items-center gap-1 text-[10px] text-violet-600 hover:text-violet-700"
          >
            <ArrowRight size={10} /> 이미지 허브에서 등록
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {roleImages.map((img, i) => {
            const selected = isSelected(img.url);
            return (
              <button
                key={`${img.url}-${i}`}
                type="button"
                onClick={() => handleClick(img.url)}
                className={cn(
                  'relative aspect-square rounded-md overflow-hidden bg-white transition-all duration-150',
                  selected
                    ? 'ring-2 ring-violet-500 border border-violet-500'
                    : 'border border-gray-200 hover:border-violet-300',
                )}
              >
                <img
                  src={img.url}
                  alt={img.label || ''}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                {selected && (
                  <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-violet-600 text-white text-[8px] font-bold flex items-center justify-center">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
