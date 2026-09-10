import { describe, expect, it } from 'vitest';
import type { MallChannelSummary } from '@kiditem/shared/mall-publishing';
import { MALL_PUBLISH_ADAPTERS } from '../../_shared/adapters';
import { mallRegisterTargets } from './MallRegisterBoard';

function channel(mallKey: string, mallName: string): MallChannelSummary {
  return {
    mallKey,
    mallName,
    readiness: 'ready',
    canPublish: true,
    imported: false,
    productCount: 0,
    listingCount: 0,
    orderCount: 0,
  } as MallChannelSummary;
}

describe('mallRegisterTargets', () => {
  it('보드에 서는 몰은 등록 어댑터가 있는 몰뿐이다', () => {
    const targets = mallRegisterTargets([channel('coupang', '쿠팡')]);
    expect(targets.map((target) => target.mallKey)).toEqual(
      MALL_PUBLISH_ADAPTERS.map((adapter) => adapter.mallKey),
    );
  });

  it('연결된 계정이 있으면 초록이다', () => {
    const [first] = MALL_PUBLISH_ADAPTERS;
    const targets = mallRegisterTargets([channel(first!.mallKey, '연결된 몰')]);
    const hit = targets.find((target) => target.mallKey === first!.mallKey);
    expect(hit?.ready).toBe(true);
    expect(hit?.mallName).toBe('연결된 몰');
  });

  it('계정이 없으면 빨강이고 이유를 들고 있다', () => {
    // 어댑터만 있고 계정이 없으면 눌러도 안 된다. 초록으로 칠하지 않는다.
    const targets = mallRegisterTargets([]);
    expect(targets.every((target) => !target.ready)).toBe(true);
    expect(targets[0]?.reason).toContain('연결된 계정');
  });
});
