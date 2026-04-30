'use client';

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import ProductHeader from "./components/ProductHeader";
import ProductMetrics from "./components/ProductMetrics";
import HealthDiagnosis from "./components/HealthDiagnosis";
import ActivityHistory from "./components/ActivityHistory";
import ProductSidebar from "./components/ProductSidebar";
import ProductInfoCards, { type InventoryData } from "./components/ProductInfoCards";
import { useProductActions } from "./hooks/useProductActions";
import { ProductCatalogDetailSchema, type ProductCatalogDetail as Product } from "@kiditem/shared/product";

// Re-export types consumed by co-located components
export type { ActivityEvent, Workflow } from "./hooks/useProductActions";

export default function ProductDetailPage() {
  const params = useParams();
  const productId = params.id as string;
  // productId in the route is the master id per spec §6.1.
  const { data: product, isLoading: loading, error: productError } = useQuery({
    queryKey: queryKeys.products.catalog.detail(productId),
    queryFn: () => apiClient.getParsed(`/api/products/catalog/${productId}`, ProductCatalogDetailSchema),
    enabled: !!productId,
  });

  // Inventory side-call uses masterId (canonical per spec §6.1 inventory fix). Tolerant
  // to array/object response shapes from the legacy /api/inventory endpoint.
  const { data: inventory = null } = useQuery<InventoryData | null>({
    queryKey: queryKeys.inventory.byMaster(productId),
    queryFn: async () => {
      const inv = await apiClient.get<InventoryData[] | InventoryData>(`/api/inventory?masterId=${productId}`).catch(() => null);
      if (Array.isArray(inv) && inv.length > 0) return inv[0];
      if (inv && !Array.isArray(inv)) return inv;
      return null;
    },
    enabled: !!productId,
  });

  const error = productError ? "데이터를 불러오지 못했습니다." : !loading && !product ? "상품을 찾을 수 없습니다." : null;

  // Activities fetch — tenant scope is set by backend via @CurrentCompany();
  // the company-level branch drops `objectId` so the controller takes the
  // tenant-safe findByCompany path.
  const { data: activities = [] } = useQuery({
    queryKey: [...queryKeys.products.catalog.detail(productId), "activities"],
    queryFn: async () => {
      const [productEvents, companyEvents] = await Promise.all([
        apiClient.get<any[]>(`/api/activity-events?objectType=product&objectId=${productId}&eventType=workflow_analysis`).catch(() => []),
        apiClient.get<any[]>(`/api/activity-events?objectType=company&eventType=workflow_analysis&limit=10`).catch(() => []),
      ]);
      const all = [...(productEvents || []), ...(companyEvents || [])];
      all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return all;
    },
    enabled: !!product,
  });

  // Violations fetch
  const { data: violations = [] } = useQuery({
    queryKey: [...queryKeys.products.catalog.detail(productId), "violations"],
    queryFn: async () => {
      const data = await apiClient.get<any[]>(`/api/activity-events?objectType=product&objectId=${productId}&eventType=rule_violation&limit=20`);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!productId,
  });

  // Workflows fetch — backend scopes by @CurrentCompany().
  const { data: workflows = [] } = useQuery({
    queryKey: [...queryKeys.workflows.list(), "active"],
    queryFn: async () => {
      const wfs = await apiClient.get<any[]>(`/api/workflows?isActive=true`);
      return Array.isArray(wfs) ? wfs : [];
    },
    enabled: !!product,
  });

  const { showWfMenu, setShowWfMenu, runWorkflow, runBatchWorkflows, handleAction } =
    useProductActions({ productId, product: product ?? null, workflows });

  if (loading) return <PageSkeleton variant="detail" />;
  if (error || !product)
    return (
      <div className="flex items-center justify-center h-64 text-red-500">
        {error ?? "상품을 찾을 수 없습니다."}
      </div>
    );

  return (
    <div className="space-y-6">
      <ProductHeader
        workflows={workflows}
        showWfMenu={showWfMenu}
        onToggleWfMenu={() => setShowWfMenu((v) => !v)}
        onCloseWfMenu={() => setShowWfMenu(false)}
        onRunWorkflow={runWorkflow}
        onRunBatch={runBatchWorkflows}
      />

      <ProductMetrics product={product} />

      <div className="flex gap-6">
        <div className="flex-1 space-y-6 min-w-0">
          <ProductInfoCards product={product} inventory={inventory} />

          <HealthDiagnosis
            product={product}
            violations={violations}
          />

          <ActivityHistory activities={activities} onAction={handleAction} />
        </div>

        <ProductSidebar product={product} />
      </div>
    </div>
  );
}
