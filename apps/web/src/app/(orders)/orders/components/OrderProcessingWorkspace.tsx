"use client";
import { useState } from "react";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import { formatTime } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import OrderHeader from "./OrderHeader";
import PipelineVisualization from "./PipelineVisualization";
import OrderTable from "./OrderTable";
import { useOrdersPipeline } from "../hooks/useOrdersPipeline";
import { useScheduledOrderSync } from "../hooks/useScheduledOrderSync";
import { useOrderActions } from "../hooks/useOrderActions";
import {
  EMPTY_PIPELINE_RESULT,
  ORDER_ACTIVE_NODES,
  ORDER_ALL_NODES,
  ORDER_PIPELINE_EDGES,
} from "../lib/order-pipeline";

export function OrderProcessingWorkspace() {
  const queryClient = useQueryClient();
  const [activeNode, setActiveNode] = useState("ACCEPT");
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Record<string, boolean>>({});

  const {
    data: pipelineData,
    isLoading: loading,
    error: queryError,
    dataUpdatedAt,
  } = useOrdersPipeline(showCompleted);

  const syncQuery = useScheduledOrderSync();
  const { confirmMutation, invoiceMutation } = useOrderActions();

  const pipeline = pipelineData?.pipeline ?? EMPTY_PIPELINE_RESULT.pipeline;
  const counts = pipelineData?.counts ?? EMPTY_PIPELINE_RESULT.counts;
  const error = queryError ? "주문 조회 실패" : null;
  const lastUpdated = dataUpdatedAt ? formatTime(dataUpdatedAt) : "";

  const refetch = () => queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });

  const selectedCount = Object.values(selectedOrders).filter(Boolean).length;

  const toggleOrder = (id: string) => {
    setSelectedOrders((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAll = () => {
    const orders = pipeline[activeNode as keyof typeof pipeline] || [];
    const allSelected =
      orders.length > 0 && orders.every((o) => selectedOrders[o.id]);
    if (allSelected) {
      setSelectedOrders({});
    } else {
      const next: Record<string, boolean> = {};
      orders.forEach((o) => {
        next[o.id] = true;
      });
      setSelectedOrders(next);
    }
  };

  const activeOrders = pipeline[activeNode as keyof typeof pipeline] || [];
  const selectedActiveOrders = activeOrders.filter((order) => selectedOrders[order.id]);

  const handleConfirm = () => {
    if (selectedActiveOrders.length === 0) return;
    confirmMutation.mutate(selectedActiveOrders);
  };

  const handlePrintLabel = () => {
    toast.info("라벨 출력 기능 준비 중");
  };

  const handleInvoice = () => {
    if (selectedActiveOrders.length !== 1) {
      toast.info("송장 전송은 주문 1건씩 처리합니다.");
      return;
    }
    const deliveryCompanyCode = window.prompt("택배사 코드 (예: CJGLS)");
    if (!deliveryCompanyCode) return;
    const invoiceNumber = window.prompt("송장번호");
    if (!invoiceNumber) return;
    invoiceMutation.mutate({
      order: selectedActiveOrders[0]!,
      deliveryCompanyCode,
      invoiceNumber,
    });
  };

  const totalOrders = Object.values(counts).reduce((s, c) => s + c, 0);
  const allChecked =
    activeOrders.length > 0 && activeOrders.every((o) => selectedOrders[o.id]);
  const displayNodes = showCompleted ? ORDER_ALL_NODES : ORDER_ACTIVE_NODES;
  const displayEdges = showCompleted
    ? [...ORDER_PIPELINE_EDGES, { from: 3, to: 4 }]
    : ORDER_PIPELINE_EDGES;

  const syncStatus =
    syncQuery.fetchStatus === "fetching"
      ? ("pending" as const)
      : syncQuery.status === "error"
        ? ("error" as const)
        : syncQuery.status === "success"
          ? ("success" as const)
          : ("idle" as const);

  return (
    <div className="space-y-4">
      <OrderHeader
        totalOrders={totalOrders}
        error={error}
        lastUpdated={lastUpdated}
        syncStatus={syncStatus}
        syncError={syncQuery.isError}
        showCompleted={showCompleted}
        completedCount={counts["FINAL_DELIVERY"] || 0}
        loading={loading}
        onToggleCompleted={() => setShowCompleted(!showCompleted)}
        onRefresh={refetch}
      />
      <PipelineVisualization
        displayNodes={displayNodes}
        displayEdges={displayEdges}
        counts={counts}
        activeNode={activeNode}
        onNodeClick={setActiveNode}
      />
      <OrderTable
        activeNode={activeNode}
        activeOrders={activeOrders}
        allNodes={ORDER_ALL_NODES}
        selectedOrders={selectedOrders}
        selectedCount={selectedCount}
        allChecked={allChecked}
        loading={loading}
        error={error}
        confirming={confirmMutation.isPending}
        invoicing={invoiceMutation.isPending}
        onToggleAll={toggleAll}
        onToggleOrder={toggleOrder}
        onConfirm={handleConfirm}
        onPrintLabel={handlePrintLabel}
        onInvoice={handleInvoice}
      />
    </div>
  );
}
