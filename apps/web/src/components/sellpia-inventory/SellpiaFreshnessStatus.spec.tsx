import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SellpiaFreshnessStatus } from './SellpiaFreshnessStatus';

describe('SellpiaFreshnessStatus', () => {
  it.each([
    ['fresh', '최신'],
    ['refresh_required', '갱신 필요'],
    ['syncing', '갱신 중'],
    ['failed', '실패'],
  ] as const)('renders %s as %s with age and opens the one shared drawer', (status, label) => {
    const onOpen = vi.fn();
    render(
      <SellpiaFreshnessStatus
        status={status}
        lastVerifiedAt="2026-07-16T00:00:00.000Z"
        now={new Date('2026-07-16T00:05:00.000Z')}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText('5분 전')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
