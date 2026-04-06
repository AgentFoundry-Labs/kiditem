'use client';

import { Search, Layers } from 'lucide-react';
import type { ProductListItem as Product } from '@kiditem/shared';

interface CategoryGroup {
  category: string;
  products: Product[];
  brands: string[];
}

interface Props {
  categoryGroups: CategoryGroup[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedCategory: string | null;
  onCategorySelect: (cat: string | null) => void;
}

export function CategoryList({
  categoryGroups,
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategorySelect,
}: Props) {
  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="상품명, 카테고리, 브랜드 검색..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
        />
      </div>

      {categoryGroups.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          {searchQuery ? '검색 결과가 없습니다.' : '상품 데이터가 없습니다.'}
        </div>
      ) : (
        <div className="space-y-4">
          {categoryGroups.map((group) => (
            <div
              key={group.category}
              className="table-card"
            >
              <button
                onClick={() =>
                  onCategorySelect(selectedCategory === group.category ? null : group.category)
                }
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                    <Layers className="w-4 h-4 text-violet-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-slate-900">{group.category}</h3>
                    <p className="text-xs text-slate-500">
                      {group.products.length}개 상품
                      {group.brands.length > 0 && ` / ${group.brands.length}개 브랜드`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {group.brands.slice(0, 3).map((brand) => (
                    <span
                      key={brand}
                      className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600"
                    >
                      {brand}
                    </span>
                  ))}
                  {group.brands.length > 3 && (
                    <span className="text-xs text-slate-400">+{group.brands.length - 3}</span>
                  )}
                </div>
              </button>

              {selectedCategory === group.category && (
                <div className="border-t border-slate-200 p-4">
                  <div className="overflow-x-auto">
                    <table>
                      <thead>
                        <tr>
                          <th>상품명</th>
                          <th>브랜드</th>
                          <th>등급</th>
                          <th>상태</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.products.map((product) => (
                          <tr key={product.id}>
                            <td className="font-medium text-slate-900">{product.name}</td>
                            <td className="text-slate-500 text-xs">{product.brand || '-'}</td>
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
                                          : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {product.abcGrade}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-xs">-</span>
                              )}
                            </td>
                            <td>
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  product.status === 'active'
                                    ? 'bg-green-100 text-green-800'
                                    : product.status === 'draft'
                                      ? 'bg-slate-100 text-slate-600'
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
  );
}
