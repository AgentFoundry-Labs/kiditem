"use client";

import { useRef, type KeyboardEvent } from "react";
import { CollectionStartControl } from "@/components/collection/CollectionStartControl";
import { useCollectionSourceControl } from "@/hooks/use-collection-source-control";
import { cn } from "@/lib/utils";
import {
  adCampaignManualReportCollection,
  exactManualReportRange,
} from "../lib/ad-campaign-collection";
import type { ManualCampaignReportPeriod } from "@kiditem/shared/collection-start";

const PERIODS: ReadonlyArray<Readonly<{ value: ManualCampaignReportPeriod; label: string }>> = [
  { value: "1d", label: "1일" },
  { value: "7d", label: "7일" },
];

// A radio group's arrow keys check the previous or next choice, wrapping at either end.
const ARROW_STEPS: Readonly<Partial<Record<string, number>>> = {
  ArrowLeft: -1,
  ArrowUp: -1,
  ArrowRight: 1,
  ArrowDown: 1,
};

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
  const choices = useRef<Array<HTMLButtonElement | null>>([]);

  // The checked choice is the group's only tab stop; an arrow key checks and
  // focuses the neighbouring choice.
  function moveChoice(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = ARROW_STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const nextIndex = (index + step + PERIODS.length) % PERIODS.length;
    const next = PERIODS.at(nextIndex);
    if (!next) return;
    onPeriodChange(next.value);
    choices.current[nextIndex]?.focus();
  }

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
            {PERIODS.map((option, index) => (
              <button
                key={option.value}
                ref={(element) => {
                  choices.current[index] = element;
                }}
                type="button"
                role="radio"
                aria-checked={period === option.value}
                tabIndex={period === option.value ? 0 : -1}
                onClick={() => onPeriodChange(option.value)}
                onKeyDown={(event) => moveChoice(event, index)}
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
