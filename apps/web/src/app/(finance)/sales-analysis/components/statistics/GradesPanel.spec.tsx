import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GradesPanel } from './GradesPanel';

describe('GradesPanel', () => {
  it('renders grade totals that are unavailable as -, not as a zero or a bare unit', () => {
    render(
      <GradesPanel
        grades={[{ grade: 'A', revenue: null, profit: null, count: null, productCount: null, adCost: null }]}
      />,
    );

    expect(screen.getByText('A등급')).toBeInTheDocument();
    expect(screen.queryByText(/개 상품/)).not.toBeInTheDocument();
    expect(screen.queryByText(/원/)).not.toBeInTheDocument();
    expect(screen.getAllByText('-')).toHaveLength(4);
  });

  it('shows measured grade totals with their units', () => {
    render(
      <GradesPanel
        grades={[{ grade: 'B', revenue: 20_000, profit: 9_000, count: 1, productCount: 1, adCost: 1_000 }]}
      />,
    );

    expect(screen.getByText('1개 상품')).toBeInTheDocument();
    expect(screen.getByText('20,000원')).toBeInTheDocument();
    expect(screen.getByText('9,000원')).toBeInTheDocument();
    expect(screen.getByText('1,000원')).toBeInTheDocument();
  });
});
