"use client";

import { formatKRW, formatNumber, formatPercent } from "@/lib/utils";
import type { AdCampaignManualReport } from "@kiditem/shared/advertising";

type ReportRecord = Record<string, unknown>;
type MetricKind = "money" | "count" | "percent";

type NormalizedDisplayRow = {
  label: string;
  row: ReportRecord;
};

type NormalizedColumn = {
  label: string;
  keys: readonly string[];
  kind: MetricKind;
};

const NORMALIZED_COLUMNS: readonly NormalizedColumn[] = [
  { label: "광고비", keys: ["runningAdSpend", "spend", "adSpend"], kind: "money" },
  { label: "광고매출", keys: ["revenue", "adRevenue"], kind: "money" },
  { label: "노출", keys: ["impressions"], kind: "count" },
  { label: "클릭", keys: ["clicks"], kind: "count" },
  { label: "전환", keys: ["conversions", "orders"], kind: "count" },
  { label: "ROAS", keys: ["roas"], kind: "percent" },
  { label: "CTR", keys: ["ctr"], kind: "percent" },
  { label: "CVR", keys: ["conversionRate"], kind: "percent" },
];

function primitiveText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function exactValue(row: ReportRecord, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  return undefined;
}

function formatNormalizedValue(value: unknown, kind: MetricKind): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (kind === "money") return `${formatKRW(value)}원`;
    if (kind === "percent") return formatPercent(value);
    return formatNumber(value);
  }
  return primitiveText(value) ?? "-";
}

function normalizedRowLabel(row: ReportRecord, index: number): string {
  const campaign = primitiveText(exactValue(row, ["campaignName"]));
  const product = primitiveText(exactValue(row, ["productName"]));
  if (campaign && product && campaign !== product) return `${campaign} · ${product}`;
  return (
    product ||
    campaign ||
    primitiveText(exactValue(row, ["itemId", "vendorItemId", "externalId"])) ||
    `원본 행 ${index + 1}`
  );
}

function normalizedRows(report: AdCampaignManualReport): NormalizedDisplayRow[] {
  return report.payload.normalizedRows.map((record, index) => {
    const row = record as ReportRecord;
    return { label: normalizedRowLabel(row, index), row };
  });
}

function rawRows(report: AdCampaignManualReport): ReportRecord[] {
  return report.payload.data.map((record) => record as ReportRecord);
}

function rawColumns(rows: ReportRecord[]): string[] {
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (primitiveText(row[key]) !== null && !columns.includes(key)) columns.push(key);
    }
  }
  return columns;
}

function RawReportTable({ report }: { report: AdCampaignManualReport }) {
  const rows = rawRows(report);
  const columns = rawColumns(rows);
  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg px-3 py-4 text-xs"
        style={{ background: "var(--surface-sunken)", color: "var(--text-tertiary)" }}
        data-testid={`manual-report-empty-${report.attemptId}`}
      >
        광고센터에서 확인된 원본 행이 없습니다. 명시적 빈 결과로 보관했습니다.
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div
        className="rounded-lg px-3 py-4 text-xs"
        style={{ background: "var(--surface-sunken)", color: "var(--text-tertiary)" }}
        data-testid={`manual-report-table-${report.attemptId}`}
      >
        원본 행에 표시 가능한 primitive 값이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" data-testid={`manual-report-raw-table-${report.attemptId}`}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-tertiary)" }}>
            <th className="px-2 py-2 text-left font-semibold">원본 행</th>
            {columns.map((column) => (
              <th key={column} className="px-2 py-2 text-right font-semibold">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`raw:${index}`} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <td className="max-w-[260px] truncate px-2 py-2 font-medium" style={{ color: "var(--text-primary)" }}>
                원본 행 {index + 1}
              </td>
              {columns.map((column) => (
                <td key={column} className="px-2 py-2 text-right tabular-nums">{primitiveText(row[column]) ?? "-"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NormalizedReportTable({ report }: { report: AdCampaignManualReport }) {
  const rows = normalizedRows(report);
  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg px-3 py-4 text-xs"
        style={{ background: "var(--surface-sunken)", color: "var(--text-tertiary)" }}
        data-testid={`manual-report-empty-${report.attemptId}`}
      >
        광고센터에서 확인된 원본 행이 없습니다. 명시적 빈 결과로 보관했습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" data-testid={`manual-report-table-${report.attemptId}`}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-tertiary)" }}>
            <th className="px-2 py-2 text-left font-semibold">원본 행</th>
            {NORMALIZED_COLUMNS.map((column) => (
              <th key={column.label} className="px-2 py-2 text-right font-semibold">{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.label}:${index}`} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <td className="max-w-[260px] truncate px-2 py-2 font-medium" style={{ color: "var(--text-primary)" }}>
                {row.label}
              </td>
              {NORMALIZED_COLUMNS.map((column) => (
                <td key={column.label} className="px-2 py-2 text-right tabular-nums">
                  {formatNormalizedValue(exactValue(row.row, column.keys), column.kind)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ManualReportTable({ report }: { report: AdCampaignManualReport }) {
  return report.payload.normalizedRows.length > 0
    ? <NormalizedReportTable report={report} />
    : <RawReportTable report={report} />;
}

export default function ManualCampaignReportPanel({ reports }: { reports: AdCampaignManualReport[] }) {
  if (reports.length === 0) return null;

  return (
    <section
      className="space-y-3 rounded-2xl border p-4"
      style={{ background: "var(--surface-raised)", borderColor: "var(--border-subtle)" }}
      data-testid="manual-report-panel"
    >
      <div>
        <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
          쿠팡 광고센터 원본 보고서
        </h3>
        <p className="mt-1 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          표시 범위별 원본 행과 관측 지표입니다. 캠페인 일별 rollup과 별도로 표시하며 일별 사실로 분배하지 않습니다.
        </p>
      </div>

      {reports.map((report) => (
        <article
          key={`${report.attemptId}:${report.plan.channelAccountId}:${report.plan.startDate}:${report.plan.endDate}`}
          className="rounded-xl border p-3"
          style={{ background: "var(--card-bg)", borderColor: "var(--border-subtle)" }}
          data-testid={`manual-report-${report.attemptId}`}
        >
          <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h4 className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
              {report.payload.campaignName || "광고 보고서"}
            </h4>
            <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
              계정 {report.plan.channelAccountId} · 원본 범위 {report.plan.startDate} ~ {report.plan.endDate} · {report.plan.period}
            </span>
          </div>
          <p
            className="mb-2 truncate text-[10px]"
            style={{ color: "var(--text-tertiary)" }}
            title={report.plan.targetUrl}
          >
            페이지 {report.plan.targetUrl}
          </p>
          <ManualReportTable report={report} />
        </article>
      ))}
    </section>
  );
}
