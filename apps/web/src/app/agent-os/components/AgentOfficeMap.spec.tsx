import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentOfficeMap } from './AgentOfficeMap';
import type { AgentOfficeNode } from '../lib/agent-office-model';

const nodes: AgentOfficeNode[] = [
  {
    id: 'agent-manager',
    name: 'Operator',
    agentType: 'manager',
    title: '대표실',
    displayName: '운영 총괄',
    responsibility: '운영 우선순위, 위임, 승인 흐름을 총괄한다.',
    status: 'working',
    activeRunCount: 1,
    pendingApprovalCount: 0,
    lastActivityAt: '2026-07-09T00:00:00.000Z',
    trustLevel: 1,
    adapterType: 'hermes_local',
    effectiveModel: 'gpt-5.1-codex',
    capabilities: [],
  },
  {
    id: 'agent-qa',
    name: 'QA',
    agentType: 'reviewer',
    title: '검수실',
    displayName: '검수 담당',
    responsibility: '검수 업무를 수행한다.',
    status: 'idle',
    activeRunCount: 0,
    pendingApprovalCount: 0,
    lastActivityAt: '2026-07-09T01:00:00.000Z',
    trustLevel: 1,
    adapterType: 'hermes_local',
    effectiveModel: 'gpt-5.1-codex',
    capabilities: [],
  },
];

describe('AgentOfficeMap', () => {
  it('renders staff nodes and notifies selection', () => {
    const onSelectNode = vi.fn();

    render(
      <AgentOfficeMap
        nodes={nodes}
        selectedNodeId={null}
        onSelectNode={onSelectNode}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /운영 총괄/ }));
    expect(onSelectNode).toHaveBeenCalledWith('agent-manager');
  });

  it('renders the generated office scene behind interactive staff nodes', () => {
    render(
      <AgentOfficeMap
        nodes={nodes}
        selectedNodeId={null}
        onSelectNode={vi.fn()}
      />,
    );

    expect(screen.getByRole('region', { name: '운영 캔버스' })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Agent OS 가상 사무공간' }),
    ).toHaveAttribute('src', expect.stringContaining('office-floor.png'));
    expect(screen.getByText('대표실')).toBeInTheDocument();
    expect(screen.getByText('콘텐츠 실험실')).toBeInTheDocument();
    expect(screen.getByText('운영 광장')).toBeInTheDocument();
  });

  it('keeps a true no-selection state when selectedNodeId is null', () => {
    render(
      <AgentOfficeMap
        nodes={nodes}
        selectedNodeId={null}
        onSelectNode={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /운영 총괄/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: /검수 담당/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

});
