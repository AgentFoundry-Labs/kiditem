"use client";

import { Megaphone, AlertTriangle } from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { formatKRW } from "@/lib/utils";
import type { AdWeeklyPlan, AdTrendsData, AdCampaignSnapshot } from "@kiditem/shared";
import type { CampaignProductData } from "../hooks/useAdOpsData";
import AdSidePanel from "./AdSidePanel";

type RuleItem = { name: string; grade: string | null; rule: string; action: string; priority: string; roas: number; spend: number };

interface StatusContentProps {
  rules: RuleItem[];
  strategy: AdWeeklyPlan | null;
  trends: AdTrendsData | null;
  wingKpis: Record<string, string | { value: string; change?: string; numValue?: number }>;
  orderedCampaigns: AdCampaignSnapshot[];
  selectedCampaign: string | null;
  camp: AdCampaignSnapshot | undefined;
  pagedProducts: CampaignProductData[];
  products: CampaignProductData[];
  prodPage: number;
  prodPageSize: number;
  totalPages: number;
  period: string;
  onSelectCampaign: (name: string) => void;
  onClearCampaign: () => void;
  onSetProdPage: (updater: (p: number) => number) => void;
  onDragStart: (idx: number) => void;
  onDragOver: (e: React.DragEvent, idx: number) => void;
  onDragEnd: () => void;
}

export default function StatusContent({
  rules,
  strategy,
  trends,
  wingKpis,
  orderedCampaigns,
  selectedCampaign,
  camp,
  pagedProducts,
  products,
  prodPage,
  prodPageSize,
  totalPages,
  onSelectCampaign,
  onClearCampaign,
  onSetProdPage,
}: StatusContentProps) {
  return (
    <div className="space-y-5">
      {/* 차트 + 할일/알림 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3" style={{ height: 520 }}>
        {/* 왼쪽 3칸: 광고비 · 전환매출 · ROAS 통합 차트 */}
        <div className="lg:col-span-3 rounded-2xl flex flex-col overflow-hidden h-full" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center justify-between px-5 pt-4 pb-0">
            <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>광고비 · 전환매출 · ROAS</h3>
            <div className="flex items-center gap-5 text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }}>
              <span className="flex items-center gap-1.5"><span className="w-2 h-[10px] rounded-[3px]" style={{ background: "#d1d6db" }} />광고비</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-[10px] rounded-[3px]" style={{ background: "#3182f6" }} />전환매출</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ border: "2px solid #00c471" }} />ROAS</span>
              <span className="flex items-center gap-1.5"><span className="w-3.5 h-[1.5px] inline-block rounded-full" style={{ background: "#f04452", opacity: 0.5 }} />손익분기</span>
            </div>
          </div>
          <div className="flex-1 p-4" style={{ minHeight: 280 }}>
            {trends?.daily && trends.daily.length > 0 ? (() => {
              const maxRoas = Math.max(...trends.daily.map((d) => d.roas || 0), 1);
              const chartData = trends.daily.map((d) => ({ ...d }));
              return (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="35%">
                    <defs>
                      <linearGradient id="barSpendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#d1d6db" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#e8ebed" stopOpacity={0.5} />
                      </linearGradient>
                      <linearGradient id="barRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3182f6" stopOpacity={0.85} />
                        <stop offset="100%" stopColor="#3182f6" stopOpacity={0.45} />
                      </linearGradient>
                      <filter id="barShadow" x="-10%" y="-10%" width="120%" height="130%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#3182f6" floodOpacity="0.15" />
                      </filter>
                    </defs>
                    <CartesianGrid strokeDasharray="0" stroke="var(--border-subtle)" strokeOpacity={0.3} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-quaternary)", fontWeight: 500 }} tickLine={false} axisLine={false} dy={8} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "var(--text-quaternary)" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => v >= 10000 ? `${Math.round(v / 10000)}만` : v >= 1000 ? `${Math.round(v / 1000)}천` : String(v)} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "var(--text-quaternary)" }} tickLine={false} axisLine={false} width={42} domain={[0, Math.ceil(maxRoas / 100) * 100 + 100]} tickFormatter={(v: number) => `${v}%`} />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <Tooltip cursor={{ fill: "var(--primary-subtle)", radius: 8 }} content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null;
                      const roasEntry = payload.find((p: { dataKey: string }) => p.dataKey === "roas");
                      const roasVal = roasEntry ? Math.round(roasEntry.value) : 0;
                      const isLow = roasVal < 300;
                      return (
                        <div style={{ background: "rgba(255,255,255,0.96)", backdropFilter: "blur(16px)", color: "var(--text-primary)", borderRadius: 16, padding: "14px 18px", fontSize: 12, fontWeight: 600, boxShadow: "0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.03)" }}>
                          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 10, fontWeight: 500 }}>{label}일</div>
                          {payload.map((p: { dataKey: string; value: number; color: string }) => {
                            if (p.dataKey === "breakeven") return null;
                            const isRoas = p.dataKey === "roas";
                            const nameMap: Record<string, string> = { spend: "광고비", revenue: "전환매출", roas: "ROAS" };
                            const colorMap: Record<string, string> = { spend: "#b0b8c1", revenue: "#3182f6", roas: isLow ? "#f04452" : "#00c471" };
                            return (
                              <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                                <span style={{ width: 7, height: 7, borderRadius: isRoas ? "50%" : 2, background: colorMap[p.dataKey] || p.color, flexShrink: 0 }} />
                                <span style={{ color: "var(--text-tertiary)", minWidth: 52, fontWeight: 500 }}>{nameMap[p.dataKey] || p.dataKey}</span>
                                <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: isRoas && isLow ? "#f04452" : "var(--text-primary)" }}>{isRoas ? `${p.value}%` : `${formatKRW(Number(p.value))}원`}</span>
                              </div>
                            );
                          })}
                          {isLow && <div style={{ fontSize: 10, color: "#f04452", marginTop: 6, fontWeight: 500 }}>손익분기(300%) 미달</div>}
                        </div>
                      );
                    }} />
                    <Bar yAxisId="left" dataKey="spend" fill="url(#barSpendGrad)" radius={[6, 6, 6, 6]} maxBarSize={18} />
                    <Bar yAxisId="left" dataKey="revenue" fill="url(#barRevenueGrad)" radius={[6, 6, 6, 6]} maxBarSize={18} filter="url(#barShadow)" />
                    <Line yAxisId="right" type="monotone" dataKey="roas" stroke="#00c471" strokeWidth={2.5} dot={{ r: 3, fill: "#fff", stroke: "#00c471", strokeWidth: 2 }} activeDot={{ r: 5.5, fill: "#00c471", stroke: "#fff", strokeWidth: 3 }} />
                    <Line yAxisId="right" type="monotone" dataKey={() => 300} stroke="#f04452" strokeWidth={1} strokeDasharray="6 4" strokeOpacity={0.4} dot={false} name="breakeven" />
                  </ComposedChart>
                </ResponsiveContainer>
              );
            })() : (
              <div className="h-full flex items-center justify-center">
                <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>차트 데이터 수집 중...</span>
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽 1칸: 할일 + 알림 */}
        <AdSidePanel rules={rules} strategy={strategy} />
      </div>

      {/* 아이템위너 · 노출 현황 */}
      {Object.keys(wingKpis).length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} style={{ color: "var(--warning)" }} />
            <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>아이템위너 · 노출 현황</h2>
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>아이템위너 미보유 시 광고 전환율 급감</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {Object.entries(wingKpis).map(([label, raw]) => {
              const isObj = raw && typeof raw === "object";
              const display = isObj ? String((raw as { value?: string; numValue?: number }).value ?? (raw as { numValue?: number }).numValue ?? "") : String(raw);
              const numeric = isObj ? Number((raw as { numValue?: number }).numValue ?? 0) : parseInt(String(raw)) || 0;
              const isWarning = label.includes("노출제한") || label.includes("아이템위너 아닌") || label.includes("미보유");
              const hasIssue = isWarning && numeric > 0;
              return (
                <div key={label} className="rounded-xl p-4 text-center" style={{ background: hasIssue ? "var(--danger-subtle)" : "var(--surface-sunken)", border: hasIssue ? "1px solid var(--danger)" : "1px solid var(--border-subtle)" }}>
                  <div className="text-2xl font-extrabold tabular-nums" style={{ color: hasIssue ? "var(--danger)" : "var(--text-primary)" }}>{display}</div>
                  <div className="text-xs mt-1 font-medium" style={{ color: hasIssue ? "var(--danger)" : "var(--text-secondary)" }}>{label}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 캠페인 리스트 */}
      {orderedCampaigns.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center gap-2">
              <Megaphone size={15} style={{ color: "var(--primary)" }} />
              <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>캠페인</h3>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--primary-subtle)", color: "var(--primary)" }}>{orderedCampaigns.length}개</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[11px] font-semibold uppercase" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}>
                  <th className="text-left px-5 py-2.5">캠페인명</th>
                  <th className="text-right px-4 py-2.5">광고비</th>
                  <th className="text-right px-4 py-2.5">전환매출</th>
                  <th className="text-right px-4 py-2.5">ROAS</th>
                  <th className="text-right px-4 py-2.5">클릭</th>
                  <th className="text-right px-4 py-2.5">CTR</th>
                </tr>
              </thead>
              <tbody>
                {orderedCampaigns.map((c) => {
                  const roasVal = Math.max(0, c.roas ?? 0);
                  const isEmpty = c.adSpend === 0 && c.adRevenue === 0;
                  return (
                    <tr key={c.campaignName} onClick={() => { onSelectCampaign(c.campaignName); }}
                      className="cursor-pointer transition-colors" style={{ borderBottom: "1px solid var(--border-subtle)", opacity: isEmpty ? 0.45 : 1 }}>
                      <td className="px-5 py-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{c.campaignName}</td>
                      <td className="text-right px-4 py-3 text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>{formatKRW(c.adSpend)}원</td>
                      <td className="text-right px-4 py-3 text-sm font-semibold tabular-nums" style={{ color: c.adRevenue > 0 ? "#059669" : "var(--text-quaternary)" }}>{formatKRW(c.adRevenue)}원</td>
                      <td className="text-right px-4 py-3 text-sm font-bold tabular-nums" style={{ color: roasVal >= 300 ? "#059669" : roasVal >= 100 ? "#f59e0b" : roasVal > 0 ? "#dc2626" : "var(--text-quaternary)" }}>{roasVal > 0 ? `${Math.round(roasVal)}%` : "-"}</td>
                      <td className="text-right px-4 py-3 text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>{c.clicks.toLocaleString()}</td>
                      <td className="text-right px-4 py-3 text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>{(c.ctr ?? 0) > 0 ? `${c.ctr}%` : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 캠페인 상세 — 상품 리스트 */}
      {selectedCampaign && camp && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>캠페인</span>
              <span className="text-sm font-bold" style={{ color: "var(--primary)" }}>{selectedCampaign}</span>
            </div>
            <button onClick={onClearCampaign} className="text-xs px-2 py-1 rounded-lg" style={{ color: "var(--text-tertiary)" }}>닫기</button>
          </div>
          <div className="grid grid-cols-6 gap-3 px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            {[
              { label: "광고비", value: formatKRW(camp.adSpend) + "원" },
              { label: "전환매출", value: formatKRW(camp.adRevenue) + "원" },
              { label: "노출", value: camp.impressions.toLocaleString() },
              { label: "클릭", value: camp.clicks.toLocaleString() },
              { label: "ROAS", value: Math.round(camp.roas ?? 0) + "%" },
              { label: "전환율", value: (camp.conversionRate ?? 0) + "%" },
            ].map(k => (
              <div key={k.label} className="rounded-lg p-2" style={{ background: "var(--surface-sunken)" }}>
                <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{k.label}</div>
                <div className="text-base font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{k.value}</div>
              </div>
            ))}
          </div>
          {products.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}>
                    <th className="text-left px-4 py-2.5 w-[60px]">상태</th>
                    <th className="text-left px-4 py-2.5">상품명</th>
                    <th className="text-right px-3 py-2.5">광고비</th>
                    <th className="text-right px-3 py-2.5">전환매출</th>
                    <th className="text-right px-3 py-2.5">클릭</th>
                    <th className="text-right px-3 py-2.5">CTR</th>
                    <th className="text-right px-3 py-2.5">전환수</th>
                    <th className="text-right px-3 py-2.5">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedProducts.map((p, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td className="px-4 py-2.5"><span className="inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ background: p.onOff === "ON" ? "#059669" : "var(--text-quaternary)", color: "#fff" }}>{p.onOff || "OFF"}</span></td>
                      <td className="px-4 py-2.5 text-sm font-medium truncate max-w-[300px]" style={{ color: "var(--text-primary)" }}>{p.productName.replace(/\s*ID\s*:\s*\d+/, "").trim()}</td>
                      <td className="text-right px-3 py-2.5 text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>{formatKRW(p.adSpend)}원</td>
                      <td className="text-right px-3 py-2.5 text-sm tabular-nums font-medium" style={{ color: p.adRevenue > 0 ? "#059669" : "var(--text-quaternary)" }}>{p.adRevenue > 0 ? formatKRW(p.adRevenue) + "원" : "0원"}</td>
                      <td className="text-right px-3 py-2.5 text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>{p.clicks.toLocaleString()}</td>
                      <td className="text-right px-3 py-2.5 text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>{(p.ctr ?? 0) > 0 ? p.ctr + "%" : "-"}</td>
                      <td className="text-right px-3 py-2.5 text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>{p.adConversions}건</td>
                      <td className="text-right px-3 py-2.5 text-sm font-bold tabular-nums" style={{ color: (p.roas ?? 0) >= 300 ? "#059669" : (p.roas ?? 0) >= 100 ? "#f59e0b" : "var(--text-tertiary)" }}>{p.roas ?? 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {products.length > prodPageSize && (
            <div className="flex items-center justify-between px-5 py-2.5 text-xs" style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--surface-sunken)" }}>
              <span style={{ color: "var(--text-secondary)" }}>{products.length}개 중 {(prodPage-1)*prodPageSize+1}~{Math.min(prodPage*prodPageSize, products.length)}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => onSetProdPage(p => Math.max(1, p-1))} disabled={prodPage<=1} className="px-2.5 py-1 rounded-lg disabled:opacity-30" style={{ border: "1px solid var(--border-subtle)" }}>◀</button>
                <span>{prodPage}/{totalPages}</span>
                <button onClick={() => onSetProdPage(p => Math.min(totalPages, p+1))} disabled={prodPage>=totalPages} className="px-2.5 py-1 rounded-lg disabled:opacity-30" style={{ border: "1px solid var(--border-subtle)" }}>▶</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
