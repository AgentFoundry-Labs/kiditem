import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MappingSummaryCards } from '../MappingSummaryCards';

const counts = {
  products: { all: 10, unmatched: 6, matched: 4 },
  options: { all: 20, unmatched: 8, matched: 7, configurationRequired: 3, reviewRequired: 2 },
};

describe('MappingSummaryCards', () => {
  it('separates product links, option links, and inherited recipe attention', () => {
    render(<MappingSummaryCards counts={counts} loading={false} />);
    expect(screen.getByText('전체 채널 상품')).toBeInTheDocument();
    expect(screen.getByText('미매칭 상품')).toBeInTheDocument();
    expect(screen.getByText('전체 채널 옵션')).toBeInTheDocument();
    expect(screen.getByText('연결 완료 옵션')).toBeInTheDocument();
    expect(screen.getByText('레시피 확인 필요')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('uses placeholders while counts are loading', () => {
    render(<MappingSummaryCards counts={counts} loading />);
    expect(screen.getAllByText('—')).toHaveLength(5);
    expect(screen.queryByText('10')).not.toBeInTheDocument();
  });
});
