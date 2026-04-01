"use client";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrderRow } from "@kiditem/shared";
import { useEffect, useState } from "react";
import { CheckCircle, Truck, Package, Clock, MapPin } from "lucide-react";
import OrderHeader from "./components/OrderHeader";
import PipelineVisualization from "./components/PipelineVisualization";
import OrderTable from "./components/OrderTable";

const ACTIVE_NODES = [
  { key: "ACCEPT", label: "신규주문", sub: "Order Received", icon: Clock, color: "#3b82f6" },
  { key: "INSTRUCT", label: "발주확인", sub: "Confirmed", icon: CheckCircle, color: "#8b5cf6" },
  { key: "DEPARTURE", label: "출고완료", sub: "Shipped", icon: Package, color: "#f59e0b" },
  { key: "DELIVERING", label: "배송중", sub: "In Transit", icon: Truck, color: "#10b981" },
];
const ALL_NODES = [
  ...ACTIVE_NODES,
  { key: "FINAL_DELIVERY", label: "배송완료", sub: "Delivered", icon: MapPin, color: "#6b7280" },
];
const EDGES = [
  { from: 0, to: 1 },
  { from: 1, to: 2 },
  { from: 2, to: 3 },
];
const SYNC_HOURS = [9, 12, 15, 18];

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const [activeNode, setActiveNode] = useState("ACCEPT");
  const [showCompleted, setShowCompleted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Record<string, boolean>>({});

  const { data: pipelineData, isLoading: loading, error: queryError, dataUpdatedAt } = useQuery({
    queryKey: queryKeys.orders.pipeline(),
    queryFn: async () => {
      const results = await Promise.all(
        ALL_NODES.map(async (node) => {
          try {
            const data = await apiClient.get<{ orders: OrderRow[] }>(`/api/orders?status=${node.key}`);
            const orders = (data.orders || []) as OrderRow[];
            return { key: node.key, orders, count: orders.length };
          } catch {
            return { key: node.key, orders: [] as OrderRow[], count: 0 };
          }
        })
      );
      const pipeline: Record<string, OrderRow[]> = {};
      const counts: Record<string, number> = {};
      results.forEach((r) => {
        pipeline[r.key] = r.orders;
        counts[r.key] = r.count;
      });
      return { pipeline, counts };
    },
  });

  const pipeline = pipelineData?.pipeline ?? {};
  const counts = pipelineData?.counts ?? {};
  const error = queryError ? "주문 조회 실패" : null;
  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";

  const refetch = () => queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });

  useEffect(() => {
    const lastSyncKey = "orders_last_sync_hour";
    const syncFromCoupang = async () => {
      const now = new Date();
      const hour = now.getHours();
      const lastHour = sessionStorage.getItem(lastSyncKey);
      if (SYNC_HOURS.includes(hour) && lastHour !== String(hour)) {
        setSyncing(true);
        try {
          const today = now.toISOString().slice(0, 10);
          const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
          await apiClient.post("/api/coupang-sync", { createdAtFrom: weekAgo, createdAtTo: today });
          sessionStorage.setItem(lastSyncKey, String(hour));
          refetch();
        } catch {}
        setSyncing(false);
      }
    };
    syncFromCoupang();
    const timer = setInterval(syncFromCoupang, 60_000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSelectedOrders({});
  }, [activeNode]);

  const selectedCount = Object.values(selectedOrders).filter(Boolean).length;

  const toggleOrder = (id: string) => {
    setSelectedOrders((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAll = () => {
    const orders = pipeline[activeNode] || [];
    const allSelected = orders.length > 0 && orders.every((o) => selectedOrders[o.id]);
    if (allSelected) {
      setSelectedOrders({});
    } else {
      const next: Record<string, boolean> = {};
      orders.forEach((o) => { next[o.id] = true; });
      setSelectedOrders(next);
    }
  };

  const handleConfirm = () => {
    const ids = Object.keys(selectedOrders).filter((id) => selectedOrders[id]);
    if (ids.length === 0) return;
    // TODO: POST /api/orders/confirm when API exists
    console.log("CONFIRM orders:", ids);
    alert(`${ids.length}건 발주확인 처리 (API 연동 예정)`);
  };

  const handlePrintLabel = () => {
    alert("라벨 출력 기능 준비 중");
  };

  const handleInvoice = () => {
    const ids = Object.keys(selectedOrders).filter((id) => selectedOrders[id]);
    if (ids.length === 0) return;
    console.log("INVOICE orders:", ids);
    alert(`${ids.length}건 송장 처리 (API 연동 예정)`);
  };

  const totalOrders = Object.values(counts).reduce((s, c) => s + c, 0);
  const activeOrders = pipeline[activeNode] || [];
  const allChecked = activeOrders.length > 0 && activeOrders.every((o) => selectedOrders[o.id]);
  const displayNodes = showCompleted ? ALL_NODES : ACTIVE_NODES;
  const displayEdges = showCompleted ? [...EDGES, { from: 3, to: 4 }] : EDGES;

  return (
    <div className="space-y-4">
      <OrderHeader
        totalOrders={totalOrders}
        error={error}
        lastUpdated={lastUpdated}
        syncing={syncing}
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
        allNodes={ALL_NODES}
        selectedOrders={selectedOrders}
        selectedCount={selectedCount}
        allChecked={allChecked}
        loading={loading}
        error={error}
        onToggleAll={toggleAll}
        onToggleOrder={toggleOrder}
        onConfirm={handleConfirm}
        onPrintLabel={handlePrintLabel}
        onInvoice={handleInvoice}
      />
    </div>
  );
}
