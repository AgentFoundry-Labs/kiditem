'use client';

import { useSessionBackedUrlState } from '@/hooks/useSessionBackedUrlState';

export interface CoupangShipmentViewState {
  month: string;
  date: string;
}

const PARAM_KEYS = ['month', 'date'] as const;
const STORAGE_KEY = 'kiditem:route-state:coupang-shipments:v1';
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

export function useCoupangShipmentViewState() {
  return useSessionBackedUrlState<CoupangShipmentViewState>({
    storageKey: STORAGE_KEY,
    paramKeys: PARAM_KEYS,
    createDefault: createDefaultState,
    parse: parseState,
    serialize: serializeState,
  });
}

function createDefaultState(): CoupangShipmentViewState {
  const now = new Date();
  return {
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    date: '',
  };
}

function parseState(
  values: Readonly<Record<string, string>>,
  defaults: CoupangShipmentViewState,
): CoupangShipmentViewState {
  return {
    month: MONTH_PATTERN.test(values.month ?? '') ? values.month : defaults.month,
    date: isDate(values.date) ? values.date : '',
  };
}

function serializeState(state: CoupangShipmentViewState): Readonly<Record<string, string>> {
  return { ...state };
}

function isDate(value: string | undefined): value is string {
  if (!value || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  const pad = (part: number) => String(part).padStart(2, '0');
  const normalized = `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  return !Number.isNaN(parsed.getTime()) && normalized === value;
}
