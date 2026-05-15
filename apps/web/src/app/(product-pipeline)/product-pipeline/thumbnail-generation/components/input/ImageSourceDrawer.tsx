'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import * as Popover from '@radix-ui/react-popover';
import { ArrowRight, ImageIcon, Loader2, Search, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  GetMasterImagesResponseSchema,
  ProductCatalogListResponseSchema,
  type ProductCatalogListItem,
  type MasterImageItem,
} from '@kiditem/shared/product';
import type { ThumbnailGenerationItem } from '@kiditem/shared/ai';

import { useRecentGenerations } from '../../hooks/useRecentGenerations';
import { apiClient } from '@/lib/api-client';
import { HUB_ROLE_CONFIG, type MasterImageRole } from '../../../_shared/lib/hub-roles';
import { REGISTERED_PRODUCTS_ROOT } from '../../../_shared/lib/product-pipeline-routes';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

import { ImgWithSkeleton } from '../shared/ImgWithSkeleton';
import type { SlotPick } from '../../edit/lib/slots';

export type DrawerTabKey = 'upload' | 'hub' | 'recent' | 'other';

const TAB_LABELS: Record<DrawerTabKey, string> = {
  upload: '업로드',
  hub: '이 상품 허브',
  recent: '최근 생성',
  other: '다른 상품',
};

interface Props {
  children: React.ReactNode;
  role: MasterImageRole;
  productId: string | null;
  hubImages: MasterImageItem[];
  hubImagesLoading: boolean;
  availableTabs?: DrawerTabKey[];
  multi?: boolean;
  remainingSlots?: number;
  onPick: (pick: SlotPick) => void;
  onPickMany?: (picks: SlotPick[]) => void;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ImageSourceDrawer({
  children,
  role,
  productId,
  hubImages,
  hubImagesLoading,
  availableTabs = ['upload', 'hub', 'recent'],
  multi = false,
  remainingSlots,
  onPick,
  onPickMany,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<DrawerTabKey>(availableTabs[0] ?? 'upload');

  useEffect(() => {
    if (!availableTabs.includes(tab)) setTab(availableTabs[0] ?? 'upload');
  }, [availableTabs, tab]);

  const close = () => setOpen(false);

  const handlePick = (pick: SlotPick) => {
    onPick(pick);
    close();
  };
  const handlePickMany = (picks: SlotPick[]) => {
    if (picks.length === 0) return;
    if (onPickMany && multi) onPickMany(picks);
    else onPick(picks[0]);
    close();
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="z-50 w-[360px] rounded-xl border border-gray-200 bg-white shadow-xl p-0 focus:outline-none"
        >
          <div className="flex border-b border-gray-100">
            {availableTabs.map((t) => (
              <TabButton key={t} active={tab === t} onClick={() => setTab(t)}>
                {TAB_LABELS[t]}
              </TabButton>
            ))}
          </div>

          <div className="p-3">
            {tab === 'upload' && (
              <UploadTab
                multi={multi}
                remainingSlots={remainingSlots}
                onPickMany={handlePickMany}
              />
            )}
            {tab === 'hub' && (
              <HubTab
                role={role}
                productId={productId}
                images={hubImages}
                loading={hubImagesLoading}
                onPick={(url) => handlePick({ value: url, source: 'hub' })}
              />
            )}
            {tab === 'recent' && (
              <RecentTab
                productId={productId}
                onPick={(url) => handlePick({ value: url, source: 'prev-gen' })}
              />
            )}
            {tab === 'other' && (
              <OtherProductTab
                role={role}
                excludeProductId={productId}
                onPick={(url, sourceProductId) =>
                  handlePick({ value: url, source: 'other-product', sourceProductId })
                }
              />
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 py-2 text-[11px] font-semibold transition-colors',
        active ? 'text-violet-700 border-b-2 border-violet-500' : 'text-gray-500 hover:text-gray-700',
      )}
    >
      {children}
    </button>
  );
}

interface UploadTabProps {
  multi: boolean;
  remainingSlots?: number;
  onPickMany: (picks: SlotPick[]) => void;
}

function UploadTab({ multi, remainingSlots, onPickMany }: UploadTabProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cap = remainingSlots;
  const atCap = cap !== undefined && cap <= 0;

  const readFiles = useCallback(
    async (files: FileList) => {
      if (atCap) {
        toast.error('더 이상 추가할 수 없습니다');
        return;
      }
      const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
      const slice = cap !== undefined ? imageFiles.slice(0, cap) : imageFiles;
      if (cap !== undefined && imageFiles.length > slice.length) {
        toast.warning(`최대 ${cap}장까지만 추가됩니다`);
      }
      if (slice.length === 0) return;
      const urls = await Promise.all(slice.map(fileToDataUrl));
      const picks: SlotPick[] = urls.map((u) => ({ value: u, source: 'upload' }));
      onPickMany(multi ? picks : [picks[0]]);
    },
    [multi, cap, atCap, onPickMany],
  );

  return (
    <div className="space-y-2">
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) void readFiles(e.dataTransfer.files);
        }}
        className={cn(
          'flex flex-col items-center justify-center w-full rounded-xl border-2 border-dashed cursor-pointer transition-colors py-8',
          atCap
            ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-violet-50/30 border-violet-300 text-violet-700 hover:bg-violet-50',
        )}
      >
        <Upload size={22} className="mb-2" />
        <div className="text-[12px] font-medium">
          {atCap ? '최대 장수에 도달' : '클릭 또는 드래그앤드롭'}
        </div>
        {multi && !atCap && (
          <div className="text-[10px] text-gray-400 mt-1">여러 장 한번에 선택 가능</div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple={multi}
          disabled={atCap}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void readFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </label>
    </div>
  );
}

interface HubTabProps {
  role: MasterImageRole;
  productId: string | null;
  images: MasterImageItem[];
  loading: boolean;
  onPick: (url: string) => void;
}

function HubTab({ role, productId, images, loading, onPick }: HubTabProps) {
  const roleImages = useMemo(() => images.filter((img) => img.role === role), [images, role]);
  const roleConfig = useMemo(() => HUB_ROLE_CONFIG.find((c) => c.role === role), [role]);

  if (!productId) {
    return (
      <div className="text-center py-6 text-[11px] text-gray-500">
        상품이 지정되지 않아 허브를 불러올 수 없습니다
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-0.5">
        <span className="text-[11px] font-semibold text-violet-700">
          {roleConfig?.label ?? role}
        </span>
        <span className="text-[10px] text-gray-400">{roleImages.length}장</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-gray-400">
          <Loader2 size={12} className="animate-spin mr-1" />
          <span className="text-[11px]">로딩 중...</span>
        </div>
      ) : roleImages.length === 0 ? (
        <div className="text-center py-6">
          <ImageIcon size={20} className="mx-auto mb-2 text-gray-300" />
          <div className="text-[11px] text-gray-500 mb-1.5">허브에 등록된 이미지 없음</div>
          <Link
            href={`${REGISTERED_PRODUCTS_ROOT}?masterId=${encodeURIComponent(productId)}`}
            className="inline-flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-700"
          >
            <ArrowRight size={11} /> 소싱 화면에서 확인
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 max-h-[240px] overflow-y-auto">
          {roleImages.map((img, i) => (
            <button
              key={`${img.url}-${i}`}
              type="button"
              onClick={() => onPick(img.url)}
              className="relative aspect-square rounded-md overflow-hidden bg-white border border-gray-200 hover:border-violet-400 transition-colors"
            >
              <ImgWithSkeleton src={img.url} alt={img.label || ''} fit="cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface RecentTabProps {
  productId: string | null;
  onPick: (url: string) => void;
}

function RecentTab({ productId, onPick }: RecentTabProps) {
  const { data: generations = [], isLoading } = useRecentGenerations(productId);

  // Flatten: prefer selectedUrl, else all candidates
  const thumbs = useMemo(() => {
    const out: Array<{ url: string; genId: string; createdAt: string }> = [];
    for (const g of generations) {
      if (g.selectedUrl) {
        out.push({ url: g.selectedUrl, genId: g.id, createdAt: g.createdAt });
      } else if (g.candidates?.length) {
        for (const c of g.candidates) {
          out.push({ url: c.url, genId: g.id, createdAt: g.createdAt });
        }
      }
    }
    return out;
  }, [generations]);

  if (!productId) {
    return (
      <div className="text-center py-6 text-[11px] text-gray-500">
        상품이 지정되지 않아 최근 생성 이미지를 불러올 수 없습니다
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-0.5">
        <span className="text-[11px] font-semibold text-violet-700">최근 생성된 이미지</span>
        <span className="text-[10px] text-gray-400">{thumbs.length}장</span>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-6 text-gray-400">
          <Loader2 size={12} className="animate-spin mr-1" />
          <span className="text-[11px]">로딩 중...</span>
        </div>
      ) : thumbs.length === 0 ? (
        <div className="text-center py-6 text-[11px] text-gray-500">
          이전 생성 결과가 없습니다
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 max-h-[240px] overflow-y-auto">
          {thumbs.map((t, i) => (
            <button
              key={`${t.url}-${i}`}
              type="button"
              onClick={() => onPick(t.url)}
              className="relative aspect-square rounded-md overflow-hidden bg-white border border-gray-200 hover:border-violet-400 transition-colors"
            >
              <ImgWithSkeleton src={t.url} alt="" fit="cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface OtherProductTabProps {
  role: MasterImageRole;
  excludeProductId: string | null;
  onPick: (url: string, sourceProductId: string) => void;
}

interface ProductLite {
  id: string;
  name: string;
  imageUrl: string | null;
}

function toProductLite(item: ProductCatalogListItem): ProductLite {
  return {
    id: item.id,
    name: item.name,
    imageUrl: item.imageUrl ?? item.thumbnailUrl,
  };
}

function OtherProductTab({ role, excludeProductId, onPick }: OtherProductTabProps) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [picked, setPicked] = useState<ProductLite | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const searchQuery = useQuery({
    queryKey: queryKeys.products.catalog.list({ search: debounced, limit: '20' }),
    queryFn: async () => {
      const data = await apiClient.getParsed(
        `/api/products/catalog?search=${encodeURIComponent(debounced)}&limit=20`,
        ProductCatalogListResponseSchema,
      );
      return { items: data.items.map(toProductLite), total: data.total };
    },
    enabled: !picked,
  });

  const imagesQuery = useQuery({
    queryKey: picked ? queryKeys.products.images(picked.id) : ['products', 'images', 'other-disabled'],
    queryFn: async () => {
      const data = await apiClient.getParsed(
        `/api/products/masters/${picked!.id}/images`,
        GetMasterImagesResponseSchema,
      );
      return data.images;
    },
    enabled: !!picked,
  });

  if (!picked) {
    const items = (searchQuery.data?.items ?? []).filter((p) => p.id !== excludeProductId);
    return (
      <div>
        <div className="relative mb-2">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="상품명 검색"
            className="w-full pl-7 pr-2 py-1.5 text-[12px] bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:border-violet-400"
          />
        </div>
        {searchQuery.isLoading ? (
          <div className="flex items-center justify-center py-6 text-gray-400">
            <Loader2 size={12} className="animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-6 text-[11px] text-gray-500">
            {debounced ? '검색 결과가 없습니다' : '상품명을 입력하세요'}
          </div>
        ) : (
          <ul className="max-h-[220px] overflow-y-auto divide-y divide-gray-100">
            {items.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setPicked(p)}
                  className="flex w-full items-center gap-2 py-2 px-1 text-left hover:bg-violet-50 rounded-md transition-colors"
                >
                  <div className="w-8 h-8 rounded-md bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <ImageIcon size={12} className="text-gray-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-gray-900 truncate">{p.name}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const productImages = (imagesQuery.data ?? []).filter((img) => img.role === role);
  const fallback = picked.imageUrl ?? null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="p-0.5 rounded hover:bg-gray-100"
            aria-label="상품 재선택"
          >
            <X size={12} className="text-gray-500" />
          </button>
          <span className="text-[11px] font-semibold text-gray-900 truncate">{picked.name}</span>
        </div>
        <span className="text-[10px] text-gray-400">
          {productImages.length + (fallback ? 1 : 0)}장
        </span>
      </div>
      {imagesQuery.isLoading ? (
        <div className="flex items-center justify-center py-6 text-gray-400">
          <Loader2 size={12} className="animate-spin" />
        </div>
      ) : productImages.length === 0 && !fallback ? (
        <div className="text-center py-6 text-[11px] text-gray-500">
          이 상품은 이미지가 없습니다
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 max-h-[220px] overflow-y-auto">
          {fallback && (
            <button
              type="button"
              onClick={() => onPick(fallback, picked.id)}
              className="relative aspect-square rounded-md overflow-hidden bg-white border border-gray-200 hover:border-violet-400 transition-colors"
              title="기본 상품 이미지"
            >
              <img
                src={fallback}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[9px] font-semibold text-center py-0.5">
                기본
              </span>
            </button>
          )}
          {productImages.map((img, i) => (
            <button
              key={`${img.url}-${i}`}
              type="button"
              onClick={() => onPick(img.url, picked.id)}
              className="relative aspect-square rounded-md overflow-hidden bg-white border border-gray-200 hover:border-violet-400 transition-colors"
            >
              <img
                src={img.url}
                alt={img.label || ''}
                className="w-full h-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
