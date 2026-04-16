'use client';

import { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface Product {
  id: string;
  name: string;
  imageUrl: string | null;
  sku: string | null;
}

interface Props {
  selectedId: string | null;
  onSelect: (product: Product) => void;
}

export function ProductSelector({ selectedId, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (results.length === 0) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setResults([]);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [results.length]);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      apiClient
        .get<{ items: Product[] }>(`/api/products?search=${encodeURIComponent(query)}&limit=10`)
        .then((data) => setResults(data.items))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="상품명 또는 SKU로 검색"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
        />
      </div>
      {results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {results.map((product) => (
            <button
              key={product.id}
              onClick={() => {
                onSelect(product);
                setQuery('');
                setResults([]);
              }}
              className={cn('w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors', selectedId === product.id && 'bg-purple-50')}
            >
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover border border-slate-200"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 text-xs">
                  없음
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{product.name}</div>
                {product.sku && (
                  <div className="text-xs text-slate-400">{product.sku}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
      {searching && (
        <div className="absolute left-0 top-full mt-1 text-xs text-slate-400 px-1">검색 중...</div>
      )}
    </div>
  );
}
