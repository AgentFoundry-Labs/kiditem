export const SALES_ANALYSIS_TAB_IDS = [
  'wing-daily',
  'rocket-daily',
  'overview',
  'statistics',
  'reports',
  'plans',
  'settlements',
] as const;

export type SalesAnalysisTabId = (typeof SALES_ANALYSIS_TAB_IDS)[number];

const SALES_ANALYSIS_TAB_ID_SET = new Set<string>(SALES_ANALYSIS_TAB_IDS);

export function parseSalesAnalysisTabId(value: string | null | undefined): SalesAnalysisTabId {
  return value && SALES_ANALYSIS_TAB_ID_SET.has(value)
    ? (value as SalesAnalysisTabId)
    : 'wing-daily';
}
