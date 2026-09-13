import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MALL_PUBLISH_ADAPTERS } from '@/app/(channels)/_shared/adapters';
import type { MallChannelSummary } from '@kiditem/shared/mall-publishing';
import {
  MarketplaceSummaryBar,
  marketplaceSummaryCards,
} from './MarketplaceSummaryBar';
import type { RegisteredMarketCount } from '../lib/channel-listings-api';

/**
 * 마켓별 등록한 상품 수.
 *
 * 지키는 것 셋 —
 *  1. **카드는 어댑터 레지스트리에서 나온다.** 예전엔 다섯 채널이 코드에 박혀 있어 우리가
 *     실제로 등록하는 몰이 하나도 안 보였다.
 *  2. **모르는 자리에 0 을 찍지 않는다.** 가져온 적 없는 몰은 `-`·`미확인` 이다.
 *  3. **레지스트리에 없어도 실데이터가 있으면 보여 준다**(쿠팡 로켓).
 */
const count = (channel: string, value: number): RegisteredMarketCount => ({
  channel,
  channelAccountId: null,
  channelAccountName: null,
  count: value,
});

const channel = (mallKey: string, imported: boolean): MallChannelSummary => ({
  mallKey,
  mallName: mallKey,
  channelAccountId: null,
  canPublish: true,
  hasCredentials: true,
  imported,
  collectsOrders: false,
  uploadsTracking: false,
  listingCount: 0,
  orderCount: 0,
  productCount: 0,
  readiness: 'ready',
});

describe('marketplaceSummaryCards', () => {
  it('등록 어댑터가 있는 몰은 데이터가 없어도 카드가 선다', () => {
    const cards = marketplaceSummaryCards([], []);
    for (const adapter of MALL_PUBLISH_ADAPTERS) {
      const card = cards.find((row) => row.channel === adapter.mallKey);
      expect(card?.label).toBe(adapter.mallName);
    }
  });

  it('레지스트리가 먼저 오고 그 밖의 채널이 뒤에 붙는다', () => {
    const cards = marketplaceSummaryCards([count('rocket', 459)], []);
    expect(cards.at(-1)).toMatchObject({ channel: 'rocket', label: '쿠팡 로켓', count: 459 });
    expect(cards.length).toBe(MALL_PUBLISH_ADAPTERS.length + 1);
  });

  it('같은 채널의 계정별 숫자를 합친다', () => {
    const cards = marketplaceSummaryCards([count('coupang', 1000), count('coupang', 228)], []);
    expect(cards.find((row) => row.channel === 'coupang')?.count).toBe(1228);
  });

  it('숫자가 있으면 그 자체가 가져온 증거다', () => {
    const cards = marketplaceSummaryCards([count('coupang', 1228)], []);
    expect(cards.find((row) => row.channel === 'coupang')?.imported).toBe(true);
  });

  it('가져온 적 없는 몰은 imported 가 거짓이다 — 0 이 아니라 모름이다', () => {
    const cards = marketplaceSummaryCards([], [channel('teacher-mall', false)]);
    expect(cards.find((row) => row.channel === 'teacher-mall')?.imported).toBe(false);
  });

  it('가져왔는데 0 건이면 진짜 0 이다', () => {
    const cards = marketplaceSummaryCards([], [channel('teacher-mall', true)]);
    expect(cards.find((row) => row.channel === 'teacher-mall'))
      .toMatchObject({ count: 0, imported: true });
  });
});

describe('MarketplaceSummaryBar', () => {
  const renderBar = (overrides: Partial<Parameters<typeof MarketplaceSummaryBar>[0]> = {}) => {
    const props = {
      counts: [count('coupang', 1228), count('rocket', 459)],
      channels: [channel('teacher-mall', true), channel('domeggook', false)],
      activeChannel: null,
      onSelectChannel: vi.fn(),
      ...overrides,
    };
    render(<MarketplaceSummaryBar {...props} />);
    return props;
  };

  it('숫자가 있는 몰은 숫자를 보여 준다', () => {
    renderBar();
    expect(screen.getByRole('button', { name: '쿠팡 WING 1228개' })).toHaveTextContent('1,228');
  });

  it('가져왔는데 0 이면 0 을, 가져온 적 없으면 미확인을 보여 준다', () => {
    renderBar();
    expect(screen.getByRole('button', { name: '티처몰 0개' })).toHaveTextContent('0');
    const unknown = screen.getByRole('button', { name: '도매꾹 미확인' });
    expect(unknown).toHaveTextContent('미확인');
    expect(unknown).not.toHaveTextContent('0');
  });

  it('합계를 머리말에 적는다', () => {
    renderBar();
    expect(screen.getByText('합계 1,687개')).toBeInTheDocument();
  });

  it('카드를 누르면 그 채널로 거른다', () => {
    const props = renderBar();
    fireEvent.click(screen.getByRole('button', { name: '쿠팡 WING 1228개' }));
    expect(props.onSelectChannel).toHaveBeenCalledWith('coupang');
  });

  it('고른 카드를 다시 누르면 해제한다', () => {
    const props = renderBar({ activeChannel: 'coupang' });
    fireEvent.click(screen.getByRole('button', { name: '쿠팡 WING 1228개' }));
    expect(props.onSelectChannel).toHaveBeenCalledWith(null);
  });

  it('몰 요약이 없어도 그린다 — 그때는 전부 모름이다', () => {
    renderBar({ channels: [], counts: [] });
    expect(screen.getByText('합계 0개')).toBeInTheDocument();
    expect(screen.getAllByText('미확인').length).toBe(MALL_PUBLISH_ADAPTERS.length);
  });
});
