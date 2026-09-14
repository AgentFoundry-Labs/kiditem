"use client";

import { CollectionStartControl } from "@/components/collection/CollectionStartControl";
import { useCollectionSourceControl } from "@/hooks/use-collection-source-control";
import {
  adCampaignManualReportCollection,
  exactManualReportRange,
  manualReportRangeBlockedReason,
} from "../lib/ad-campaign-collection";

/**
 * The manual campaign report control beside the report panel. It captures the
 * ad center's own report for exactly the displayed range; its running state is
 * the account's live campaign attempt, a sweep or a manual report.
 */
export default function ManualCampaignReportControl({
  period,
  knownThrough,
}: {
  period: string;
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
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          광고센터 원본 보고서
        </p>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
          {range
            ? `${range.startDate} ~ ${range.endDate} 범위 그대로 받습니다.`
            : "표시 중인 기간과 같은 범위로 받습니다."}
        </p>
      </div>
      <CollectionStartControl
        control={control}
        startLabel="원본 보고서 받기"
        startTitle="광고센터 캠페인 보고서를 표시 중인 기간과 똑같은 범위로 받습니다."
        startBlockedReason={manualReportRangeBlockedReason(period, knownThrough)}
        onStart={() => {
          if (range) control.start(range);
        }}
        onStop={control.stop}
      />
    </div>
  );
}
