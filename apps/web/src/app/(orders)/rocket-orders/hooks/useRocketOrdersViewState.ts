'use client';

import { useSessionBackedUrlState } from '@/hooks/useSessionBackedUrlState';

export type RocketOrdersView = 'month' | 'chart';

export interface RocketOrdersViewState {
  account: string;
  from: string;
  to: string;
  status: string;
  date: string;
  view: RocketOrdersView;
}

const PARAM_KEYS = ['account', 'from', 'to', 'status', 'date', 'view'] as const;
const STORAGE_KEY = 'kiditem:route-state:rocket-orders:v1';
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

export function useRocketOrdersViewState() {
  return useSessionBackedUrlState<RocketOrdersViewState>({
    storageKey: STORAGE_KEY,
    paramKeys: PARAM_KEYS,
    createDefault: createDefaultState,
    parse: parseState,
    serialize: serializeState,
  });
}

function createDefaultState(): RocketOrdersViewState {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return {
    account: '',
    from: ymd(new Date(year, month, 1)),
    to: ymd(new Date(year, month + 1, 0)),
    status: '',
    date: '',
    view: 'month',
  };
}

function parseState(
  values: Readonly<Record<string, string>>,
  defaults: RocketOrdersViewState,
): RocketOrdersViewState {
  const from = isDate(values.from) ? values.from : defaults.from;
  const to = isDate(values.to) && values.to >= from ? values.to : defaults.to;
  const date = isDate(values.date) && values.date >= from && values.date <= to
    ? values.date
    : '';
  return {
    account: values.account?.trim() ?? '',
    from,
    to,
    status: values.status === '거래명세서확인요청'
      || values.status === '거래처확인요청'
      ? '거래처확인요청'
      : '',
    date,
    view: values.view === 'chart' ? 'chart' : 'month',
  };
}

function serializeState(state: RocketOrdersViewState): Readonly<Record<string, string>> {
  return { ...state };
}

function isDate(value: string | undefined): value is string {
  if (!value || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && ymd(parsed) === value;
}

function ymd(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
