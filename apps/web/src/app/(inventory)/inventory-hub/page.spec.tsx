import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import InventoryHubPage from './page';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/dynamic', () => ({
  default: () => function DynamicChild() {
    return <div>동적 화면</div>;
  },
}));

describe('InventoryHubPage', () => {
  it('uses the develop inventory tab order without a direct stock mutation tab', async () => {
    render(<InventoryHubPage />);
    const tabs = within(screen.getByTestId('tab-layout-tabs')).getAllByRole('button');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      '재고 현황',
      '발주 관리',
      '입출고',
      'Sellpia 동기화',
      '로켓 수동 처리',
      '수불부',
      '재고 실사',
      '재고자산',
    ]);
    expect(screen.queryByRole('button', { name: '가져오기 이력' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '채널 가용재고' })).not.toBeInTheDocument();
  });
});
