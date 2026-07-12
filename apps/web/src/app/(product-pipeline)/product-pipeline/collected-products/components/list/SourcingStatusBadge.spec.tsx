import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SourcingStatusBadge from './SourcingStatusBadge';

describe('SourcingStatusBadge', () => {
  it('renders only sourcing-owned candidate states', () => {
    const { rerender } = render(<SourcingStatusBadge status="sourced" />);
    expect(screen.getByText('소싱 완료')).toBeInTheDocument();

    rerender(<SourcingStatusBadge status="rejected" />);
    expect(screen.getByText('반려됨')).toBeInTheDocument();

    rerender(<SourcingStatusBadge status={'promoted' as never} />);
    expect(screen.queryByText('제품 등록됨')).not.toBeInTheDocument();
  });
});
