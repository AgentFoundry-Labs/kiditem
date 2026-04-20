import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import SortableHeader from '../SortableHeader';

describe('<SortableHeader>', () => {
  it('renders label + aria-sort none by default', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableHeader<'revenue'> field="revenue" label="매출" activeField={null} direction={null} onSort={() => {}} />
          </tr>
        </thead>
      </table>
    );
    const th = screen.getByRole('columnheader', { name: /매출/ });
    expect(th).toHaveAttribute('aria-sort', 'none');
  });

  it('shows aria-sort ascending when active asc', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableHeader<'revenue'> field="revenue" label="매출" activeField="revenue" direction="asc" onSort={() => {}} />
          </tr>
        </thead>
      </table>
    );
    const th = screen.getByRole('columnheader', { name: /매출/ });
    expect(th).toHaveAttribute('aria-sort', 'ascending');
  });

  it('shows aria-sort descending when active desc', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableHeader<'revenue'> field="revenue" label="매출" activeField="revenue" direction="desc" onSort={() => {}} />
          </tr>
        </thead>
      </table>
    );
    const th = screen.getByRole('columnheader', { name: /매출/ });
    expect(th).toHaveAttribute('aria-sort', 'descending');
  });

  it('invokes onSort with field on click', async () => {
    const onSort = vi.fn();
    render(
      <table>
        <thead>
          <tr>
            <SortableHeader<'revenue'> field="revenue" label="매출" activeField={null} direction={null} onSort={onSort} />
          </tr>
        </thead>
      </table>
    );
    await userEvent.click(screen.getByRole('button', { name: /매출/ }));
    expect(onSort).toHaveBeenCalledWith('revenue');
  });
});
