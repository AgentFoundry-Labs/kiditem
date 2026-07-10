import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentOfficeMap } from './AgentOfficeMap';
import type {
  AgentOfficeActivity,
  AgentOfficeNode,
} from '../lib/agent-office-model';

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
    id: 'agent-ad-strategy',
    name: 'Ad Strategy',
    agentType: 'ad_strategy',
    title: '광고 전략실',
    displayName: '광고 전략 담당',
    responsibility: '광고 성과 신호를 분석하고 운영 전략을 제안한다.',
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

const activities: AgentOfficeActivity[] = [
  {
    id: 'run-1',
    kind: 'run',
    label: '실행 running',
    status: 'running',
    occurredAt: '2026-07-09T02:00:00.000Z',
    agentInstanceId: 'agent-manager',
  },
];

describe('AgentOfficeMap', () => {
  it('renders the interactive floor, employee avatars, and shared selection', () => {
    const onSelectNode = vi.fn();

    render(
      <AgentOfficeMap
        nodes={nodes}
        activities={activities}
        selectedNodeId={null}
        onSelectNode={onSelectNode}
      />,
    );

    expect(screen.getByTestId('agent-office-scene')).toBeInTheDocument();
    expect(screen.getByTestId('office-floor-svg')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '운영 총괄 책상' }));
    fireEvent.click(screen.getByRole('button', { name: '운영 총괄, 집중 중' }));

    expect(onSelectNode).toHaveBeenNthCalledWith(1, 'agent-manager');
    expect(onSelectNode).toHaveBeenNthCalledWith(2, 'agent-manager');
  });

  it('keeps a true no-selection state', () => {
    render(
      <AgentOfficeMap
        nodes={nodes}
        activities={activities}
        selectedNodeId={null}
        onSelectNode={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: '운영 총괄, 집중 중' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByRole('button', { name: '광고 전략 담당, 준비됨' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders an empty office without inventing employee avatars', () => {
    render(
      <AgentOfficeMap
        nodes={[]}
        activities={[]}
        selectedNodeId={null}
        onSelectNode={vi.fn()}
      />,
    );

    expect(screen.getByTestId('office-floor-svg')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /집중 중|대기 중|승인 필요|준비됨|오프라인/,
      }),
    ).not.toBeInTheDocument();
  });
});
