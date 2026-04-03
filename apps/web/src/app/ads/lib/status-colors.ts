// 순수 UI 매핑 — 서버가 계산한 status 값으로 색상 결정

export const ROAS_STATUS_COLOR: Record<string, string> = {
  excellent: 'text-emerald-600',
  good: 'text-green-600',
  warning: 'text-orange-500',
  poor: 'text-red-600',
};

export const AD_RATE_STATUS_STYLE: Record<string, string> = {
  ok: 'bg-green-50 border-green-200',
  warning: 'bg-orange-50 border-orange-200',
  critical: 'bg-red-50 border-red-200',
};

export const AD_RATE_STATUS_TEXT_COLOR: Record<string, string> = {
  ok: 'text-green-700',
  warning: 'text-orange-700',
  critical: 'text-red-700',
};

// campaigns, trends 등 status 필드 없는 응답용 헬퍼
export function roasColor(
  roas: number,
  thresholds: { excellent: number; warning: number; poor: number },
): string {
  if (roas >= thresholds.excellent) return ROAS_STATUS_COLOR.excellent;
  if (roas >= thresholds.warning) return ROAS_STATUS_COLOR.good;
  if (roas >= thresholds.poor) return ROAS_STATUS_COLOR.warning;
  return ROAS_STATUS_COLOR.poor;
}
