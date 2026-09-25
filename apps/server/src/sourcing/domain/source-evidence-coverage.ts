import { kstBusinessDate } from '../../common/kst';

/** Coverage date keys a source publication's declared window certifies from `start` onward. */
export function declaredCoverageDateKeys(
  publication: {
    sourceKey: string;
    windowStartAt: Date | null;
    windowEndAt: Date | null;
  },
  start: Date,
): string[] {
  if (
    publication.windowStartAt
    && publication.windowEndAt
    && publication.windowStartAt.getTime() > publication.windowEndAt.getTime()
  ) {
    return [];
  }

  const declaredDate = (
    publication.sourceKey === 'naver.trend' || publication.sourceKey === 'shortstrend.trend'
      ? publication.windowStartAt
      : publication.windowEndAt
  );
  if (!declaredDate) return [];

  const declaredKey = dateKey(kstBusinessDate(declaredDate));
  const startKey = dateKey(kstBusinessDate(start));
  return declaredKey >= startKey ? [declaredKey] : [];
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}
