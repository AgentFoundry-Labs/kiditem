import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { productAbcEvaluation } from '@/test/fixtures/product-abc';
import { ProductAbcBadge } from './ProductAbcBadge';

describe('ProductAbcBadge', () => {
  it('renders the published automatic grade and its economic score', () => {
    render(<ProductAbcBadge grade="A" evaluation={productAbcEvaluation()} showConfidence />);

    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('경제점수 82')).toBeInTheDocument();
    expect(screen.getByLabelText('A등급')).toBeInTheDocument();
  });

  it('uses calculation state before publication and preserves the last grade when a source is stale', () => {
    const { rerender } = render(
      <ProductAbcBadge
        grade={null}
        evaluation={null}
      />,
    );
    expect(screen.getByText('미분류')).toBeInTheDocument();

    rerender(<ProductAbcBadge grade="B" evaluation={productAbcEvaluation({ abcGrade: 'B' })} />);
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.queryByText('셀피아 갱신 필요')).not.toBeInTheDocument();
  });

  it('uses distinct, legible tones for A, B, and C grades in dense lists', () => {
    const { rerender } = render(
      <ProductAbcBadge grade="A" evaluation={productAbcEvaluation()} compact />,
    );
    expect(screen.getByText('A')).toHaveClass(
      'bg-emerald-100',
      'text-emerald-800',
      'text-lg',
    );

    rerender(<ProductAbcBadge grade="B" evaluation={productAbcEvaluation()} compact />);
    expect(screen.getByText('B')).toHaveClass(
      'bg-amber-100',
      'text-amber-800',
    );

    rerender(<ProductAbcBadge grade="C" evaluation={productAbcEvaluation()} compact />);
    expect(screen.getByText('C')).toHaveClass(
      'bg-rose-100',
      'text-rose-800',
    );
  });
});
