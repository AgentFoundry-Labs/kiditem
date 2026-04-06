import { useState } from 'react';

interface PeriodOption {
  value: string;
  label: string;
}

interface UsePeriodSelectorOptions {
  /** 최근 N개월 옵션 생성. 미지정 시 옵션 없음 (자유 입력용) */
  months?: number;
  /** 기본 선택 기간. 'current' = 이번달, 'prev' = 이전달 */
  defaultTo?: 'current' | 'prev';
}

function getDefaultPeriod(defaultTo: 'current' | 'prev'): string {
  const now = new Date();
  if (defaultTo === 'prev') {
    now.setMonth(now.getMonth() - 1);
  }
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function generatePeriodOptions(months: number): PeriodOption[] {
  const options: PeriodOption[] = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${d.getFullYear()}년 ${d.getMonth() + 1}월`,
    });
  }
  return options;
}

export function usePeriodSelector(options?: UsePeriodSelectorOptions) {
  const { months, defaultTo = 'current' } = options ?? {};
  const periodOptions = months ? generatePeriodOptions(months) : [];
  const [period, setPeriod] = useState(() => getDefaultPeriod(defaultTo));

  return { period, setPeriod, periodOptions };
}
