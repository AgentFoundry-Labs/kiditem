import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CategoriesPanel } from './CategoriesPanel';

describe('CategoriesPanel', () => {
  it('shows measured category totals, counting products rather than orders, and renders unavailable ones as -', () => {
    render(
      <CategoriesPanel
        categories={[
          { category: '유아용품', name: '유아용품', revenue: 32_000, orders: 3, profit: 11_800, productCount: 1 },
          { category: '완구', name: '완구', revenue: null, orders: null, profit: null, productCount: null },
        ]}
        page={1}
        onPageChange={vi.fn()}
      />,
    );

    const cellTexts = (name: string) => within(screen.getByRole('row', { name: new RegExp(name) }))
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cellTexts('유아용품')).toEqual(['유아용품', '1개', '32,000원', '11,800원']);
    expect(cellTexts('완구')).toEqual(['완구', '-', '-', '-']);
  });
});
