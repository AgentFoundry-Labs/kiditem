import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentCommandDock } from './AgentCommandDock';
import type { AgentOfficeNode } from '../lib/agent-office-model';

const node: AgentOfficeNode = {
  id: 'agent-sourcing',
  name: 'Sourcing',
  agentType: 'sourcing',
  title: '소싱실',
  displayName: '소싱 담당',
  responsibility: '상품 후보와 공급처 신호를 수집한다.',
  status: 'idle',
  activeRunCount: 0,
  pendingApprovalCount: 0,
  lastActivityAt: null,
  trustLevel: 2,
  adapterType: 'hermes_local',
  effectiveModel: 'gpt-5.4',
  capabilities: [],
};

describe('AgentCommandDock', () => {
  it('shows selected employee context and fills a clicked quick command', () => {
    const onChange = vi.fn();
    render(
      <AgentCommandDock
        node={node}
        value=""
        pending={false}
        onChange={onChange}
        onSubmit={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('region', { name: '선택 직원 업무 지시' }),
    ).toHaveTextContent('소싱 담당');
    expect(screen.getByText('운영 총괄을 통해 업무 배정')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: '빠른 지시: 신규 상품 후보와 공급처 리스크를 정리해줘',
      }),
    );
    expect(onChange).toHaveBeenCalledWith(
      '신규 상품 후보와 공급처 리스크를 정리해줘',
    );
  });

  it('shows a clear no-selection state', () => {
    render(
      <AgentCommandDock
        node={null}
        value=""
        pending={false}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText('직원을 선택하세요')).toBeInTheDocument();
  });
});
