import { act, render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRocketOrderActivity } from '../hooks/useRocketOrderActivity';
import { RocketOrderActivityPanel } from './RocketOrderActivityPanel';

describe('Rocket order activity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T01:02:03.000Z'));
  });

  it('keeps newest events first and caps the page session at 50', () => {
    const { result } = renderHook(useRocketOrderActivity);

    act(() => {
      for (let index = 0; index < 55; index += 1) {
        result.current.record({ status: 'succeeded', message: `작업 ${index}` });
      }
    });

    expect(result.current.events).toHaveLength(50);
    expect(result.current.events[0]?.message).toBe('작업 54');
    expect(result.current.events.at(-1)?.message).toBe('작업 5');
  });

  it('renders operation time, status, and message', () => {
    render(<RocketOrderActivityPanel events={[{
      id: 'event-1',
      status: 'failed',
      message: '저장 수집본을 불러오지 못했습니다.',
      occurredAt: '2026-07-18T01:02:03.000Z',
    }]} />);

    expect(screen.getByRole('log')).toHaveTextContent('저장 수집본을 불러오지 못했습니다.');
    expect(screen.getByText('실패')).toBeInTheDocument();
  });
});
