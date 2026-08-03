import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { productAbcEvaluation } from '@/test/fixtures/product-abc';
import { ProductAbcBadge } from './ProductAbcBadge';

describe('ProductAbcBadge', () => {
  it('renders the published automatic grade and its reliability', () => {
    render(<ProductAbcBadge grade="A" evaluation={productAbcEvaluation()} showConfidence />);

    expect(screen.getByText('A등급')).toBeInTheDocument();
    expect(screen.getByText('신뢰도 80%')).toBeInTheDocument();
    expect(screen.getByLabelText('A등급')).toBeInTheDocument();
  });

  it('uses calculation state before publication and preserves the last grade when a source is stale', () => {
    const { rerender } = render(
      <ProductAbcBadge
        grade={null}
        evaluation={productAbcEvaluation({
          abcGrade: null,
          calculationStatus: 'INSUFFICIENT_EVIDENCE',
          formula: null,
          rawScore: null,
          adjustedScore: null,
          reliability: null,
          weightedContributionProfit: null,
        })}
      />,
    );
    expect(screen.getByText('미분류')).toBeInTheDocument();

    rerender(<ProductAbcBadge grade="B" evaluation={productAbcEvaluation({
      abcGrade: 'B', calculationStatus: 'SELLPIA_SOURCE_STALE',
    })} />);
    expect(screen.getByText('B등급')).toBeInTheDocument();
    expect(screen.queryByText('셀피아 갱신 필요')).not.toBeInTheDocument();
  });
});
