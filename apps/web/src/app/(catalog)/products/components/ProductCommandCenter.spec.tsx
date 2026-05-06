import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductCommandCenter } from './ProductCommandCenter';
import type { PipelineCounts } from '../lib/product-types';

vi.mock('@/components/panel/lib/panel-store', () => ({
  usePanelStore: (selector: (state: { setOpen: (open: boolean) => void }) => unknown) =>
    selector({ setOpen: vi.fn() }),
}));

const counts: PipelineCounts = {
  total: 5,
  channelLinkedProducts: 3,
  channelUnlinkedProducts: 2,
  gradeA: 1,
  gradeB: 2,
  gradeC: 2,
  active: 3,
  inactive: 1,
  cleanup: 0,
  unknown: 1,
  minus: 0,
  low: 1,
  zeroStock: 0,
  lowStock: 1,
  stockRisk: 1,
  adLoss: 0,
  gradeChangeA: 0,
  gradeChangeB: 0,
  gradeChangeC: 0,
  adCount: 2,
  noAdCount: 3,
  totalRev: 1000,
  totalAd: 100,
  gradeRevA: 500,
  gradeRevB: 300,
  gradeRevC: 200,
  gradeAdA: 50,
  gradeAdB: 30,
  gradeAdC: 20,
};

describe('ProductCommandCenter', () => {
  it('labels the total as catalog inventory and shows channel coverage separately', () => {
    render(
      <ProductCommandCenter
        pipelineCounts={counts}
        newProductCount={1}
        productAlerts={[]}
        onSelectSegment={vi.fn()}
      />,
    );

    expect(screen.getByText('카탈로그 상품 전체')).toBeInTheDocument();
    expect(screen.getByText('채널 연결')).toBeInTheDocument();
    expect(screen.getByText('채널 미연결')).toBeInTheDocument();
  });

  it('keeps stock actions channel-neutral and filters zero-stock products in-app', () => {
    const onSelectSegment = vi.fn();
    render(
      <ProductCommandCenter
        pipelineCounts={counts}
        newProductCount={1}
        productAlerts={[]}
        onSelectSegment={onSelectSegment}
      />,
    );

    expect(screen.getByText('품절 상품')).toBeInTheDocument();
    expect(screen.queryByText('쿠팡 품절')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('품절 상품'));

    expect(onSelectSegment).toHaveBeenCalledWith('zero-stock');
  });
});
