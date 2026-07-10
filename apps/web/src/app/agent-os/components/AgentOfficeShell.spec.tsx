import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentOfficeShell } from './AgentOfficeShell';
import type { AgentOfficeViewModel } from '../lib/agent-office-model';

const model: AgentOfficeViewModel = {
  nodes: [
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
  ],
  capabilities: [],
  activities: [],
  totals: {
    agents: 1,
    employees: 1,
    capabilities: 0,
    working: 1,
    waiting: 0,
    blocked: 0,
    pendingApprovals: 0,
    runningRuns: 1,
    totalCostMicros: '0',
  },
};

describe('AgentOfficeShell', () => {
  it('renders the office-first hierarchy and keeps system activity hidden by default', () => {
    const activityModel: AgentOfficeViewModel = {
      ...model,
      activities: [
        {
          id: 'cost-1',
          kind: 'cost',
          label: 'codex-local 42µ',
          status: 'preview-model',
          occurredAt: '2026-07-09T00:00:00.000Z',
          agentInstanceId: 'agent-manager',
        },
      ],
    };

    render(
      <AgentOfficeShell
        model={activityModel}
        selectedNodeId="agent-manager"
        command=""
        commandPending={false}
        refreshing={false}
        onSelectNode={vi.fn()}
        onCommandChange={vi.fn()}
        onSubmitCommand={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByRole('banner')).toHaveTextContent('Agent OS 사무실');
    expect(
      screen.getByRole('complementary', { name: '인력 배치' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: '직원 프로필' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: '선택 직원 업무 지시' }),
    ).toHaveTextContent('운영 총괄');
    const workspace = screen.getByTestId('agent-office-workspace');
    const staffRail = screen.getByTestId('agent-office-staff-rail');
    const viewport = screen.getByTestId('agent-office-viewport');
    const detailRail = screen.getByTestId('agent-office-detail-rail');
    const commandRow = screen.getByTestId('agent-office-command-row');
    const canvas = screen.getByTestId('agent-office-canvas');

    expect(workspace.className).toContain(
      'grid-cols-[240px_minmax(480px,1fr)_300px]',
    );
    expect(viewport).toContainElement(canvas);
    expect(staffRail).not.toContainElement(canvas);
    expect(detailRail).not.toContainElement(canvas);
    expect(commandRow).not.toContainElement(canvas);
    expect(
      screen.queryByRole('button', { name: /확대|축소|전체 보기/ }),
    ).toBeNull();
    expect(
      screen.queryByRole('region', { name: '시스템 활동 기록' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '대시보드' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(screen.queryByText('직원 채용')).not.toBeInTheDocument();
    expect(screen.queryByText('게스트 초대')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: '시스템 활동 기록 열기' }),
    );
    const themeRoot = screen.getByTestId('agent-office-theme-root');
    const activity = screen.getByRole('region', {
      name: '시스템 활동 기록',
    });
    const commandDock = screen.getByRole('region', {
      name: '선택 직원 업무 지시',
    });

    expect(activity).toHaveTextContent('codex-local 42µ');
    expect(detailRail).toContainElement(activity);
    expect(themeRoot.className).toContain('bg-slate-50');
    expect(themeRoot.className).toContain('text-slate-900');
    expect(activity.className).toContain('bg-white');
    expect(commandDock.className).toContain('bg-white');
  });

  it('preserves a null selection without falling back to the first node', () => {
    render(
      <AgentOfficeShell
        model={model}
        selectedNodeId={null}
        command=""
        commandPending={false}
        refreshing={false}
        onSelectNode={vi.fn()}
        onCommandChange={vi.fn()}
        onSubmitCommand={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText('직원을 선택하세요.')).toBeInTheDocument();
    expect(screen.getByText('직원을 선택하세요')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '운영 총괄, 집중 중' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      within(screen.getByRole('complementary', { name: '인력 배치' })).getByRole(
        'button',
        { name: /운영 총괄/ },
      ),
    ).toHaveAttribute('aria-pressed', 'false');
  });
});
