"use client";
import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { isApiError } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";
import type { ProductCatalogDetail as Product } from "@kiditem/shared";

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

  // Polling state: { runId, toastId, wfName } when a single workflow run is in progress
  const [wfPollState, setWfPollState] = useState<{ runId: string; toastId: string | number; wfName: string } | null>(null);
  // Polling state for batch: { runs, toastId, runsCompleted }
  const [batchPollState, setBatchPollState] = useState<{ runs: { id: string }[]; toastId: string | number; runsCompleted: boolean } | null>(null);

  const refreshActivities = () => {
    queryClient.invalidateQueries({ queryKey: [...queryKeys.products.catalog.detail(productId), "activities"] });
  };

  // Poll single workflow run
  useQuery({
    queryKey: ['wf-poll', wfPollState?.runId],
    queryFn: async () => {
      if (!wfPollState) return null;
      const { runId, toastId, wfName } = wfPollState;
      const companyId = product?.companyId;
      if (companyId) {
        const events = await apiClient.get<ActivityEvent[]>(
          `/api/activity-events?objectType=product&objectId=${productId}&eventType=workflow_analysis&limit=1`
        ).catch(() => null);
        if (Array.isArray(events) && events.length > 0) {
          const eventTime = new Date(events[0].createdAt).getTime();
          if (eventTime > Date.now() - 120000) {
            setWfPollState(null);
            toast.success(`${wfName} 분석 완료`, { id: toastId, duration: 3000 });
            refreshActivities();
            return null;
          }
        }
      }
      const detail = await apiClient.get<WorkflowRunStatus>(`/api/workflow-runs/${runId}`).catch(() => null);
      if (detail?.status === "failed") {
        setWfPollState(null);
        toast.error(detail.error ?? `${wfName} 실패`, { id: toastId, duration: 5000 });
        refreshActivities();
      }
      return null;
    },
    refetchInterval: 1500,
    enabled: !!wfPollState,
  });

  // Poll batch workflow runs
  useQuery({
    queryKey: ['batch-poll', batchPollState?.runs.map(r => r.id).join(',')],
    queryFn: async () => {
      if (!batchPollState) return null;
      const { runs, toastId, runsCompleted } = batchPollState;
      if (!runsCompleted) {
        const details = await Promise.all(
          runs.map((r) => apiClient.get<WorkflowRunStatus>(`/api/workflow-runs/${r.id}`).catch(() => null))
        );
        const done = details.every((d) => d?.status === "completed" || d?.status === "failed");
        if (done) {
          setBatchPollState({ ...batchPollState, runsCompleted: true });
          toast.loading("워크플로우 완료, AI 종합 분석 중...", { id: toastId });
          refreshActivities();
        }
        return null;
      }
      const companyId = product?.companyId;
      if (!companyId) return null;
      const events = await apiClient.get<ActivityEvent[]>(
        `/api/activity-events?objectType=company&objectId=${companyId}&eventType=workflow_analysis&limit=1`
      ).catch(() => null);
      if (Array.isArray(events) && events.length > 0) {
        const eventTime = new Date(events[0].createdAt).getTime();
        if (eventTime > Date.now() - 120000) {
          setBatchPollState(null);
          toast.success("전체 종합 점검 완료", { id: toastId, duration: 5000 });
          refreshActivities();
        }
      }
      return null;
    },
    refetchInterval: 1500,
    enabled: !!batchPollState,
  });

  const runWorkflow = async (wf: Workflow) => {
    setShowWfMenu(false);
    const toastId = toast.loading(`${wf.name} 실행 중...`);
    try {
      const run = await apiClient.post<{ id: string }>(`/api/workflows/${wf.id}/run`, { context: { productId } });
      toast.loading(`${wf.name} 완료, AI 분석 중...`, { id: toastId });
      setWfPollState({ runId: run.id, toastId, wfName: wf.name });
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
      setBatchPollState({ runs: runs as { id: string }[], toastId, runsCompleted: false });
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
    } else if (type.startsWith("product.")) {
      // Write path (adjust_price / stop_ads / discontinue / change_grade) is unwired
      // in this slice. UI action triggers stay rendered; backend wiring lands with
      // the agent/workflow redesign (see TODOS.md "Agent/Workflow 재설계").
      toast.info(`${action.label}: 기능 준비 중`, { duration: 3000 });
    } else if (type === "inventory.create_purchase_order") {
      window.location.href = `/purchase-orders/new?productId=${actionParams.productId}&quantity=${actionParams.quantity ?? ""}`;
    } else if (type === "report.export_excel") {
      toast.loading("엑셀 다운로드 준비 중...");
    }
  };

  return { showWfMenu, setShowWfMenu, runWorkflow, runBatchWorkflows, handleAction };
}
