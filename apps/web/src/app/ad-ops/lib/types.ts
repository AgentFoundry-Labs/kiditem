import { LayoutGrid, Sparkles, Eye, Megaphone, Package } from "lucide-react";

export type TabKey = "status" | "strategy" | "campaign" | "products" | "exposure";

export const TABS: { key: TabKey; label: string; icon: typeof LayoutGrid }[] = [
  { key: "status", label: "분석", icon: LayoutGrid },
  { key: "strategy", label: "전략", icon: Sparkles },
  { key: "campaign", label: "캠페인", icon: Megaphone },
  { key: "products", label: "광고상품", icon: Package },
  { key: "exposure", label: "상위노출", icon: Eye },
];
