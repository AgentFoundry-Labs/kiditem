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

  const pipeline = pipelineData?.pipeline ?? EMPTY_PIPELINE_RESULT.pipeline;
  const counts = pipelineData?.counts ?? EMPTY_PIPELINE_RESULT.counts;
  const error = queryError ? "주문 조회 실패" : null;
  const lastUpdated = dataUpdatedAt ? formatTime(dataUpdatedAt) : "";

  const refetch = () => queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });

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
  const handlePrintLabel = () => {
    toast.info("라벨 출력 기능 준비 중");
  };

  const totalOrders = Object.values(counts).reduce((s, c) => s + c, 0);
  const allChecked =
    activeOrders.length > 0 && activeOrders.every((o) => selectedOrders[o.id]);
  const displayNodes = showCompleted ? ORDER_ALL_NODES : ORDER_ACTIVE_NODES;
  const displayEdges = showCompleted
    ? [...ORDER_PIPELINE_EDGES, { from: 3, to: 4 }]
    : ORDER_PIPELINE_EDGES;

  return (
    <div className="space-y-4">
      <OrderHeader
        totalOrders={totalOrders}
        error={error}
        lastUpdated={lastUpdated}
        showCompleted={showCompleted}
        completedCount={counts["FINAL_DELIVERY"] || 0}
        loading={loading}
        onToggleCompleted={() => setShowCompleted(!showCompleted)}
        onRefresh={refetch}
      />
      <div
        role="status"
        className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800"
      >
        쿠팡 발주확인·송장 전송은 현재 지원하지 않습니다. 주문 수집은 주문수집 화면의 브라우저 세션 경로를 이용하세요.
      </div>
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
        allChecked={allChecked}
        loading={loading}
        error={error}
        onToggleAll={toggleAll}
        onToggleOrder={toggleOrder}
        onPrintLabel={handlePrintLabel}
      />
    </div>
  );
}
