import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TabLayout from '../TabLayout';

function buildTabs(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `tab-${index + 1}`,
    label: `탭 ${index + 1}`,
    content: <div>content {index + 1}</div>,
  }));
}

describe('<TabLayout>', () => {
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
