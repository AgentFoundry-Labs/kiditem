import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StockOpsPage from './page';

vi.mock('./components/OutOfStock', () => ({ default: () => <div>ChannelZero</div> }));
vi.mock('./components/ProductOutflow', () => ({ default: () => <div>ProductOutflow</div> }));

const replaceMock = vi.hoisted(() => vi.fn());
const navigation = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => navigation.params,
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

beforeEach(() => {
  replaceMock.mockReset();
  navigation.params = new URLSearchParams();
});

describe('StockOpsPage', () => {
  it('keeps only the two analysis views that stayed on this route', () => {
    render(<StockOpsPage />);

    expect(screen.getByRole('heading', { level: 1, name: '재고 분석' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent))
      .toEqual(['상품별 소진', '채널 판매 가능 0']);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it.each([
    ['sellpia-zero', '/inventory-hub?tab=checks'],
    ['mapping-attention', '/inventory-hub?tab=checks'],
    ['inventory-value', '/inventory-hub?tab=status'],
    ['freshness', '/inventory-hub?tab=sellpia-sync'],
    ['transfer', '/inventory-hub?tab=status'],
    ['return-transfer', '/inventory-hub?tab=status'],
  ])('sends the moved ?tab=%s deep link to its new home', (legacyTab, destination) => {
    // 대시보드와 서버 운영 알림이 이 링크들을 그대로 들고 있다. 빈 화면으로 떨어뜨리면 안 된다.
    navigation.params = new URLSearchParams(`tab=${legacyTab}`);
    render(<StockOpsPage />);

    expect(replaceMock).toHaveBeenCalledWith(destination);
  });

  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'])(
    'ignores the inherited prototype key ?tab=%s instead of redirecting to it',
    (protoKey) => {
      // 평범한 객체 리터럴을 raw 쿼리값으로 인덱싱하면 Object.prototype 멤버가 잡혀
      // router.replace 에 함수가 넘어가고 화면이 스켈레톤에서 멈춘다.
      navigation.params = new URLSearchParams(`tab=${protoKey}`);
      render(<StockOpsPage />);

      expect(replaceMock).not.toHaveBeenCalled();
      expect(screen.getByRole('tab', { name: '상품별 소진' })).toHaveAttribute('aria-selected', 'true');
    },
  );

  it('folds the retired bottleneck tab into channel zero-stock without leaving the route', () => {
    navigation.params = new URLSearchParams('tab=bottlenecks');
    render(<StockOpsPage />);

    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: '채널 판매 가능 0' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('ChannelZero')).toBeInTheDocument();
  });
});
