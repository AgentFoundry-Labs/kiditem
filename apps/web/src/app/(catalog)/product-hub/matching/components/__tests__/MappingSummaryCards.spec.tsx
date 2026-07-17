import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MappingSummaryCards } from '../MappingSummaryCards';

const counts = {
  products: { all: 10, linked: 4, unlinked: 6 },
  options: {
    all: 20,
    linked: 12,
    unlinked: 8,
    recipeConfirmed: 7,
    configurationRequired: 3,
    reviewRequired: 2,
  },
};

describe('MappingSummaryCards', () => {
  it('separates direct links from confirmed inventory recipes and their queues', () => {
    render(<MappingSummaryCards counts={counts} loading={false} />);
    expect(screen.getByText('운영 상품 연결')).toBeInTheDocument();
    expect(screen.getByText('4 / 10')).toBeInTheDocument();
    expect(screen.getByText('운영 옵션 연결')).toBeInTheDocument();
    expect(screen.getByText('12 / 20')).toBeInTheDocument();
    expect(screen.getByText('Sellpia 레시피 확정')).toBeInTheDocument();
    expect(screen.getByText('7 / 12')).toBeInTheDocument();
    expect(screen.getByText('미연결 상품')).toBeInTheDocument();
    expect(screen.getByText('미연결 옵션')).toBeInTheDocument();
    expect(screen.getByText('레시피 구성 필요')).toBeInTheDocument();
    expect(screen.getByText('레시피 검토 필요')).toBeInTheDocument();
    expect(screen.queryByText('연결 완료 옵션')).not.toBeInTheDocument();
  });

  it('uses placeholders while counts are loading', () => {
    render(<MappingSummaryCards counts={counts} loading />);
    expect(screen.getAllByText('—')).toHaveLength(7);
    expect(screen.queryByText('10')).not.toBeInTheDocument();
  });

  it('renders a safe zero denominator when no options are linked', () => {
    render(<MappingSummaryCards counts={{
      products: { all: 0, linked: 0, unlinked: 0 },
      options: {
        all: 0,
        linked: 0,
        unlinked: 0,
        recipeConfirmed: 0,
        configurationRequired: 0,
        reviewRequired: 0,
      },
    }} loading={false} />);

    expect(screen.getAllByText('0 / 0')).toHaveLength(3);
  });
});
