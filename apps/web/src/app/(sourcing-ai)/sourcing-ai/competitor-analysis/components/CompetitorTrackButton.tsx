import { Check, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function CompetitorTrackButton({
  productId,
  productName,
  tracked,
  tracking,
  trackingPending,
  onTrack,
}: {
  productId: string | null;
  productName: string;
  tracked: boolean;
  tracking: boolean;
  trackingPending: boolean;
  onTrack: () => void;
}) {
  const unavailable = !productId;
  const label = unavailable
    ? `${productName} 추적 불가`
    : tracked
      ? `${productName} 추적 중`
      : `${productName} 추적`;

  return (
    <button
      type="button"
      onClick={onTrack}
      disabled={unavailable || tracked || trackingPending}
      aria-label={label}
      title={
        unavailable
          ? "쿠팡 상품 ID가 없어 재수집 후 추적할 수 있습니다."
          : undefined
      }
      className={cn(
        "inline-flex h-8 min-w-[76px] items-center justify-center gap-1 rounded-lg border px-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed",
        tracked
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:border-[var(--border)] disabled:bg-[var(--surface-sunken)] disabled:text-[var(--text-tertiary)]",
      )}
    >
      {tracking ? (
        <Loader2 size={13} className="animate-spin" />
      ) : tracked ? (
        <Check size={13} />
      ) : (
        <Plus size={13} />
      )}
      {tracked ? "추적 중" : tracking ? "추가 중" : "추적"}
    </button>
  );
}
