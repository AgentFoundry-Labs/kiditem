import { LayoutGrid, Sparkles, KeyRound, Megaphone, Package } from "lucide-react";

export type TabKey = "status" | "strategy" | "campaign" | "products" | "keywords";

export const TABS: { key: TabKey; label: string; icon: typeof LayoutGrid }[] = [
  { key: "status", label: "분석", icon: LayoutGrid },
  { key: "strategy", label: "전략", icon: Sparkles },
  { key: "campaign", label: "캠페인", icon: Megaphone },
  { key: "products", label: "광고상품", icon: Package },
  { key: "keywords", label: "키워드", icon: KeyRound },
];
