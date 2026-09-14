"use client";

/**
 * 쿠팡 광고센터 `성과 그래프` 형식의 2축 라인 차트.
 *
 * - 좌축/우축에 각각 지표를 하나씩 올리고 드롭다운으로 교체한다.
 * - X축은 `07/01(수)` 처럼 요일까지 붙인다.
 * - 각 포인트는 사각 마커.
 *
 * 데이터는 `/api/ads/campaigns/trends` 의 응답을 그대로 쓴다. 서버는 요청
 * 기간의 모든 날짜를 캠페인 순회 기준으로 주고, 측정하지 않은 날은 null
 * 포인트로 남겨 선이 끊기게 한다. 0으로 채우거나 X축에서 빼지 않는다.
 */

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, ChevronUp, Download } from "lucide-react";
import { formatKRW, formatNumber, formatPercent } from "@/lib/utils";
import { exportTrendXlsx } from "../lib/xlsx-export";
import { adTrendsSourceLabel } from "../lib/trends-source";
import type { AdTrendsData } from "@kiditem/shared/advertising";

type MetricKey =
  | "spend"
  | "revenue"
  | "impressions"
  | "clicks"
  | "conversions"
  | "roas"
  | "ctr"
  | "cvr";

interface MetricConfig {
  key: MetricKey;
  label: string;
  format: (value: number) => string;
  /** 축 눈금은 좁으므로 만 단위로 접는다. */
  axis: (value: number) => string;
}

const WON = (value: number) => `${formatKRW(value)}원`;
const COMPACT_WON = (value: number) =>
  Math.abs(value) >= 10000 ? `${Math.round(value / 10000)}만` : formatKRW(value);
const COMPACT_COUNT = (value: number) =>
  Math.abs(value) >= 10000 ? `${Math.round(value / 10000)}만` : formatNumber(value);

const METRICS: MetricConfig[] = [
  { key: "spend", label: "집행 광고비", format: WON, axis: COMPACT_WON },
  { key: "revenue", label: "광고 전환 매출", format: WON, axis: COMPACT_WON },
  { key: "impressions", label: "노출수", format: formatNumber, axis: COMPACT_COUNT },
  { key: "clicks", label: "클릭수", format: formatNumber, axis: COMPACT_COUNT },
  { key: "conversions", label: "전환수", format: formatNumber, axis: COMPACT_COUNT },
  { key: "roas", label: "광고 수익률(ROAS)", format: formatPercent, axis: (v) => `${Math.round(v)}%` },
  { key: "ctr", label: "클릭률(CTR)", format: formatPercent, axis: (v) => `${v.toFixed(1)}%` },
  { key: "cvr", label: "전환율(CVR)", format: formatPercent, axis: (v) => `${v.toFixed(1)}%` },
];

const METRIC_BY_KEY = new Map(METRICS.map((metric) => [metric.key, metric]));

const LEFT_COLOR = "#3182f6";
const RIGHT_COLOR = "#00c471";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** `2026-07-01` → `07/01(수)`. Intl 없이 순수 문자열/Date 연산만 쓴다. */
export function toAxisLabel(businessDate: string): string {
  const [year, month, day] = businessDate.split("-").map(Number);
  if (!year || !month || !day) return businessDate;
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${mm}/${dd}(${weekday})`;
}

/** 사각 마커 — 쿠팡 광고센터 성과 그래프와 같은 모양. */
function SquareDot({
  cx,
  cy,
  fill,
}: {
  cx?: number;
  cy?: number;
  fill: string;
}) {
  // An unmeasured date has no y position; recharts leaves the gap.
  if (cx == null || cy == null) return null;
  const size = 7;
  return (
    <rect
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
      fill={fill}
      stroke="#ffffff"
      strokeWidth={1.5}
    />
  );
}

export type PerformancePoint = {
  label: string;
  businessDate: string;
} & Record<MetricKey, number | null>;

interface AdPerformanceTrendChartProps {
  trends: AdTrendsData | null;
  period: string;
}

/**
 * One point per requested date. A date the campaign sweep never measured is a
 * null point, and an unobserved conversion count keeps conversions/CVR null.
 */
export function buildPerformancePoints(trends: AdTrendsData | null): PerformancePoint[] {
  return (trends?.daily ?? []).map((day) => ({
    label: toAxisLabel(day.date),
    businessDate: day.date,
    spend: day.metrics?.spend ?? null,
    revenue: day.metrics?.revenue ?? null,
    impressions: day.metrics?.impressions ?? null,
    clicks: day.metrics?.clicks ?? null,
    conversions: day.metrics?.conversions ?? null,
    roas: day.metrics?.roas ?? null,
    ctr: day.metrics?.ctr ?? null,
    cvr: day.metrics?.cvr ?? null,
  }));
}

export default function AdPerformanceTrendChart({
  trends,
  period,
}: AdPerformanceTrendChartProps) {
  const [leftMetric, setLeftMetric] = useState<MetricKey>("spend");
  const [rightMetric, setRightMetric] = useState<MetricKey>("revenue");
  const [open, setOpen] = useState(true);

  const points = useMemo(() => buildPerformancePoints(trends), [trends]);
  const sourceLabel = adTrendsSourceLabel(trends?.summary);

  const left = METRIC_BY_KEY.get(leftMetric) ?? METRICS[0];
  const right = METRIC_BY_KEY.get(rightMetric) ?? METRICS[1];

  const handleDownload = () => {
    if (points.length === 0) return;
    void exportTrendXlsx({
      period,
      leftMetric: left.key,
      rightMetric: right.key,
      leftLabel: left.label,
      rightLabel: right.label,
      points: points.map((point) => ({
        businessDate: point.businessDate,
        axisLabel: point.label,
        leftValue: point[left.key],
        rightValue: point[right.key],
      })),
    }).catch((error: unknown) => {
      console.error("[ad-export] performance trend download failed", error);
    });
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "var(--card-bg)",
        boxShadow: "var(--shadow-sm)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div
        className="px-5 py-3 flex flex-wrap items-center gap-3 border-b"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="mr-auto">
          <h3 className="text-[14px] font-bold" style={{ color: "var(--text-primary)" }}>
            성과 그래프
          </h3>
          <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
            {sourceLabel}
          </p>
        </div>

        <MetricSelect
          value={leftMetric}
          onChange={setLeftMetric}
          color={LEFT_COLOR}
          ariaLabel="좌측 축 지표"
        />
        <MetricSelect
          value={rightMetric}
          onChange={setRightMetric}
          color={RIGHT_COLOR}
          ariaLabel="우측 축 지표"
        />

        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold"
          style={{ color: "var(--text-tertiary)", border: "1px solid var(--border)" }}
        >
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {open ? "닫기" : "열기"}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={points.length === 0}
          aria-label="성과 그래프 다운로드"
          className="inline-flex items-center justify-center rounded-lg p-1.5 disabled:opacity-40"
          style={{ color: "var(--text-tertiary)", border: "1px solid var(--border)" }}
        >
          <Download size={14} />
        </button>
      </div>

      {open && (
        <div className="px-3 py-4" style={{ height: 320 }}>
          {points.length === 0 ? (
            <div
              className="h-full flex items-center justify-center text-xs"
              style={{ color: "var(--text-tertiary)" }}
            >
              표시할 광고 성과 데이터가 없습니다.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fontWeight: 700 }}
                  stroke="var(--text-tertiary)"
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fontWeight: 700 }}
                  stroke={LEFT_COLOR}
                  width={56}
                  tickFormatter={left.axis}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fontWeight: 700 }}
                  stroke={RIGHT_COLOR}
                  width={56}
                  tickFormatter={right.axis}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 12, fontSize: 12, fontWeight: 700 }}
                  formatter={(value, name) => {
                    const metric = name === left.label ? left : right;
                    return [value == null ? "-" : metric.format(Number(value)), metric.label];
                  }}
                />
                <Line
                  yAxisId="left"
                  type="linear"
                  dataKey={left.key}
                  name={left.label}
                  stroke={LEFT_COLOR}
                  strokeWidth={2}
                  dot={<SquareDot fill={LEFT_COLOR} />}
                  activeDot={{ r: 5 }}
                />
                <Line
                  yAxisId="right"
                  type="linear"
                  dataKey={right.key}
                  name={right.label}
                  stroke={RIGHT_COLOR}
                  strokeWidth={2}
                  dot={<SquareDot fill={RIGHT_COLOR} />}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}

function MetricSelect({
  value,
  onChange,
  color,
  ariaLabel,
}: {
  value: MetricKey;
  onChange: (next: MetricKey) => void;
  color: string;
  ariaLabel: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block"
        style={{ width: 9, height: 9, background: color }}
      />
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value as MetricKey)}
        className="rounded-lg px-2 py-1.5 text-[11px] font-bold"
        style={{
          color: "var(--text-secondary)",
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        {METRICS.map((metric) => (
          <option key={metric.key} value={metric.key}>
            {metric.label}
          </option>
        ))}
      </select>
    </span>
  );
}
