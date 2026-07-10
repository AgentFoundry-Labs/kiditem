import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentCommandBar } from './AgentCommandBar';

describe('AgentCommandBar', () => {
  it('submits non-empty commands', () => {
    const onSubmit = vi.fn();

    render(
      <AgentCommandBar
        targetName="소싱 담당"
        value="소싱 현황 알려줘"
        pending={false}
        onChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.submit(screen.getByRole('form', { name: '업무 지시' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('exposes an accessible name on the command input', () => {
    render(
      <AgentCommandBar
        targetName="소싱 담당"
        value=""
        pending={false}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole('textbox', { name: '업무 지시 입력' })).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        '운영 총괄을 통해 소싱 담당에게 맡길 업무를 입력하세요',
      ),
    ).toBeInTheDocument();
  });

  it('disables submit while blank or pending', () => {
    const { rerender } = render(
      <AgentCommandBar
        targetName={null}
        value=" "
        pending={false}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '전송' })).toBeDisabled();

    rerender(
      <AgentCommandBar
        targetName={null}
        value="발주 확인"
        pending
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '전송' })).toBeDisabled();
  });

  it('uses a light input and Dashboard primary send action', () => {
    render(
      <AgentCommandBar
        targetName="소싱 담당"
        value="소싱 현황 알려줘"
        pending={false}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('textbox', { name: '업무 지시 입력' }).className,
    ).toContain('bg-slate-50');
    expect(screen.getByRole('button', { name: '전송' }).className).toContain(
      'bg-purple-600',
    );
  });
});
