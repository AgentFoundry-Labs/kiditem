import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentInspector } from './AgentInspector';
import { AgentOfficeHeader } from './AgentOfficeHeader';
import { AgentStaffPanel } from './AgentStaffPanel';
import type { AgentOfficeViewModel } from '../lib/agent-office-model';
import { makeAgentOfficeNode } from '../test-utils/agent-office-fixtures';

const node = makeAgentOfficeNode({
  id: 'agent-manager',
  status: 'working',
  activeRunCount: 1,
  pendingApprovalCount: 1,
  lastActivityAt: '2026-07-09T00:00:00.000Z',
  trustLevel: 5,
});

const totals: AgentOfficeViewModel['totals'] = {
  agents: 1,
  employees: 1,
  capabilities: 0,
  working: 1,
  waiting: 0,
  blocked: 0,
  pendingApprovals: 1,
  runningRuns: 1,
  totalCostMicros: '0',
};

describe('Agent OS office panels', () => {
  it('exposes real header actions and dashboard navigation', () => {
    const onToggleActivity = vi.fn();
    render(
      <AgentOfficeHeader
        totals={totals}
        refreshing={false}
        activityOpen={false}
        onRefresh={vi.fn()}
        onToggleActivity={onToggleActivity}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '시스템 활동 기록 열기' }));
    expect(onToggleActivity).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: '대시보드' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('labels the left panel as staffing and changes selection', () => {
    const onSelectNode = vi.fn();
    render(
      <AgentStaffPanel
        model={{ nodes: [node], capabilities: [], activities: [], totals }}
        selectedNodeId={null}
        onSelectNode={onSelectNode}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /운영 총괄/ }));
    expect(onSelectNode).toHaveBeenCalledWith('agent-manager');
    expect(
      screen.getByRole('complementary', { name: '인력 배치' }),
    ).toBeInTheDocument();
  });

  it('shows only runtime values that really exist', () => {
    render(<AgentInspector node={node} />);

    expect(screen.getByText('gpt-5.4')).toBeInTheDocument();
    expect(screen.getByText('hermes_local')).toBeInTheDocument();
    expect(screen.getByText('신뢰 단계 5')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /모델 변경/ })).not.toBeInTheDocument();
  });

  it('makes missing runtime configuration explicit', () => {
    render(
      <AgentInspector
        node={{ ...node, effectiveModel: '', adapterType: '' }}
      />,
    );

    expect(screen.getAllByText('미지정')).toHaveLength(2);
  });

  it('keeps an uninstalled employee visible and labels the missing setup', () => {
    const uninstalled = makeAgentOfficeNode({
      id: 'sourcing',
      instanceId: null,
      name: 'Sourcing',
      agentType: 'sourcing',
      displayName: '소싱 담당',
      responsibility: '상품 후보와 공급처 신호를 수집한다.',
      configurationStatus: 'instance_missing',
      status: 'offline',
      trustLevel: null,
      adapterType: null,
      effectiveModel: null,
    });

    render(
      <>
        <AgentStaffPanel
          model={{
            nodes: [uninstalled],
            capabilities: [],
            activities: [],
            totals: { ...totals, working: 0 },
          }}
          selectedNodeId="sourcing"
          onSelectNode={vi.fn()}
        />
        <AgentInspector node={uninstalled} />
      </>,
    );

    expect(screen.getAllByText('설정 필요').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: /소싱 담당/ })).toBeInTheDocument();
    expect(screen.getAllByText('미지정').length).toBeGreaterThanOrEqual(2);
  });

  it('uses Dashboard light surfaces and purple staff selection', () => {
    render(
      <>
        <AgentOfficeHeader
          totals={totals}
          refreshing={false}
          activityOpen={false}
          onRefresh={vi.fn()}
          onToggleActivity={vi.fn()}
        />
        <AgentStaffPanel
          model={{ nodes: [node], capabilities: [], activities: [], totals }}
          selectedNodeId="agent-manager"
          onSelectNode={vi.fn()}
        />
        <AgentInspector node={node} />
      </>,
    );

    const header = screen.getByRole('banner');
    const staff = screen.getByRole('complementary', { name: '인력 배치' });
    const profile = screen.getByRole('complementary', {
      name: '직원 프로필',
    });
    const selectedStaff = screen.getByRole('button', { name: /운영 총괄/ });

    expect(header.className).toContain('bg-white');
    expect(header.className).toContain('border-slate-200');
    expect(staff.className).toContain('bg-white');
    expect(profile.className).toContain('bg-white');
    expect(selectedStaff.className).toContain('bg-purple-50');
    expect(
      [header, staff, profile].every(
        (element) => !element.className.includes('bg-slate-950'),
      ),
    ).toBe(true);
  });
});
