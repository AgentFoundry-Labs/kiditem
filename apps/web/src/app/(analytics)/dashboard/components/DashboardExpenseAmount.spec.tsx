import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardExpenseAmount } from './DashboardExpenseAmount';

describe('DashboardExpenseAmount', () => {
  it('비용을 영수증처럼 마이너스 금액으로 표시한다', () => {
    render(<DashboardExpenseAmount amount={123_456} />);

    expect(screen.getByText('-123,456원')).toHaveClass('text-red-600');
  });

  it('이미 음수인 입력도 이중 부호 없이 표시한다', () => {
    render(<DashboardExpenseAmount amount={-9_900} />);

    expect(screen.getByText('-9,900원')).toBeInTheDocument();
  });
});
