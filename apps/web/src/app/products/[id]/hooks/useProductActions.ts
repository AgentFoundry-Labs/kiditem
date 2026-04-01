"use client";
import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { isApiError } from "@/lib/api-error";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import type { ProductDetail as Product } from "@kiditem/shared";

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

interface UseProductActionsParams {
  productId: string;
  product: Product | null;
  workflows: Workflow[];
}

export function useProductActions({ productId, product, workflows }: UseProductActionsParams) {
  const queryClient = useQueryClient();
  const [showWfMenu, setShowWfMenu] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshActivities = () => {
    queryClient.invalidateQueries({ queryKey: [...queryKeys.products.detail(productId), "activities"] });
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const runWorkflow = async (wf: Workflow) => {
    setShowWfMenu(false);
    const toastId = toast.loading(`${wf.name} 실행 중...`);
    try {
      const run = await apiClient.post<{ id: string }>(`/api/workflows/${wf.id}/run`, { context: { productId } });
      toast.loading(`${wf.name} 완료, AI 분석 중...`, { id: toastId });
      pollRef.current = setInterval(async () => {
        const companyId = product?.companyId;
        if (!companyId) return;
        const events = await apiClient.get<ActivityEvent[]>(
          `/api/activity-events?objectType=product&objectId=${productId}&eventType=workflow_analysis&limit=1`
        ).catch(() => null);
        if (!events) return;
        if (Array.isArray(events) && events.length > 0) {
          const eventTime = new Date(events[0].createdAt).getTime();
          if (eventTime > Date.now() - 120000) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            toast.success(`${wf.name} 분석 완료`, { id: toastId, duration: 3000 });
            refreshActivities();
            return;
          }
        }
        const detail = await apiClient.get<WorkflowRunStatus>(`/api/workflow-runs/${run.id}`).catch(() => null);
        if (!detail) return;
        if (detail.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          toast.error(detail.error ?? `${wf.name} 실패`, { id: toastId, duration: 5000 });
          refreshActivities();
        }
      }, 1500);
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : "워크플로우 실행에 실패했습니다.", { id: toastId, duration: 5000 });
    }
  };

  const runBatchWorkflows = async () => {
    setShowWfMenu(false);
    const toastId = toast.loading("전체 종합 점검 실행 중...");
    try {
      const runs = await apiClient.post<{ id: string }[]>(`/api/workflows/batch-run`, {
        workflowIds: workflows.map((w) => w.id),
        context: { productId },
      });
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
            toast.loading("워크플로우 완료, AI 종합 분석 중...", { id: toastId });
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
          const eventTime = new Date(events[0].createdAt).getTime();
          if (eventTime > Date.now() - 120000) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            toast.success("전체 종합 점검 완료", { id: toastId, duration: 5000 });
            refreshActivities();
          }
        }
      }, 1500);
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : "전체 종합 점검 실패", { id: toastId, duration: 5000 });
    }
  };

  const handleAction = (action: any) => {
    const actionParams = action.params ?? {};
    const type = action.type as string;
    if (type === "workflow.run") {
      const wf = workflows.find((w) => w.module === actionParams.workflowModule);
      if (wf) runWorkflow(wf);
    } else if (type === "product.view_detail") {
      window.location.href = `/products/${actionParams.productId}`;
    } else if (type.startsWith("product.") && actionParams.productId) {
      apiClient.put(
        `/api/products/${actionParams.productId}`,
        type === "product.adjust_price" ? { sellPrice: actionParams.newPrice } :
        type === "product.stop_ads" ? { adTier: null } :
        type === "product.discontinue" ? { status: "discontinued" } :
        type === "product.change_grade" ? { abcGrade: actionParams.grade } :
        {}
      ).then(() => {
        toast.success(`${action.label} 완료`, { duration: 3000 });
        refreshActivities();
      }).catch(() => {
        toast.error(`${action.label} 실패`, { duration: 5000 });
      });
    } else if (type === "inventory.create_purchase_order") {
      window.location.href = `/purchase-orders/new?productId=${actionParams.productId}&quantity=${actionParams.quantity ?? ""}`;
    } else if (type === "report.export_excel") {
      toast.loading("엑셀 다운로드 준비 중...");
    }
  };

  return { showWfMenu, setShowWfMenu, runWorkflow, runBatchWorkflows, handleAction };
}
