'use client';

import { useEffect, useState, useMemo } from 'react';
import { Network, Package, Tag, Layers, Search, List } from 'lucide-react';
import { API_BASE } from '@/lib/api';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { cn } from '@/lib/utils';
import OntologyGraph from '@/components/ontology/OntologyGraph';
import type { ProductListItem as Product } from '@kiditem/shared';

interface CategoryGroup {
  category: string;
  products: Product[];
  brands: string[];
}

export default function OntologyPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/products?limit=500`);
        const json = await res.json();
        const items = Array.isArray(json) ? json : json.items ?? [];
        setProducts(items);
      } catch (err) {
        console.error('상품 데이터 로딩 실패:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

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

  if (loading) {
    return <PageSkeleton variant="cards" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Network className="w-6 h-6 text-violet-500" />
          Ontology
        </h1>
        <p className="text-gray-500 mt-1">
          상품 카테고리와 브랜드 관계를 시각화합니다.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Package className="w-4 h-4" />
            전체 상품
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {products.length}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Layers className="w-4 h-4" />
            카테고리
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {totalCategories}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Tag className="w-4 h-4" />
            브랜드
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {totalBrands}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setViewMode('graph')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5',
            viewMode === 'graph'
              ? 'bg-gray-900 text-white'
              : 'bg-white border border-gray-200 text-gray-700',
          )}
        >
          <Network className="w-4 h-4" /> 그래프
        </button>
        <button
          onClick={() => setViewMode('list')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5',
            viewMode === 'list'
              ? 'bg-gray-900 text-white'
              : 'bg-white border border-gray-200 text-gray-700',
          )}
        >
          <List className="w-4 h-4" /> 목록
        </button>
      </div>

      {viewMode === 'graph' ? (
        <OntologyGraph />
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="상품명, 카테고리, 브랜드 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
            />
          </div>

          {categoryGroups.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
              {searchQuery ? '검색 결과가 없습니다.' : '상품 데이터가 없습니다.'}
            </div>
          ) : (
            <div className="space-y-4">
              {categoryGroups.map((group) => (
                <div
                  key={group.category}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setSelectedCategory(
                        selectedCategory === group.category
                          ? null
                          : group.category
                      )
                    }
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                        <Layers className="w-4 h-4 text-violet-600" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">
                          {group.category}
                        </h3>
                        <p className="text-xs text-gray-500">
                          {group.products.length}개 상품
                          {group.brands.length > 0 &&
                            ` / ${group.brands.length}개 브랜드`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {group.brands.slice(0, 3).map((brand) => (
                        <span
                          key={brand}
                          className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600"
                        >
                          {brand}
                        </span>
                      ))}
                      {group.brands.length > 3 && (
                        <span className="text-xs text-gray-400">
                          +{group.brands.length - 3}
                        </span>
                      )}
                    </div>
                  </button>

                  {selectedCategory === group.category && (
                    <div className="border-t border-gray-200 p-4">
                      <div className="overflow-x-auto">
                        <table>
                          <thead>
                            <tr className="bg-gray-50">
                              <th>상품명</th>
                              <th>브랜드</th>
                              <th>등급</th>
                              <th>상태</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.products.map((product) => (
                              <tr key={product.id}>
                                <td className="font-medium text-gray-900">
                                  {product.name}
                                </td>
                                <td className="text-gray-500 text-xs">
                                  {product.brand || '-'}
                                </td>
                                <td>
                                  {product.abcGrade ? (
                                    <span
                                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                                        product.abcGrade === 'A'
                                          ? 'bg-green-100 text-green-800'
                                          : product.abcGrade === 'B'
                                            ? 'bg-blue-100 text-blue-800'
                                            : product.abcGrade === 'C'
                                              ? 'bg-yellow-100 text-yellow-800'
                                              : 'bg-gray-100 text-gray-600'
                                      }`}
                                    >
                                      {product.abcGrade}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 text-xs">-</span>
                                  )}
                                </td>
                                <td>
                                  <span
                                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                                      product.status === 'active'
                                        ? 'bg-green-100 text-green-800'
                                        : product.status === 'draft'
                                          ? 'bg-gray-100 text-gray-600'
                                          : 'bg-yellow-100 text-yellow-800'
                                    }`}
                                  >
                                    {product.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
