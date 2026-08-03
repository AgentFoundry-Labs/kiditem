import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RocketDeterministicMatchingPanel } from './RocketDeterministicMatchingPanel';

describe('<RocketDeterministicMatchingPanel />', () => {
  it('routes direct channel option inventory matching to the shared matching center', () => {
    render(<RocketDeterministicMatchingPanel channelAccountId="11111111-1111-4111-8111-111111111111" />);

    expect(screen.getByText(/판매 1개당 Sellpia 재고 차감 수량/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '상품 매칭 센터' })).toHaveAttribute(
      'href',
      '/product-hub/matching?channelAccountId=11111111-1111-4111-8111-111111111111',
    );
  });
});
