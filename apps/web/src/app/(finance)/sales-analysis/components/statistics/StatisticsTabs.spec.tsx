import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatisticsTabs } from './StatisticsTabs';

describe('StatisticsTabs', () => {
  it('names Pareto as a revenue analysis rather than product ABC', () => {
    render(<StatisticsTabs activeTab="overview" onTabChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /매출 파레토/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ABC 파레토/ })).not.toBeInTheDocument();
  });
});
