import { LayoutGrid, Sparkles, Eye, Megaphone } from "lucide-react";

export type TabKey = "status" | "strategy" | "campaign" | "exposure";

export const TABS: { key: TabKey; label: string; icon: typeof LayoutGrid }[] = [
  { key: "status", label: "분석", icon: LayoutGrid },
  { key: "strategy", label: "전략", icon: Sparkles },
  { key: "campaign", label: "캠페인", icon: Megaphone },
  { key: "exposure", label: "상위노출", icon: Eye },
];

export const BENCH_STATUS: Record<string, { bg: string; text: string; label: string; dot: string; cardBg: string; cardBorder: string }> = {
  excellent: { bg: "bg-emerald-50", text: "text-emerald-700", label: "최우수", dot: "bg-emerald-500", cardBg: "bg-emerald-50/60", cardBorder: "border-emerald-300" },
  good: { bg: "bg-blue-50", text: "text-blue-700", label: "우수", dot: "bg-blue-500", cardBg: "bg-blue-50/60", cardBorder: "border-blue-300" },
  average: { bg: "bg-yellow-50", text: "text-yellow-700", label: "평균", dot: "bg-yellow-500", cardBg: "bg-amber-50/40", cardBorder: "border-amber-300" },
  below: { bg: "bg-orange-50", text: "text-orange-700", label: "미달", dot: "bg-orange-500", cardBg: "bg-orange-50/60", cardBorder: "border-orange-300" },
  poor: { bg: "bg-red-50", text: "text-red-700", label: "위험", dot: "bg-red-500", cardBg: "bg-red-50/60", cardBorder: "border-red-300" },
};
