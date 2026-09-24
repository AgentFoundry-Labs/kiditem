import { kstBusinessDate } from '../../common/kst';

/** Coverage date keys an ingestion run's declared source window certifies from `start` onward. */
export function declaredCoverageDateKeys(
  run: {
    sourceKey: string;
    sourceWindowStartAt: Date | null;
    sourceWindowEndAt: Date | null;
  },
  start: Date,
): string[] {
  if (
    run.sourceWindowStartAt
    && run.sourceWindowEndAt
    && run.sourceWindowStartAt.getTime() > run.sourceWindowEndAt.getTime()
  ) {
    return [];
  }

  const declaredDate = (
    run.sourceKey === 'naver.trend' || run.sourceKey === 'shortstrend.trend'
      ? run.sourceWindowStartAt
      : run.sourceWindowEndAt
  );
  if (!declaredDate) return [];

  const declaredKey = dateKey(kstBusinessDate(declaredDate));
  const startKey = dateKey(kstBusinessDate(start));
  return declaredKey >= startKey ? [declaredKey] : [];
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}
