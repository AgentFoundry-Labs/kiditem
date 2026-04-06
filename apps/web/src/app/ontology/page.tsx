'use client';

import { useState, useMemo } from 'react';
import { queryKeys } from '@/lib/query-keys';
import { useQuery } from '@tanstack/react-query';
import { Network } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import PageSkeleton from '@/components/ui/PageSkeleton';
import OntologyGraph from './components/OntologyGraph';
import type { ProductListItem as Product } from '@kiditem/shared';
import { OntologyStats } from './components/OntologyStats';
import { OntologyViewToggle } from './components/OntologyViewToggle';
import { CategoryList } from './components/CategoryList';

interface CategoryGroup {
  category: string;
  products: Product[];
  brands: string[];
}

export default function OntologyPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');

  const { data: products = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.ontology.products(),
    queryFn: async () => {
      const json = await apiClient.get<{ items: Product[]; total: number }>('/api/products?limit=200');
      return json.items;
    },
  });

  const categoryGroups = useMemo(() => {
    const filtered = products.filter((p) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.name?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q)
      );
    });

    const groupMap: Record<string, Product[]> = {};
    for (const product of filtered) {
      const cat = product.category || '미분류';
      if (!groupMap[cat]) groupMap[cat] = [];
      groupMap[cat].push(product);
    }

    const groups: CategoryGroup[] = Object.entries(groupMap).map(
      ([category, prods]) => {
        const brandSet: Record<string, boolean> = {};
        prods.forEach((p) => {
          if (p.brand) brandSet[p.brand] = true;
        });
        return { category, products: prods, brands: Object.keys(brandSet) };
      }
    );

    groups.sort((a, b) => b.products.length - a.products.length);
    return groups;
  }, [products, searchQuery]);

  const totalCategories = categoryGroups.length;
  const totalBrands = useMemo(() => {
    const brandSet: Record<string, boolean> = {};
    products.forEach((p) => {
      if (p.brand) brandSet[p.brand] = true;
    });
    return Object.keys(brandSet).length;
  }, [products]);

  if (loading) return <PageSkeleton variant="cards" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <Network className="w-6 h-6 text-violet-500" />
          Ontology
        </h1>
        <p className="text-slate-500 mt-1">
          상품 카테고리와 브랜드 관계를 시각화합니다.
        </p>
      </div>
      <OntologyStats
        productCount={products.length}
        totalCategories={totalCategories}
        totalBrands={totalBrands}
      />
      <OntologyViewToggle viewMode={viewMode} onChange={setViewMode} />
      {viewMode === 'graph' ? (
        <OntologyGraph />
      ) : (
        <CategoryList
          categoryGroups={categoryGroups}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedCategory={selectedCategory}
          onCategorySelect={setSelectedCategory}
        />
      )}
    </div>
  );
}
