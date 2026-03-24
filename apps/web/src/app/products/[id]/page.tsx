"use client";

import { API_BASE } from "@/lib/api";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useCallback, useRef } from "react";
import {
  ArrowLeft,
  Package,
  TrendingUp,
  BarChart3,
  Star,
  Box,
  ExternalLink,
  Activity,
  Play,
  ChevronDown,
  Loader2,
  CheckCircle2,
  XCircle,
  X,
} from "lucide-react";
import {
  formatKRW,
  formatPercent,
  getGradeColor,
  getProfitColor,
  getProductStatusBadge,
  timeAgo,
} from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  description: string;
  status: string;
  category: string | null;
  companyId: string;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  sourcePlatform: string | null;
  costCny: number | null;
  marginRate: number | null;
  sellPrice: number | null;
  commissionRate: number | null;
  shippingCost: number | null;
  abcGrade: string | null;
  adTier: string | null;
  coupangProductId: string | null;
  detailPageUrl: string | null;
  createdAt: string;
}

interface InventoryData {
  currentStock: number;
  reservedStock: number;
  safetyStock: number;
  reorderPoint: number;
  dailySalesAvg: number;
  leadTimeDays: number | null;
}

interface ActivityEvent {
  id: string;
  eventType: string;
  source: string;
  title: string;
  data: Record<string, any> | null;
  createdAt: string;
}

interface Workflow {
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

  const [product, setProduct] = useState<Product | null>(null);
  const [inventory, setInventory] = useState<InventoryData | null>(null);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [showWfMenu, setShowWfMenu] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "loading" | "success" | "error";
    actions?: { type: string; label: string; reason?: string; params?: Record<string, any> }[];
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!productId) return;

    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/api/products/${productId}`).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch(`${API_BASE}/api/inventory?productId=${productId}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([prod, inv]) => {
        if (!prod) {
          setError("상품을 찾을 수 없습니다.");
          return;
        }
        setProduct(prod);
        if (Array.isArray(inv) && inv.length > 0) {
          setInventory(inv[0]);
        } else if (inv && !Array.isArray(inv)) {
          setInventory(inv);
        }
        loadActivities(productId, prod.companyId);
      })
      .catch(() => setError("데이터를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [productId]);

  useEffect(() => {
    fetch(`${API_BASE}/api/workflows?isActive=true`)
      .then((r) => (r.ok ? r.json() : []))
      .then((wfs) => setWorkflows(Array.isArray(wfs) ? wfs : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const loadActivities = useCallback((pid: string, companyId: string) => {
    Promise.all([
      fetch(`${API_BASE}/api/activity-events?objectType=product&objectId=${pid}&eventType=workflow_analysis`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`${API_BASE}/api/activity-events?objectType=company&objectId=${companyId}&eventType=workflow_analysis&limit=10`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([productEvents, companyEvents]) => {
      const all = [...(productEvents || []), ...(companyEvents || [])];
      all.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setActivities(all);
    }).catch(() => {});
  }, []);

  const refreshActivities = useCallback(() => {
    if (product) {
      loadActivities(productId, product.companyId);
    }
  }, [productId, product, loadActivities]);

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
      const res = await fetch(`${API_BASE}/api/workflows/${wf.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: { productId } }),
      });
      if (!res.ok) throw new Error("실행 실패");
      const run = await res.json();

      showToast(`${wf.name} 완료, AI 분석 중...`, "loading");

      pollRef.current = setInterval(async () => {
        const companyId = product?.companyId;
        if (!companyId) return;
        const eventsRes = await fetch(
          `${API_BASE}/api/activity-events?objectType=product&objectId=${productId}&eventType=workflow_analysis&limit=1`
        );
        if (!eventsRes.ok) return;
        const events = await eventsRes.json();
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

        const r = await fetch(`${API_BASE}/api/workflow-runs/${run.id}`);
        if (!r.ok) return;
        const detail: WorkflowRunStatus = await r.json();

        if (detail.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          showToast(detail.error ?? `${wf.name} 실패`, "error", { duration: 5000 });
          refreshActivities();
        }
      }, 1500);
    } catch {
      showToast("워크플로우 실행에 실패했습니다.", "error", { duration: 5000 });
    }
  };

  const runBatchWorkflows = async () => {
    setShowWfMenu(false);
    showToast("전체 종합 점검 실행 중...", "loading");

    try {
      const res = await fetch(`${API_BASE}/api/workflows/batch-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowIds: workflows.map((w) => w.id), context: { productId } }),
      });
      if (!res.ok) throw new Error("배치 실행 실패");
      const runs = await res.json();

      const checkAll = async () => {
        const details = await Promise.all(
          (runs as any[]).map((r: any) =>
            fetch(`${API_BASE}/api/workflow-runs/${r.id}`).then((res) => res.ok ? res.json() : null)
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
        const eventsRes = await fetch(
          `${API_BASE}/api/activity-events?objectType=company&objectId=${companyId}&eventType=workflow_analysis&limit=1`
        );
        if (!eventsRes.ok) return;
        const events = await eventsRes.json();
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
    } catch {
      showToast("전체 종합 점검 실패", "error", { duration: 5000 });
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
      fetch(`${API_BASE}/api/products/${params.productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          type === 'product.adjust_price' ? { sellPrice: params.newPrice } :
          type === 'product.stop_ads' ? { adTier: null } :
          type === 'product.discontinue' ? { status: 'discontinued' } :
          type === 'product.change_grade' ? { abcGrade: params.grade } :
          {}
        ),
      }).then((r) => {
        if (r.ok) {
          showToast(`${action.label} 완료`, "success", { duration: 3000 });
          refreshActivities();
        } else {
          showToast(`${action.label} 실패`, "error", { duration: 5000 });
        }
      });
    } else if (type === 'inventory.create_purchase_order') {
      window.location.href = `/purchase-orders/new?productId=${params.productId}&quantity=${params.quantity ?? ''}`;
    } else if (type === 'report.export_excel') {
      showToast("엑셀 다운로드 준비 중...", "loading");
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        로딩 중...
      </div>
    );
  if (error || !product)
    return (
      <div className="flex items-center justify-center h-64 text-red-500">
        {error ?? "상품을 찾을 수 없습니다."}
      </div>
    );

  const badge = getProductStatusBadge(product.status);
  const daysOfStock =
    inventory && inventory.dailySalesAvg > 0
      ? Math.floor(inventory.currentStock / inventory.dailySalesAvg)
      : null;
  const needsReorder =
    inventory && inventory.currentStock <= inventory.reorderPoint;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/products"
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft size={16} /> 상품 관리
        </Link>
        <div className="relative flex gap-2">
          <button
            onClick={() => setShowWfMenu((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            <Play size={14} /> 워크플로우 실행 <ChevronDown size={14} />
          </button>
          {showWfMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowWfMenu(false)} />
              <div className="absolute right-0 top-10 z-20 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[200px]">
              {workflows.length === 0 ? (
                <p className="px-3 py-2 text-sm text-slate-400">활성 워크플로우 없음</p>
              ) : (
                <>
                  {workflows.length > 1 && (
                    <button
                      onClick={() => runBatchWorkflows()}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2 border-b border-slate-100 font-medium text-blue-700"
                    >
                      <BarChart3 size={12} /> 전체 종합 점검
                    </button>
                  )}
                  {workflows.map((wf) => (
                    <button
                      key={wf.id}
                      onClick={() => runWorkflow(wf)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Play size={12} className="text-blue-500" />
                      {wf.name}
                    </button>
                  ))
                }
                </>
              )}
              </div>
            </>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed top-4 right-4 z-50 max-w-sm">
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium ${
            toast.type === "loading" ? "bg-blue-600 text-white" :
            toast.type === "success" ? "bg-green-600 text-white" :
            "bg-red-600 text-white"
          } ${!toast.actions?.length ? "rounded-b-lg" : ""}`}>
            {toast.type === "loading" && <Loader2 size={14} className="animate-spin" />}
            {toast.type === "success" && <CheckCircle2 size={14} />}
            {toast.type === "error" && <XCircle size={14} />}
            {toast.message}
            <button onClick={() => setToast(null)} className="ml-auto opacity-70 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
          {toast.actions && toast.actions.length > 0 && (
            <div className="bg-white border border-t-0 border-slate-200 rounded-b-lg shadow-lg p-2 space-y-1">
              <p className="text-xs text-slate-400 px-2 pt-1">다음 액션</p>
              {toast.actions.map((action, i) => (
                <button
                  key={i}
                  onClick={() => { setToast(null); handleAction(action); }}
                  className="w-full text-left px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 rounded flex items-center gap-1.5"
                >
                  <Play size={12} className="text-blue-500" />
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          {product.abcGrade && (
            <span
              className={`px-2.5 py-1 rounded text-sm font-bold ${getGradeColor(product.abcGrade)}`}
            >
              {product.abcGrade}
            </span>
          )}
          <h1 className="text-xl font-bold text-slate-900">{product.name}</h1>
          <span className={`ml-auto px-2.5 py-1 rounded text-xs font-medium ${badge.color}`}>
            {badge.label}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <MetricCard
            label="판매가"
            value={product.sellPrice ? `₩${formatKRW(product.sellPrice)}` : "-"}
            icon={<Package size={16} className="text-blue-500" />}
          />
          <MetricCard
            label="매입가"
            value={product.costCny ? `¥${product.costCny}` : "-"}
            icon={<TrendingUp size={16} className="text-green-500" />}
          />
          <MetricCard
            label="이익률"
            value={
              product.marginRate != null
                ? formatPercent(Number(product.marginRate) * 100)
                : "-"
            }
            icon={<BarChart3 size={16} className="text-purple-500" />}
            valueColor={
              product.marginRate != null
                ? getProfitColor(Number(product.marginRate) * 100)
                : ""
            }
          />
          <MetricCard
            label="수수료율"
            value={
              product.commissionRate != null
                ? formatPercent(Number(product.commissionRate) * 100)
                : "-"
            }
            icon={<Star size={16} className="text-amber-500" />}
          />
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 space-y-6 min-w-0">
          <InfoCard title="상품 정보" icon={<Package size={16} />}>
            <InfoRow label="카테고리" value={product.category ?? "-"} />
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

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Activity size={16} className="text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-700">분석 기록</h3>
            </div>
            {activities.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm text-slate-400">워크플로우를 실행하면 분석 결과가 여기에 표시됩니다.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activities.map((event) => (
                  <div key={event.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-green-500" />
                        <span className="text-xs font-medium text-slate-600">
                          {timeAgo(event.createdAt)}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">{event.source}</span>
                    </div>
                    <div className="p-4 space-y-3">
                      <p className="text-sm text-slate-800">{event.title}</p>

                      {event.data?.steps && Array.isArray(event.data.steps) && event.data.steps.length > 0 && (
                        <div className="space-y-1">
                          {event.data.steps.map((step: any, si: number) => (
                            <div key={si} className="flex items-center gap-2 text-xs text-slate-500">
                              <CheckCircle2 size={10} className="text-green-400" />
                              <span>{step.label ?? step.workflow}</span>
                              {typeof step.count === 'number' && (
                                <span className="text-slate-400">
                                  {step.count}건{typeof step.filteredOut === 'number' ? ` (제외 ${step.filteredOut}건)` : ''}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {event.data?.actions && Array.isArray(event.data.actions) && event.data.actions.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 space-y-1.5">
                          <p className="text-xs text-slate-400 font-medium">추천 액션</p>
                          {event.data.actions.map((action: any, ai: number) => (
                            <button
                              key={ai}
                              onClick={() => handleAction(action)}
                              className="w-full text-left flex items-start gap-2 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-blue-300"
                            >
                              <span className="flex-shrink-0 mt-0.5">
                                {action.type?.startsWith('workflow.') && <Play size={11} className="text-blue-500" />}
                                {action.type?.startsWith('product.') && <Package size={11} className="text-amber-500" />}
                                {action.type?.startsWith('inventory.') && <Box size={11} className="text-purple-500" />}
                                {action.type?.startsWith('alert.') && <Activity size={11} className="text-red-500" />}
                              </span>
                              <div>
                                <span className="font-medium">{action.label}</span>
                                {action.reason && (
                                  <p className="text-slate-400 mt-0.5">{action.reason}</p>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="w-72 flex-shrink-0 space-y-6">
          <InfoCard title="속성">
            <InfoRow label="상태" value={<span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.color}`}>{badge.label}</span>} />
            <InfoRow label="ABC등급" value={product.abcGrade ? <span className={`px-2 py-0.5 rounded text-xs font-bold ${getGradeColor(product.abcGrade)}`}>{product.abcGrade}</span> : "-"} />
            <InfoRow label="광고 티어" value={product.adTier ?? "-"} />
            <InfoRow label="수수료율" value={product.commissionRate != null ? formatPercent(Number(product.commissionRate) * 100) : "-"} />
            <InfoRow label="배송비" value={product.shippingCost ? `₩${formatKRW(product.shippingCost)}` : "-"} />
          </InfoCard>

          <InfoCard title="링크">
            {product.sourceUrl && (
              <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline py-1">
                <ExternalLink size={13} /> 소싱 URL
              </a>
            )}
            {product.detailPageUrl && (
              <a href={product.detailPageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline py-1">
                <ExternalLink size={13} /> 상세페이지
              </a>
            )}
            {product.coupangProductId && (
              <a href={`https://www.coupang.com/vp/products/${product.coupangProductId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline py-1">
                <ExternalLink size={13} /> 쿠팡 리스팅
              </a>
            )}
            {!product.sourceUrl && !product.detailPageUrl && !product.coupangProductId && (
              <p className="text-sm text-slate-400">등록된 링크 없음</p>
            )}
          </InfoCard>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  valueColor,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  valueColor?: string;
}) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p className={`text-lg font-semibold ${valueColor || "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

function InfoCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-slate-500">{icon}</span>}
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900">{value}</span>
    </div>
  );
}
