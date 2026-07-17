import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TabLayout from '../TabLayout';

function buildTabs(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `tab-${index + 1}`,
    label: `탭 ${index + 1}`,
    content: <div>content {index + 1}</div>,
  }));
}

describe('<TabLayout>', () => {
  it('unmounts inactive tab content when requested', () => {
    render(
      <TabLayout
        title="운영"
        tabs={buildTabs(2)}
        activeTab="tab-1"
        onTabChange={vi.fn()}
        unmountInactive
      />,
    );

    expect(screen.getByText('content 1')).toBeInTheDocument();
    expect(screen.queryByText('content 2')).not.toBeInTheDocument();
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('uses accessible tabs and moves focus and selection with arrow, Home and End keys', () => {
    render(<TabLayout title="운영" tabs={buildTabs(3)} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');

    tabs[0]?.focus();
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(tabs[1]!, { key: 'End' });
    expect(tabs[2]).toHaveFocus();
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(tabs[2]!, { key: 'ArrowLeft' });
    expect(tabs[1]).toHaveFocus();

    fireEvent.keyDown(tabs[1]!, { key: 'Home' });
    expect(tabs[0]).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      tabs[0]?.id,
    );
  });

  it('keeps inactive panels mounted by default for existing consumers', () => {
    render(<TabLayout title="운영" tabs={buildTabs(2)} />);

    expect(screen.getByText('content 1')).toBeInTheDocument();
    expect(screen.getByText('content 2')).toBeInTheDocument();
    expect(screen.getAllByRole('tabpanel', { hidden: true })).toHaveLength(2);
  });

  it('can wrap tabs without a horizontal scroll container', () => {
    render(<TabLayout title="테스트" tabs={buildTabs(8)} wrapTabs />);

    const tabContainer = screen.getByTestId('tab-layout-tabs');

    expect(tabContainer).toHaveClass('flex-wrap');
    expect(tabContainer).toHaveClass('overflow-hidden');
    expect(tabContainer).not.toHaveClass('overflow-x-auto');
    expect(screen.queryByLabelText('이전 탭')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('다음 탭')).not.toBeInTheDocument();
  });
});
