"use client";

import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import PageSkeleton from "@/components/ui/PageSkeleton";
import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, Box, ExternalLink } from "lucide-react";
import { formatKRW } from "@/lib/utils";
import type { ProductDetail as Product } from '@kiditem/shared';
import { queryKeys } from "@/lib/query-keys";
import ProductHeader from "./components/ProductHeader";
import ProductMetrics, { categoryNames } from "./components/ProductMetrics";
import HealthDiagnosis from "./components/HealthDiagnosis";
import ActivityHistory from "./components/ActivityHistory";
import ProductSidebar, { InfoCard, InfoRow } from "./components/ProductSidebar";

interface InventoryData {
  currentStock: number;
  reservedStock: number;
  safetyStock: number;
  reorderPoint: number;
  dailySalesAvg: number;
  leadTimeDays: number | null;
}

export interface ActivityEvent {
  id: string;
  eventType: string;
  source: string;
  title: string;
  data: Record<string, any> | null;
  createdAt: string;
}

export interface Workflow {
  id: string;
  name: string;
  module: string;
  isActive: boolean;
}

interface WorkflowRunStatus {
  id: string;
  status: string;
  error: string | null;
}

export default function ProductDetailPage() {
  const params = useParams();
  const productId = params.id as string;
  const queryClient = useQueryClient();

  const [showWfMenu, setShowWfMenu] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "loading" | "success" | "error";
    actions?: { type: string; label: string; reason?: string; params?: Record<string, any> }[];
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Main product + inventory fetch
  const { data: productData, isLoading: loading, error: productError } = useQuery({
    queryKey: queryKeys.products.detail(productId),
    queryFn: async () => {
      const [prod, inv] = await Promise.all([
        apiClient.get<Product>(`/api/products/${productId}`).catch(() => null),
        apiClient.get<InventoryData[] | InventoryData>(`/api/inventory?productId=${productId}`).catch(() => null),
      ]);
      let inventory: InventoryData | null = null;
      if (Array.isArray(inv) && inv.length > 0) {
        inventory = inv[0];
      } else if (inv && !Array.isArray(inv)) {
        inventory = inv;
      }
      return { product: prod, inventory };
    },
    enabled: !!productId,
  });

  const product = productData?.product ?? null;
  const inventory = productData?.inventory ?? null;
  const error = productError ? "데이터를 불러오지 못했습니다." : !loading && !product ? "상품을 찾을 수 없습니다." : null;

  // Activities fetch
  const { data: activities = [] } = useQuery({
    queryKey: [...queryKeys.products.detail(productId), 'activities'],
    queryFn: async () => {
      const companyId = product?.companyId;
      if (!companyId) return [];
      const [productEvents, companyEvents] = await Promise.all([
        apiClient.get<ActivityEvent[]>(`/api/activity-events?objectType=product&objectId=${productId}&eventType=workflow_analysis`).catch(() => []),
        apiClient.get<ActivityEvent[]>(`/api/activity-events?objectType=company&objectId=${companyId}&eventType=workflow_analysis&limit=10`).catch(() => []),
      ]);
      const all = [...(productEvents || []), ...(companyEvents || [])];
      all.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return all;
    },
    enabled: !!product?.companyId,
  });

  // Violations fetch
  const { data: violations = [] } = useQuery({
    queryKey: [...queryKeys.products.detail(productId), 'violations'],
    queryFn: async () => {
      const data = await apiClient.get<ActivityEvent[]>(`/api/activity-events?objectType=product&objectId=${productId}&eventType=rule_violation&limit=20`);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!productId,
  });

  // Workflows fetch
  const { data: workflows = [] } = useQuery({
    queryKey: [...queryKeys.workflows.list(), 'active'],
    queryFn: async () => {
      const wfs = await apiClient.get<Workflow[]>(`/api/workflows?isActive=true`);
      return Array.isArray(wfs) ? wfs : [];
    },
  });

  // Health evaluation mutation
  const evaluateHealthMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post(`/api/rules/evaluate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(productId) });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.products.detail(productId), 'violations'] });
    },
  });

  const evaluatingHealth = evaluateHealthMutation.isPending;
  const handleEvaluateHealth = () => evaluateHealthMutation.mutate();

  const refreshActivities = () => {
    queryClient.invalidateQueries({ queryKey: [...queryKeys.products.detail(productId), 'activities'] });
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const showToast = (
    message: string,
    type: "loading" | "success" | "error",
    opts?: { duration?: number; actions?: { type: string; label: string; reason?: string; params?: Record<string, any> }[] },
  ) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type, actions: opts?.actions });
    if (opts?.duration) {
      toastTimerRef.current = setTimeout(() => setToast(null), opts.duration);
    }
  };

  const runWorkflow = async (wf: Workflow) => {
    setShowWfMenu(false);
    showToast(`${wf.name} 실행 중...`, "loading");

    try {
      const run = await apiClient.post<{ id: string }>(`/api/workflows/${wf.id}/run`, { context: { productId } });

      showToast(`${wf.name} 완료, AI 분석 중...`, "loading");

      pollRef.current = setInterval(async () => {
        const companyId = product?.companyId;
        if (!companyId) return;
        const events = await apiClient.get<ActivityEvent[]>(
          `/api/activity-events?objectType=product&objectId=${productId}&eventType=workflow_analysis&limit=1`
        ).catch(() => null);
        if (!events) return;
        if (Array.isArray(events) && events.length > 0) {
          const latest = events[0];
          const eventTime = new Date(latest.createdAt).getTime();
          const runStartTime = Date.now() - 120000;
          if (eventTime > runStartTime) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            showToast(`${wf.name} 분석 완료`, "success", { duration: 3000 });
            refreshActivities();
            return;
          }
        }

        const detail = await apiClient.get<WorkflowRunStatus>(`/api/workflow-runs/${run.id}`).catch(() => null);
        if (!detail) return;

        if (detail.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          showToast(detail.error ?? `${wf.name} 실패`, "error", { duration: 5000 });
          refreshActivities();
        }
      }, 1500);
    } catch (err) {
      showToast(isApiError(err) ? err.detail : "워크플로우 실행에 실패했습니다.", "error", { duration: 5000 });
    }
  };

  const runBatchWorkflows = async () => {
    setShowWfMenu(false);
    showToast("전체 종합 점검 실행 중...", "loading");

    try {
      const runs = await apiClient.post<{ id: string }[]>(`/api/workflows/batch-run`, { workflowIds: workflows.map((w) => w.id), context: { productId } });

      const checkAll = async () => {
        const details = await Promise.all(
          (runs as any[]).map((r: any) =>
            apiClient.get<WorkflowRunStatus>(`/api/workflow-runs/${r.id}`).catch(() => null)
          )
        );
        return details.every((d: any) => d?.status === "completed" || d?.status === "failed");
      };

      let runsCompleted = false;

      pollRef.current = setInterval(async () => {
        if (!runsCompleted) {
          const done = await checkAll();
          if (done) {
            runsCompleted = true;
            showToast("워크플로우 완료, AI 종합 분석 중...", "loading");
            refreshActivities();
          }
          return;
        }

        const companyId = product?.companyId;
        if (!companyId) return;
        const events = await apiClient.get<ActivityEvent[]>(
          `/api/activity-events?objectType=company&objectId=${companyId}&eventType=workflow_analysis&limit=1`
        ).catch(() => null);
        if (!events) return;
        if (Array.isArray(events) && events.length > 0) {
          const latest = events[0];
          const eventTime = new Date(latest.createdAt).getTime();
          const batchStartTime = Date.now() - 120000;
          if (eventTime > batchStartTime) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            showToast("전체 종합 점검 완료", "success", { duration: 5000 });
            refreshActivities();
          }
        }
      }, 1500);
    } catch (err) {
      showToast(isApiError(err) ? err.detail : "전체 종합 점검 실패", "error", { duration: 5000 });
    }
  };

  const handleAction = (action: any) => {
    const params = action.params ?? {};
    const type = action.type as string;

    if (type === 'workflow.run') {
      const wf = workflows.find((w) => w.module === params.workflowModule);
      if (wf) runWorkflow(wf);
    } else if (type === 'product.view_detail') {
      window.location.href = `/products/${params.productId}`;
    } else if (type.startsWith('product.') && params.productId) {
      apiClient.put(`/api/products/${params.productId}`,
        type === 'product.adjust_price' ? { sellPrice: params.newPrice } :
        type === 'product.stop_ads' ? { adTier: null } :
        type === 'product.discontinue' ? { status: 'discontinued' } :
        type === 'product.change_grade' ? { abcGrade: params.grade } :
        {}
      ).then(() => {
        showToast(`${action.label} 완료`, "success", { duration: 3000 });
        refreshActivities();
      }).catch(() => {
        showToast(`${action.label} 실패`, "error", { duration: 5000 });
      });
    } else if (type === 'inventory.create_purchase_order') {
      window.location.href = `/purchase-orders/new?productId=${params.productId}&quantity=${params.quantity ?? ''}`;
    } else if (type === 'report.export_excel') {
      showToast("엑셀 다운로드 준비 중...", "loading");
    }
  };

  if (loading)
    return <PageSkeleton variant="detail" />;
  if (error || !product)
    return (
      <div className="flex items-center justify-center h-64 text-red-500">
        {error ?? "상품을 찾을 수 없습니다."}
      </div>
    );

  const daysOfStock =
    inventory && inventory.dailySalesAvg > 0
      ? Math.floor(inventory.currentStock / inventory.dailySalesAvg)
      : null;
  const needsReorder =
    inventory && inventory.currentStock <= inventory.reorderPoint;

  return (
    <div className="space-y-6">
      <ProductHeader
        workflows={workflows}
        showWfMenu={showWfMenu}
        toast={toast}
        onToggleWfMenu={() => setShowWfMenu((v) => !v)}
        onCloseWfMenu={() => setShowWfMenu(false)}
        onRunWorkflow={runWorkflow}
        onRunBatch={runBatchWorkflows}
        onCloseToast={() => setToast(null)}
        onAction={handleAction}
      />

      <ProductMetrics product={product} />

      <div className="flex gap-6">
        <div className="flex-1 space-y-6 min-w-0">
          <InfoCard title="상품 정보" icon={<Package size={16} />}>
            <InfoRow label="카테고리" value={categoryNames[product.category || ""] || product.category || "-"} />
            <InfoRow label="소싱 플랫폼" value={product.sourcePlatform ?? "-"} />
            {product.sourceUrl && (
              <InfoRow
                label="소싱 URL"
                value={
                  <a
                    href={product.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline flex items-center gap-1"
                  >
                    링크 <ExternalLink size={12} />
                  </a>
                }
              />
            )}
            <InfoRow label="쿠팡 상품 ID" value={product.coupangProductId ?? "-"} />
            <InfoRow label="배송비" value={product.shippingCost ? `₩${formatKRW(product.shippingCost)}` : "-"} />
          </InfoCard>

          {inventory ? (
            <InfoCard title="재고 현황" icon={<Box size={16} />}>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                <InfoRow label="현재 재고" value={`${inventory.currentStock ?? 0}개`} />
                <InfoRow label="안전 재고" value={`${inventory.safetyStock ?? 0}개`} />
                <InfoRow label="일평균 판매" value={`${(inventory.dailySalesAvg ?? 0).toFixed(1)}개`} />
                <InfoRow label="발주점" value={`${inventory.reorderPoint ?? 0}개`} />
                <InfoRow
                  label="남은 일수"
                  value={daysOfStock != null ? `${daysOfStock}일` : "-"}
                />
                <InfoRow
                  label="발주 필요"
                  value={
                    needsReorder ? (
                      <span className="text-red-600 font-semibold">⚠ 필요</span>
                    ) : (
                      <span className="text-green-600">충분</span>
                    )
                  }
                />
              </div>
            </InfoCard>
          ) : (
            <InfoCard title="재고 현황" icon={<Box size={16} />}>
              <p className="text-sm text-slate-400">재고 데이터 없음</p>
            </InfoCard>
          )}

          <HealthDiagnosis
            product={product}
            violations={violations}
            evaluatingHealth={evaluatingHealth}
            onEvaluate={handleEvaluateHealth}
          />

          <ActivityHistory
            activities={activities}
            onAction={handleAction}
          />
        </div>

        <ProductSidebar product={product} />
      </div>
    </div>
  );
}
