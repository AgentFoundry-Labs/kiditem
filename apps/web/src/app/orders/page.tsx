"use client";
import { API_BASE } from "@/lib/api";

import { useEffect, useState, useCallback } from "react";
import {
  CheckCircle,
  Truck,
  Loader2,
  RefreshCw,
  Package,
  Clock,
  MapPin,
  Zap,
  Plus,
  Printer,
  FileText,
  Check,
} from "lucide-react";
import { formatKRW } from "@/lib/utils";

interface OrderRow {
  id: string;
  orderNumber: string;
  platform: string;
  customerName: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status: string;
  orderedAt: string;
  receiverName: string | null;
  receiverAddr: string | null;
  trackingNumber: string | null;
  shippingCompany: string | null;
}

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
  const [pipeline, setPipeline] = useState<Record<string, OrderRow[]>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeNode, setActiveNode] = useState("ACCEPT");
  const [lastUpdated, setLastUpdated] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Record<string, boolean>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const results = await Promise.all(
      ALL_NODES.map(async (node) => {
        try {
          const res = await fetch(`${API_BASE}/api/orders?status=${node.key}`);
          if (!res.ok) return { key: node.key, orders: [] as OrderRow[], count: 0 };
          const data = await res.json();
          const orders = (data.orders || []) as OrderRow[];
          return { key: node.key, orders, count: orders.length };
        } catch {
          return { key: node.key, orders: [] as OrderRow[], count: 0 };
        }
      })
    );

    const np: Record<string, OrderRow[]> = {};
    const nc: Record<string, number> = {};
    results.forEach((r) => {
      np[r.key] = r.orders;
      nc[r.key] = r.count;
    });

    setPipeline(np);
    setCounts(nc);
    setLastUpdated(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

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
          await fetch(`${API_BASE}/api/coupang-sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ createdAtFrom: weekAgo, createdAtTo: today }),
          });
          sessionStorage.setItem(lastSyncKey, String(hour));
          fetchAll();
        } catch {
        }
        setSyncing(false);
      }
    };
    syncFromCoupang();
    const timer = setInterval(syncFromCoupang, 60_000);
    return () => clearInterval(timer);
  }, [fetchAll]);

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

  const nodeW = 130;
  const nodeH = 90;
  const gap = 50;
  const padX = 30;
  const svgW = displayNodes.length * nodeW + (displayNodes.length - 1) * gap + padX * 2;
  const svgH = nodeH + 40;
  const nodeY = 20;
  const getNodeX = (i: number) => padX + i * (nodeW + gap);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap size={18} className="text-blue-500" />
          <div>
            <h1 className="text-base font-semibold text-gray-900 uppercase tracking-wide">Order Pipeline</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-400 font-mono">{totalOrders} orders</span>
              {error && <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-mono">ERROR</span>}
              <span className="text-[10px] text-gray-400 font-mono">{lastUpdated}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {syncing && <span className="text-[10px] text-blue-600 font-mono animate-pulse">쿠팡 동기화 중...</span>}
          <span className="text-[10px] text-gray-400 font-mono">자동 동기화: 9/12/15/18시</span>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className={`px-3 py-1.5 text-xs rounded-md font-mono transition-colors ${
              showCompleted ? "bg-gray-200 text-gray-700" : "bg-gray-100 text-gray-400"
            }`}
          >
            {showCompleted ? "배송완료 숨기기" : `배송완료 보기 (${counts["FINAL_DELIVERY"] || 0})`}
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-md font-mono">
            <Plus size={12} /> 수기주문
          </button>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-md font-mono"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> REFRESH
          </button>
        </div>
      </div>

      {/* Pipeline Visualization */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">Autonomous Lineage</h3>
          <span className="text-[10px] text-emerald-600 font-mono flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
          </span>
        </div>
        <div className="relative overflow-x-auto bg-gray-50/50 p-4">
          <svg
            width="100%"
            height={svgH}
            viewBox={`0 0 ${svgW} ${svgH}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ minWidth: 700, display: "block" }}
          >
            <defs>
              <pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse">
                <circle cx="8" cy="8" r="0.6" fill="#dde0e5" />
              </pattern>
            </defs>
            <rect width={svgW} height={svgH} fill="url(#dots)" rx="6" />

            {displayEdges.map((edge, i) => {
              const x1 = getNodeX(edge.from) + nodeW;
              const x2 = getNodeX(edge.to);
              const y = nodeY + nodeH / 2;
              const fromCount = counts[displayNodes[edge.from]?.key] || 0;
              return (
                <g key={`edge-${i}`}>
                  <line x1={x1 + 2} y1={y} x2={x2 - 2} y2={y} stroke="#d1d5db" strokeWidth="2" strokeDasharray="5 3" />
                  <polygon points={`${x2 - 5},${y - 3.5} ${x2},${y} ${x2 - 5},${y + 3.5}`} fill="#c0c5cd" />
                  {fromCount > 0 && (
                    <text x={(x1 + x2) / 2} y={y - 8} textAnchor="middle" fontSize="10" fill="#9ca3af" fontFamily="monospace">
                      {fromCount}
                    </text>
                  )}
                </g>
              );
            })}

            {displayNodes.map((node, i) => {
              const count = counts[node.key] || 0;
              const isActive = activeNode === node.key;
              const nx = getNodeX(i);
              return (
                <g
                  key={node.key}
                  onClick={() => setActiveNode(node.key)}
                  className="cursor-pointer"
                >
                  <rect x={nx + 2} y={nodeY + 2} width={nodeW} height={nodeH} rx="10" fill="black" opacity="0.04" />
                  <rect
                    x={nx} y={nodeY} width={nodeW} height={nodeH} rx="10"
                    fill={isActive ? node.color : "white"}
                    stroke={isActive ? node.color : "#dde0e5"}
                    strokeWidth={isActive ? 2 : 1}
                  />
                  <text
                    x={nx + nodeW / 2} y={nodeY + 38} textAnchor="middle"
                    fontSize="32" fontWeight="800" fontFamily="monospace"
                    fill={isActive ? "white" : node.color}
                  >
                    {count}
                  </text>
                  <text
                    x={nx + nodeW / 2} y={nodeY + 58} textAnchor="middle"
                    fontSize="13" fontWeight="600"
                    fill={isActive ? "rgba(255,255,255,0.95)" : "#374151"}
                  >
                    {node.label}
                  </text>
                  <text
                    x={nx + nodeW / 2} y={nodeY + 74} textAnchor="middle"
                    fontSize="10" fontFamily="monospace"
                    fill={isActive ? "rgba(255,255,255,0.55)" : "#9ca3af"}
                  >
                    {node.sub}
                  </text>
                  {count > 0 && !isActive && (
                    <circle cx={nx + nodeW - 10} cy={nodeY + 10} r="4" fill={node.color} opacity="0.8" />
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Detail Panel */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: ALL_NODES.find((n) => n.key === activeNode)?.color }}
            />
            <span className="text-xs font-semibold text-gray-900 uppercase tracking-wider">
              {ALL_NODES.find((n) => n.key === activeNode)?.label}
            </span>
            <span className="text-[11px] text-gray-400 font-mono">{activeOrders.length} orders</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleConfirm}
              disabled={selectedCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Check size={12} />
              CONFIRM ({selectedCount})
            </button>
            <button
              onClick={handlePrintLabel}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
            >
              <Printer size={12} />
              PRINT LABEL
            </button>
            <button
              onClick={handleInvoice}
              disabled={selectedCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-full bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <FileText size={12} />
              INVOICE ({selectedCount})
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400 text-xs font-mono flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" /> LOADING ORDERS...
          </div>
        ) : error && activeOrders.length === 0 ? (
          <div className="text-center py-12 text-red-500 text-sm">{error}</div>
        ) : activeOrders.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-xs font-mono">
            NO ORDERS IN THIS STAGE
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr className="bg-gray-50">
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleAll}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th>상품명</th>
                  <th className="text-right">금액</th>
                  <th>주문자</th>
                  <th>주소</th>
                  <th>주문일</th>
                  {(activeNode === "DEPARTURE" || activeNode === "DELIVERING") && <th>송장</th>}
                </tr>
              </thead>
              <tbody>
                {activeOrders.map((order) => {
                  const nodeInfo = ALL_NODES.find((n) => n.key === activeNode);
                  const isSelected = !!selectedOrders[order.id];
                  const addrDisplay = order.receiverAddr
                    ? order.receiverAddr.length > 20
                      ? order.receiverAddr.slice(0, 20) + "…"
                      : order.receiverAddr
                    : "-";
                  return (
                    <tr key={order.id} className={`hover:bg-gray-50 ${isSelected ? "bg-blue-50/50" : ""}`}>
                      <td className="w-10">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOrder(order.id)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="max-w-[280px]">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {order.productName || "-"}
                        </div>
                        <div className="text-[11px] font-mono text-gray-400 mt-0.5">#{order.orderNumber}</div>
                      </td>
                      <td className="text-right">
                        <div className="font-medium">{formatKRW(order.totalPrice)}원</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{order.quantity}개</div>
                      </td>
                      <td className="text-xs text-gray-600">{order.customerName || order.receiverName || "-"}</td>
                      <td className="text-xs text-gray-500 max-w-[160px]" title={order.receiverAddr || undefined}>
                        {addrDisplay}
                      </td>
                      <td className="text-xs text-gray-500">
                        {new Date(order.orderedAt).toLocaleDateString("ko-KR")}
                        <br />
                        <span className="text-gray-400">
                          {new Date(order.orderedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </td>
                      {(activeNode === "DEPARTURE" || activeNode === "DELIVERING") && (
                        <td className="text-xs text-gray-500">
                          {order.shippingCompany || "-"}
                          <br />
                          {order.trackingNumber || "-"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
