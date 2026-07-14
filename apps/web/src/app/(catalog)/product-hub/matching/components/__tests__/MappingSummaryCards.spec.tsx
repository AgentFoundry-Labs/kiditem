import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MappingSummaryCards } from '../MappingSummaryCards';

describe('MappingSummaryCards', () => {
  it('shows only current matching states in develop-style cards', () => {
    const { container } = render(
      <MappingSummaryCards
        counts={{ all: 10, unmatched: 6, needsReview: 3, matched: 1 }}
        loading={false}
      />,
    );

    expect(screen.getByText('전체 채널 SKU')).toBeInTheDocument();
    expect(screen.getByText('미매칭')).toBeInTheDocument();
    expect(screen.getByText('확인 필요')).toBeInTheDocument();
    expect(screen.getByText('매칭 완료')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('충돌')).not.toBeInTheDocument();
    expect(screen.queryByText('제외')).not.toBeInTheDocument();

    for (const card of Array.from(container.firstElementChild?.children ?? [])) {
      expect(card).toHaveClass(
        'bg-white',
        'rounded-xl',
        'border',
        'border-slate-200',
        'p-4',
      );
    }
  });

  it('uses placeholders while counts are loading', () => {
    render(
      <MappingSummaryCards
        counts={{ all: 10, unmatched: 6, needsReview: 3, matched: 1 }}
        loading
      />,
    );

    expect(screen.getAllByText('—')).toHaveLength(4);
    expect(screen.queryByText('10')).not.toBeInTheDocument();
  });
});
