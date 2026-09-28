import { describe, expect, it } from 'vitest';
import { measuredAdDates } from './ad-report-coverage';

const A = 'acc-a';
const B = 'acc-b';

describe('measuredAdDates (KID-45·372)', () => {
  it('활성 계정 모두의 확정 창이 덮은 날만 측정한 날이다', () => {
    const dates = measuredAdDates({
      activeAccountIds: [A, B],
      windows: [
        { channelAccountId: A, start: '2026-09-01', end: '2026-09-05' },
        { channelAccountId: B, start: '2026-09-03', end: '2026-09-04' },
      ],
    });
    expect(dates).toEqual(['2026-09-03', '2026-09-04']);
  });

  it('창이 겹치면 합집합으로 세고, 비활성 계정의 창은 무시한다', () => {
    const dates = measuredAdDates({
      activeAccountIds: [A],
      windows: [
        { channelAccountId: A, start: '2026-09-01', end: '2026-09-02' },
        { channelAccountId: A, start: '2026-09-02', end: '2026-09-03' },
        { channelAccountId: 'inactive', start: '2026-08-01', end: '2026-08-31' },
      ],
    });
    expect(dates).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });

  it('from(포함)·to(제외)로 자르고, 활성 계정이 없으면 빈 목록', () => {
    const windows = [{ channelAccountId: A, start: '2026-09-01', end: '2026-09-10' }];
    expect(measuredAdDates({ activeAccountIds: [A], windows, from: '2026-09-09', to: '2026-09-11' }))
      .toEqual(['2026-09-09', '2026-09-10']);
    expect(measuredAdDates({ activeAccountIds: [A], windows, from: '2026-09-03', to: '2026-09-05' }))
      .toEqual(['2026-09-03', '2026-09-04']);
    expect(measuredAdDates({ activeAccountIds: [], windows })).toEqual([]);
  });
});
