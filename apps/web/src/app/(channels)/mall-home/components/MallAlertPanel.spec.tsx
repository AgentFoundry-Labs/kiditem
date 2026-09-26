import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AlertItem } from '@kiditem/shared/alerts';
import { MallAlertPanel } from './MallAlertPanel';

vi.mock('@/lib/alerts-api', () => ({
  useDismissAlert: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

function alert(id: string, overrides: Partial<AlertItem> = {}): AlertItem {
  return {
    id,
    attemptId: null,
    status: 'OPEN',
    type: 'source_failure',
    title: '쿠팡 쉽먼트 수집 실패',
    message: null,
    targetType: null,
    targetId: null,
    sourceType: 'orders.coupang_shipment_summary',
    href: '/coupang-shipments',
    isRead: false,
    createdAt: '2026-09-11T01:00:00.000Z',
    updatedAt: '2026-09-11T01:00:00.000Z',
    ...overrides,
  };
}

function panel(mall: { key: string; name: string } | null, alerts: AlertItem[], accountMalls?: ReadonlyMap<string, string>) {
  render(
    <MallAlertPanel
      alerts={alerts}
      accountMalls={accountMalls}
      derived={[]}
      ready
      filter="all"
      onFilterChange={() => {}}
      mall={mall}
      onClearMall={() => {}}
    />,
  );
  return within(screen.getByRole('log'));
}

describe('MallAlertPanel — 몰로 거르기', () => {
  it('몰마다 도는 kind의 알림은 대상 채널 계정의 몰 카드에서 보인다(KID-355)', () => {
    const account = '55555555-5555-4555-8555-555555555555';
    const item = alert('mall', {
      type: 'operation_failure',
      sourceType: 'orders.mall_orders',
      title: 'GS샵 몰 주문 수집 실패',
      targetType: 'channel_account',
      targetId: account,
    });
    const accounts = new Map([[account, 'gs-shop']]);
    expect(panel({ key: 'gs-shop', name: 'GS샵' }, [item], accounts).getByText('GS샵 몰 주문 수집 실패')).toBeInTheDocument();
  });

  /**
   * 쿠팡직배송은 로켓 계정 행을 함께 쓴다. 타일은 그 행의 채널로 서기 때문에 사람이 누르는
   * 카드는 언제나 로켓이다 — 접지 않으면 직배송 알림은 어느 카드로도 볼 수 없다.
   */
  it('⭐ 쿠팡 로켓 카드가 함께 쓰는 쿠팡직배송 알림을 보여 준다', () => {
    const list = panel({ key: 'rocket', name: '쿠팡 로켓' }, [
      alert('direct', { sourceType: 'orders.coupang_directship', title: '쿠팡 직배송 주문 수집 실패' }),
      alert('wing', { sourceType: 'advertising.wing_traffic', title: '윙 트래픽 수집 실패' }),
    ]);
    expect(list.getByText('쿠팡 직배송 주문 수집 실패')).toBeInTheDocument();
    // 다른 몰 알림까지 끌어오지는 않는다 — 거르기는 여전히 거른다.
    expect(list.queryByText('윙 트래픽 수집 실패')).toBeNull();
  });
});
