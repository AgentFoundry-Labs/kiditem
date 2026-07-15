import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from '../Pagination';

describe('<Pagination>', () => {
  it('labels and wires first, previous, next and last page controls', () => {
    const onPageChange = vi.fn();
    render(
      <Pagination page={3} limit={10} total={80} onPageChange={onPageChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '첫 페이지' }));
    fireEvent.click(screen.getByRole('button', { name: '이전 페이지' }));
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
    fireEvent.click(screen.getByRole('button', { name: '마지막 페이지' }));

    expect(onPageChange.mock.calls.map(([page]) => page)).toEqual([1, 2, 4, 8]);
  });

  it('disables boundary controls at the first and last pages', () => {
    const { rerender } = render(
      <Pagination page={1} limit={10} total={20} onPageChange={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: '첫 페이지' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '이전 페이지' })).toBeDisabled();

    rerender(<Pagination page={2} limit={10} total={20} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '마지막 페이지' })).toBeDisabled();
  });
});
