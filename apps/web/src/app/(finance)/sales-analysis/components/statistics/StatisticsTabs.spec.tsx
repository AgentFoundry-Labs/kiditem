import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatisticsTabs } from './StatisticsTabs';

describe('StatisticsTabs', () => {
  it('renders every surviving statistics capability in its canonical order', () => {
    render(<StatisticsTabs activeTab="overview" onTabChange={vi.fn()} />);

    expect(screen.getAllByRole('button').map((button) => button.textContent?.trim()))
      .toEqual([
        '전체 개요',
        '제품별',
        '카테고리별',
        '등급별',
        '매출 파레토',
        '재구매율',
      ]);
  });
});
