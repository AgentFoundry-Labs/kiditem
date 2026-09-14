"use client";

import type { ManualCampaignReportPeriod } from "@kiditem/shared/collection-start";
import { CollectionStartControl } from "@/components/collection/CollectionStartControl";
import { useCollectionSourceControl } from "@/hooks/use-collection-source-control";
import { cn } from "@/lib/utils";
import {
  adCampaignManualReportCollection,
  exactManualReportRange,
} from "../lib/ad-campaign-collection";

const PERIODS: ReadonlyArray<Readonly<{ value: ManualCampaignReportPeriod; label: string }>> = [
  { value: "1d", label: "1일" },
  { value: "7d", label: "7일" },
];

/**
 * The manual campaign report control beside the report panel. It captures the
 * ad center's own report for exactly one day or seven days ending at the ad
 * data cutoff, chosen here rather than by the page period; its running state
 * is the account's live campaign attempt, a sweep or a manual report.
 */
export default function ManualCampaignReportControl({
  period,
  onPeriodChange,
  knownThrough,
}: {
  period: ManualCampaignReportPeriod;
  onPeriodChange: (period: ManualCampaignReportPeriod) => void;
  knownThrough: string | null | undefined;
}) {
  const control = useCollectionSourceControl(adCampaignManualReportCollection);
  const range = exactManualReportRange(period, knownThrough);

  return (
    <div
      className="flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3"
      style={{ background: "var(--surface-raised)", borderColor: "var(--border-subtle)" }}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            광고센터 원본 보고서
          </p>
          <div
            role="radiogroup"
            aria-label="원본 보고서 기간"
            className="flex rounded-md p-0.5"
            style={{ background: "var(--surface-sunken)" }}
          >
            {PERIODS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={period === option.value}
                onClick={() => onPeriodChange(option.value)}
                className={cn(
                  "rounded px-2.5 py-0.5 text-xs font-semibold transition-colors",
                  period === option.value
                    ? "bg-[var(--surface)] text-[var(--primary)] shadow-sm"
                    : "text-[var(--text-tertiary)]",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
          {range
            ? `${range.startDate} ~ ${range.endDate} 범위 그대로 받습니다.`
            : "광고 데이터 기준일까지의 범위로 받습니다."}
        </p>
      </div>
      <CollectionStartControl
        control={control}
        startLabel="원본 보고서 받기"
        startTitle="광고센터 캠페인 보고서를 고른 기간과 똑같은 범위로 받습니다."
        startBlockedReason={
          range ? null : "광고 데이터 기준일을 확인한 뒤 원본 보고서를 받을 수 있습니다."
        }
        onStart={() => {
          if (range) control.start(range);
        }}
        onStop={control.stop}
      />
    </div>
  );
}
