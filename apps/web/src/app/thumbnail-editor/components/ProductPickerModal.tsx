'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImageIcon, Loader2, Search, X } from 'lucide-react';
import { ProductCatalogListResponseSchema, type ProductCatalogListItem } from '@kiditem/shared/product';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { resolveImageUrl } from '@/lib/resolve-url';
import { cn } from '@/lib/utils';

interface ProductListItem {
  id: string;
  name: string;
  imageUrl: string | null;
}

function toPickerProduct(item: ProductCatalogListItem): ProductListItem {
  return {
    id: item.id,
    name: item.name,
    imageUrl: item.imageUrl ?? item.thumbnailUrl,
  };
}

interface ProductPickerModalProps {
  open: boolean;
  onClose: () => void;
  onPick: (product: ProductListItem) => void;
}

export function ProductPickerModal({ open, onClose, onPick }: ProductPickerModalProps) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.products.catalog.list({ search: debounced, limit: '20' }),
    queryFn: async () => {
      const data = await apiClient.getParsed(
        `/api/products/catalog?search=${encodeURIComponent(debounced)}&limit=20`,
        ProductCatalogListResponseSchema,
      );
      return { items: data.items.map(toPickerProduct), total: data.total };
    },
    enabled: open,
  });

  if (!open) return null;

  const items = data?.items ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-[520px] max-h-[80vh] bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div className="text-sm font-bold text-gray-900">상품 선택</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="상품명 검색"
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:border-violet-400"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-xs text-gray-400">
              {debounced ? '검색 결과가 없습니다' : '상품명을 입력하세요'}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {items.map((p) => {
                const img = resolveImageUrl(p.imageUrl);
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => onPick(p)}
                      className={cn(
                        'flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-violet-50 transition-colors',
                      )}
                    >
                      <div className="w-10 h-10 rounded-md bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {img && img.startsWith('http') ? (
                          <img src={img} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <ImageIcon size={14} className="text-gray-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900 truncate">{p.name}</div>
                        <div className="text-[10px] text-gray-400 font-mono truncate">{p.id}</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
