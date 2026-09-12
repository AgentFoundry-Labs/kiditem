'use client';

import { useState } from 'react';
import {
  businessDateKey,
  kstBusinessDate,
  kstMonthEnd,
  kstMonthRange,
  parseBusinessDate,
} from '@kiditem/shared/common';

interface PeriodOption {
  value: string;
  label: string;
}

interface UsePeriodSelectorOptions {
  /** 최근 N개월 옵션 생성. 미지정 시 옵션 없음 (자유 입력용) */
  months?: number;
  /** 기본 선택 기간. 'current' = 이번달, 'prev' = 이전달 */
  defaultTo?: 'current' | 'prev';
  /** URL 등 외부에서 주입하는 초기 period 값 (YYYY-MM). 지정 시 defaultTo 무시. */
  initial?: string;
  /** Server-published calendar cutoff (`YYYY-MM-DD`) used as the month anchor. */
  referenceDate?: string | null;
}

function getDefaultPeriod(
  referenceDate: string,
  defaultTo: 'current' | 'prev',
): string {
  const current = referenceDate.slice(0, 7);
  if (defaultTo === 'current') return current;
  return kstMonthRange(kstMonthEnd(current), 2)[0]!;
}

function generatePeriodOptions(months: number, referenceDate: string): PeriodOption[] {
  const current = referenceDate.slice(0, 7);
  return kstMonthRange(kstMonthEnd(current), months)
    .reverse()
    .map((value) => ({
      value,
      label: `${value.slice(0, 4)}년 ${Number(value.slice(5, 7))}월`,
    }));
}

const PERIOD_SHAPE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function usePeriodSelector(options?: UsePeriodSelectorOptions) {
  const { months, defaultTo = 'current', initial, referenceDate } = options ?? {};
  const validReference = referenceDate && parseBusinessDate(referenceDate)
    ? referenceDate
    : businessDateKey(kstBusinessDate(new Date()));
  const periodOptions = months
    ? generatePeriodOptions(months, validReference)
    : [];
  const [selectedPeriod, setPeriod] = useState<string | null>(() =>
    initial && PERIOD_SHAPE.test(initial) ? initial : null,
  );
  const period = selectedPeriod
    ?? getDefaultPeriod(validReference, defaultTo);

  return { period, setPeriod, periodOptions };
}
