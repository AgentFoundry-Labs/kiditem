/** 발송일 달력 한 칸. 기준(baseline) 행은 측정값이 없는 미검증 칸이다. */
export type CoupangShipmentDateSummaryEntry = {
  date: string;
  count: number | null;
  boxes: number | null;
  capturedAt: string;
  verified: boolean;
};
