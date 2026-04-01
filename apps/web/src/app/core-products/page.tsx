"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { ProductListItem as Product } from '@kiditem/shared';

import { Star } from "lucide-react";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { queryKeys } from "@/lib/query-keys";
import CoreProductsSummary from "./components/CoreProductsSummary";
import CoreProductsGrid from "./components/CoreProductsGrid";

export default function CoreProductsPage() {
  const { data: products = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.products.list({ grade: 'A' }),
    queryFn: () => apiClient.get<{ items: Product[] }>('/api/products?grade=A').then((d) => d.items ?? []),
  });

  if (loading) return <PageSkeleton variant="cards" />;

  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);
  const totalProfit = products.reduce((s, p) => s + p.netProfit, 0);
  const totalAdSpend = products.reduce((s, p) => s + (p.adRate > 0 ? p.revenue * (p.adRate / 100) : 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">
          <Star size={24} className="inline mr-2 text-yellow-500" />
          핵심상품 관리 (A등급 {products.length}개)
        </h1>
      </div>

      <CoreProductsSummary
        totalRevenue={totalRevenue}
        totalProfit={totalProfit}
        totalAdSpend={totalAdSpend}
      />

      <CoreProductsGrid products={products} />
    </div>
  );
}
