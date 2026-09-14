"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Calendar, Loader2 } from "lucide-react";
import type { AdTrendsData } from "@kiditem/shared/advertising";
import {
  businessDateKey,
  closedMonthRangeFromCutoff,
  datesInclusive,
  inclusiveDayCount,
  parseBusinessDate,
  shiftBusinessDateKey,
} from "@kiditem/shared/common";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatKRW } from "@/lib/utils";
import { adTrendsSourceLabel } from "../lib/trends-source";

export type AdCollectionPeriod = "7d" | "14d" | "month";
type RangePreset = AdCollectionPeriod | "custom";

export type AdCollectionChartPoint = {
  date: string;
  label: string;
  spend: number | null;
  revenue: number | null;
  roas: number | null;
  collected: boolean;
};

const CHART_HEIGHT = 350;
const CHART_INITIAL_DIMENSION = { width: 720, height: CHART_HEIGHT };

function shiftDate(key: string, days: number): string {
  return shiftBusinessDateKey(key, days);
}

export function selectableRangeEndDate(today: string): string {
  return shiftDate(today, -1);
}

export function presetDateRange(
  preset: Exclude<RangePreset, "custom">,
  throughDate: string,
): { from: string; to: string } | null {
  if (preset === "7d") return { from: shiftDate(throughDate, -6), to: throughDate };
  if (preset === "14d") return { from: shiftDate(throughDate, -13), to: throughDate };
  return closedMonthRangeFromCutoff(throughDate);
}

export function enumerateDateKeys(from: string, to: string): string[] {
  const start = parseBusinessDate(from);
  const end = parseBusinessDate(to);
  if (!start || !end) return [];
  const count = inclusiveDayCount(start, end);
  return count >= 1 && count <= 90
    ? datesInclusive(start, end).map(businessDateKey)
    : [];
}

export function isCustomRangeInvalid(
  from: string,
  to: string,
  maxSelectableDate: string,
): boolean {
  return (
    !from ||
    !to ||
    from > to ||
    from > maxSelectableDate ||
    to > maxSelectableDate ||
    enumerateDateKeys(from, to).length === 0
  );
}

/**
 * 광고 성과 수집의 원본은 캠페인 순회다. 서버는 요청 기간의 모든 날짜를 주고
 * 측정하지 않은 날은 `metrics: null` 로 비워 둔다. 그 날은 0이 아니라 빈 칸이다.
 */
export function buildCollectionChartPoints(
  trends: AdTrendsData | null,
  expectedDates: string[],
): {
  points: AdCollectionChartPoint[];
  collectedCount: number;
  sourceLabel: string;
} {
  const daysByDate = new Map((trends?.daily ?? []).map((day) => [day.date, day]));
  let collectedCount = 0;
  const points = expectedDates.map((date) => {
    const metrics = daysByDate.get(date)?.metrics ?? null;
    if (metrics) collectedCount += 1;
    return {
      date,
      label: date.slice(5),
      spend: metrics?.spend ?? null,
      revenue: metrics?.revenue ?? null,
      roas: metrics?.roas ?? null,
      collected: metrics !== null,
    };
  });
  return { points, collectedCount, sourceLabel: adTrendsSourceLabel(trends?.summary) };
}

export default function AdCollectionDailyChart({
  initialTrends,
  period,
  onPeriodChange,
}: {
  initialTrends: AdTrendsData | null;
  period: AdCollectionPeriod;
  onPeriodChange: (period: AdCollectionPeriod) => void;
}) {
  const referenceDate = initialTrends?.knownThrough ?? null;
  const today = referenceDate ? shiftDate(referenceDate, 1) : null;
  const maxSelectableDate = today ? selectableRangeEndDate(today) : null;
  const initialCustom = referenceDate && today
    ? presetDateRange("month", referenceDate)
    : null;
  const customEdited = useRef(false);
  const [preset, setPreset] = useState<RangePreset>(period);
  const [draftFrom, setDraftFrom] = useState(initialCustom?.from ?? "");
  const [draftTo, setDraftTo] = useState(initialCustom?.to ?? "");
  const [customRange, setCustomRange] = useState(initialCustom);

  useEffect(() => {
    setPreset(period);
  }, [period]);

  useEffect(() => {
    if (!initialCustom || customEdited.current) return;
    setDraftFrom(initialCustom.from);
    setDraftTo(initialCustom.to);
    setCustomRange(initialCustom);
  }, [initialCustom?.from, initialCustom?.to]);

  const appliedRange =
    preset === "custom"
      ? customRange
      : referenceDate && today
        ? presetDateRange(preset, referenceDate)
        : null;
  const expectedDates = useMemo(
    () => appliedRange
      ? enumerateDateKeys(appliedRange.from, appliedRange.to)
      : [],
    [appliedRange?.from, appliedRange?.to],
  );

  const trendsQuery = useQuery({
    queryKey: appliedRange
      ? queryKeys.ads.trendsRange(appliedRange.from, appliedRange.to)
      : [...queryKeys.ads.all, "trends-range", "pending"],
    queryFn: () => {
      if (!appliedRange) throw new Error("Ad trends range is unavailable");
      return apiClient.get<AdTrendsData>(
        `/api/ads/campaigns/trends?from=${appliedRange.from}&to=${appliedRange.to}`,
      );
    },
    enabled: appliedRange !== null,
    placeholderData:
      preset === period ? initialTrends ?? undefined : undefined,
  });

  const chart = useMemo(
    () => buildCollectionChartPoints(trendsQuery.data ?? null, expectedDates),
    [expectedDates, trendsQuery.data],
  );
  const customInvalid = isCustomRangeInvalid(
    draftFrom,
    draftTo,
    maxSelectableDate ?? "",
  );

  return (
    <section
      className="h-full rounded-2xl overflow-hidden flex flex-col"
      style={{
        background: "var(--card-bg)",
        boxShadow: "var(--shadow-md)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div
        className="flex flex-wrap items-center gap-3 px-5 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="mr-auto">
          <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            일별 광고 성과 수집
          </h3>
          <div className="mt-0.5 flex items-center gap-2 text-[10px]">
            <span style={{ color: "var(--text-tertiary)" }}>{chart.sourceLabel}</span>
            <span style={{ color: "var(--text-tertiary)" }}>
              {appliedRange
                ? `${appliedRange.from} ~ ${appliedRange.to}${appliedRange.to === referenceDate ? " · 어제까지" : ""}`
                : referenceDate && preset === "month"
                  ? "이번 달에 마감된 영업일이 없습니다"
                  : "기준일 확인 중"}
            </span>
            {trendsQuery.isFetching && <Loader2 size={11} className="animate-spin" />}
          </div>
        </div>

        <div className="flex rounded-lg p-0.5" style={{ background: "var(--surface-sunken)" }}>
          {([
            ["7d", "7일"],
            ["14d", "14일"],
            ["month", "이번달"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setPreset(value);
                onPeriodChange(value);
              }}
              className="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
              style={
                preset === value
                  ? { background: "var(--primary)", color: "#ffffff" }
                  : { color: "var(--text-tertiary)" }
              }
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPreset("custom")}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
            style={
              preset === "custom"
                ? { background: "var(--primary)", color: "#ffffff" }
                : { color: "var(--text-tertiary)" }
            }
          >
            <Calendar size={12} /> 기간
          </button>
        </div>

        {preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <input
              aria-label="광고 성과 시작일"
              type="date"
              value={draftFrom}
              max={draftTo || maxSelectableDate || undefined}
              onChange={(event) => {
                customEdited.current = true;
                setDraftFrom(event.target.value);
              }}
              className="h-8 rounded-md border px-2 text-xs"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--text-secondary)",
              }}
            />
            <span style={{ color: "var(--text-tertiary)" }}>~</span>
            <input
              aria-label="광고 성과 종료일"
              type="date"
              value={draftTo}
              min={draftFrom || undefined}
              max={maxSelectableDate ?? undefined}
              onChange={(event) => {
                customEdited.current = true;
                setDraftTo(event.target.value);
              }}
              className="h-8 rounded-md border px-2 text-xs"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--text-secondary)",
              }}
            />
            <button
              type="button"
              disabled={customInvalid}
              onClick={() => setCustomRange({ from: draftFrom, to: draftTo })}
              className="h-8 rounded-md px-3 text-xs font-bold text-white disabled:opacity-40"
              style={{ background: "var(--primary)" }}
            >
              조회
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 px-3 py-4">
        {trendsQuery.isError ? (
          <div
            className="flex h-full items-center justify-center text-sm"
            style={{ color: "var(--danger)" }}
          >
            광고 성과 데이터를 불러오지 못했습니다.
          </div>
        ) : chart.collectedCount === 0 ? (
          <div
            className="flex h-full flex-col items-center justify-center gap-2 text-center"
            style={{ color: "var(--text-tertiary)" }}
          >
            <span className="text-sm font-bold" style={{ color: "var(--text-secondary)" }}>
              선택 기간에 수집된 광고 성과가 없습니다
            </span>
            <span className="text-xs">데이터 수집 모달에서 ‘광고 받기’를 먼저 실행해 주세요.</span>
          </div>
        ) : (
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={CHART_INITIAL_DIMENSION}
          >
            <AreaChart data={chart.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gAdRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3182f6" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#3182f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gAdSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                interval="preserveStartEnd"
                minTickGap={18}
              />
              <YAxis
                yAxisId="won"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                tickFormatter={(value: number) =>
                  Math.abs(value) >= 10_000 ? `${Math.round(value / 10_000)}만` : String(value)
                }
                domain={[0, "auto"]}
              />
              <YAxis
                yAxisId="roas"
                orientation="right"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "#00a86b" }}
                tickFormatter={(value: number) => `${Math.round(value)}%`}
                domain={[0, "auto"]}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 10,
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  color: "#0f172a",
                }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
                formatter={(value, name) => {
                  if (value == null) return ["미수집", name];
                  if (name === "ROAS") return [`${Number(value).toFixed(1)}%`, name];
                  return [`${formatKRW(Number(value))}원`, name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Area
                yAxisId="won"
                type="monotone"
                dataKey="revenue"
                name="전환매출"
                stroke="#3182f6"
                strokeWidth={2.2}
                fill="url(#gAdRevenue)"
                connectNulls={false}
                dot={false}
              />
              <Area
                yAxisId="won"
                type="monotone"
                dataKey="spend"
                name="광고비"
                stroke="#94a3b8"
                strokeWidth={2}
                fill="url(#gAdSpend)"
                connectNulls={false}
                dot={false}
              />
              <Line
                yAxisId="roas"
                type="monotone"
                dataKey="roas"
                name="ROAS"
                stroke="#00c471"
                strokeWidth={2}
                connectNulls={false}
                dot={{ r: 3, fill: "#ffffff", stroke: "#00c471", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
