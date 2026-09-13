export type SettlementMatchStatus = 'matched' | 'minor_diff' | 'mismatch';

export function classifySettlementDifference(difference: number): SettlementMatchStatus {
  const absoluteDifference = Math.abs(difference);
  if (absoluteDifference <= 100) return 'matched';
  if (absoluteDifference <= 1_000) return 'minor_diff';
  return 'mismatch';
}
