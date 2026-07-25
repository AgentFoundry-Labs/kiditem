export type CoupangShipmentDateSummaryValue = {
  date: string;
  count: number;
  boxes: number;
};

type PersistedCoupangShipmentDateSummaryValue = CoupangShipmentDateSummaryValue & {
  capturedAt: string;
};

type CoupangShipmentDateSummaryPersistence = {
  save(items: CoupangShipmentDateSummaryValue[]): Promise<unknown>;
  load(): Promise<{ items: PersistedCoupangShipmentDateSummaryValue[] }>;
};

const VERIFICATION_ERROR_MESSAGE =
  '발송일 요약 저장을 서버에서 확인하지 못했습니다. 다시 조회해주세요.';

export async function persistAndVerifyCoupangShipmentDateSummary(
  collected: CoupangShipmentDateSummaryValue[],
  persistence: CoupangShipmentDateSummaryPersistence,
): Promise<CoupangShipmentDateSummaryValue[]> {
  await persistence.save(collected);
  const persisted = await persistence.load();
  const persistedByDate = new Map(persisted.items.map((item) => [item.date, item]));

  for (const expected of collected) {
    const actual = persistedByDate.get(expected.date);
    if (
      !actual ||
      actual.count !== expected.count ||
      actual.boxes !== expected.boxes
    ) {
      throw new Error(VERIFICATION_ERROR_MESSAGE);
    }
  }

  return persisted.items.map(({ date, count, boxes }) => ({ date, count, boxes }));
}
