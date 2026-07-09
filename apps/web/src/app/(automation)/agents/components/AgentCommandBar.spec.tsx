import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentCommandBar } from './AgentCommandBar';

describe('AgentCommandBar', () => {
  it('submits non-empty commands', () => {
    const onSubmit = vi.fn();

    render(
      <AgentCommandBar
        value="소싱 현황 알려줘"
        pending={false}
        onChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.submit(screen.getByRole('form', { name: 'Agent command' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('disables submit while blank or pending', () => {
    const { rerender } = render(
      <AgentCommandBar value=" " pending={false} onChange={vi.fn()} onSubmit={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: '전송' })).toBeDisabled();

    rerender(
      <AgentCommandBar value="발주 확인" pending onChange={vi.fn()} onSubmit={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: '전송' })).toBeDisabled();
  });
});
