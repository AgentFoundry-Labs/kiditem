import type { ReactElement, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { AgentApprovalCard } from '../AgentApprovalCard';
import { AgentArtifactCard } from '../AgentArtifactCard';
import { AgentDelegationCard } from '../AgentDelegationCard';
import { AgentProgressCard } from '../AgentProgressCard';
import {
  OfficialInteractionInterrupts,
  officialInteractionActivityRenderers,
} from '../OfficialInteractionRenderers';
import { InteractionHeader } from '../InteractionHeader';

const push = vi.hoisted(() => vi.fn());
const interruptConfig = vi.hoisted(() => ({
  current: null as null | Record<string, unknown>,
}));

vi.mock('@/lib/api-client', () => ({ apiClient: { post: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@copilotkit/react-core/v2', () => ({
  useInterrupt: (config: Record<string, unknown>) => {
    interruptConfig.current = config;
  },
}));

const SESSION = 'organizations/org-1/agentSessions/session-1';
const TASK = `${SESSION}/tasks/task-1`;
const EXECUTION = `${SESSION}/executions/execution-1`;
const OPERATOR_VERSION = 'agentDefinitions/operator/versions/v1';
const ANALYST_VERSION = 'agentDefinitions/analyst/versions/v2';

const progress = {
  name: 'kiditem.ui.agent_progress.v1',
  session: SESSION,
  task: TASK,
  execution: EXECUTION,
  status: 'running',
  progress: 0.4,
  label: '상품 근거 확인 중',
  updatedAt: '2026-08-14T00:00:00.000Z',
} as const;

const approval = {
  name: 'kiditem.ui.agent_approval.v1',
  approvalId: '11111111-1111-4111-8111-111111111111',
  session: SESSION,
  task: TASK,
  execution: EXECUTION,
  capabilityKey: 'inventory.adjust',
  summary: '재고 수량을 조정합니다.',
  resourceVersions: [{ resourceType: 'inventory_item', resourceId: 'item-1', version: '7' }],
  expiresAt: '2099-08-14T00:00:00.000Z',
} as const;

const artifact = {
  name: 'kiditem.ui.agent_artifact.v1',
  artifactId: '22222222-2222-4222-8222-222222222222',
  session: SESSION,
  task: TASK,
  execution: EXECUTION,
  artifactType: 'listing_draft',
  label: '상품 등록 초안',
  sha256: 'a'.repeat(64),
  navigationActionId: '33333333-3333-4333-8333-333333333333',
  createdAt: '2026-08-14T00:00:00.000Z',
} as const;

const delegation = {
  name: 'kiditem.ui.agent_delegation.v1',
  session: SESSION,
  parentTask: TASK,
  childTask: `${SESSION}/tasks/task-2`,
  fromAgentVersion: OPERATOR_VERSION,
  toAgentVersion: ANALYST_VERSION,
  status: 'running',
  createdAt: '2026-08-14T00:00:00.000Z',
} as const;

describe('official durable interaction renderers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    interruptConfig.current = null;
  });

  it('registers and renders the same canonical progress activity without cancelling on unmount', () => {
    const renderer = activityRenderer('kiditem.ui.agent_progress.v1');
    const result = renderActivity(renderer, progress);

    expect(screen.getByTestId('agent-task-task-1')).toHaveTextContent('실행 중');
    expect(screen.getByText('상품 근거 확인 중')).toBeVisible();
    result.unmount();

    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('shows retry, resume, and cancel only for their server-visible task states', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({});
    const { rerender } = renderWithQuery(<AgentProgressCard event={{ ...progress, status: 'failed' }} />);

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      '/api/agent-os/sessions/session-1/tasks/task-1/retry',
      expect.objectContaining({ expectedStatus: 'failed' }),
    ));
    expect(screen.queryByRole('button', { name: '재개' })).not.toBeInTheDocument();

    rerender(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <AgentProgressCard event={{ ...progress, status: 'paused' }} />
    </QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: '재개' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      '/api/agent-os/sessions/session-1/tasks/task-1/resume',
      expect.objectContaining({ expectedStatus: 'paused' }),
    ));
    expect(screen.getByRole('button', { name: '취소' })).toBeVisible();
  });

  it('uses the standard CopilotKit interrupt boundary for a parsed approval and keeps expiry disabled', async () => {
    const resolve = vi.fn().mockResolvedValue(undefined);
    render(<OfficialInteractionInterrupts />);
    const config = interruptConfig.current as {
      render: (props: Record<string, unknown>) => ReactElement;
    };
    const card = config.render({
      event: { name: 'on_interrupt', value: { id: approval.approvalId, metadata: { approval } } },
      interrupt: { id: approval.approvalId, metadata: { approval } },
      interrupts: [],
      resolve,
      cancel: vi.fn(),
      result: null,
    });
    const { rerender } = render(card);

    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'kiditem.agent_approval_decision.v1',
      approvalId: approval.approvalId,
      decision: 'approved',
      session: SESSION,
    }));
    fireEvent.click(screen.getByRole('button', { name: '거절' }));
    expect(resolve).toHaveBeenCalledTimes(1);

    rerender(<AgentApprovalCard approval={{ ...approval, expiresAt: '2020-01-01T00:00:00.000Z' }} onDecision={vi.fn()} />);
    expect(screen.getByRole('button', { name: '승인' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '거절' })).toBeDisabled();
    expect(screen.getByText('승인 요청이 만료되었습니다.')).toBeVisible();
  });

  it('renders delegation lineage and authorizes artifact navigation with only its action id', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ href: '/agent-os' });
    renderWithQuery(
      <>
        <AgentDelegationCard event={delegation} />
        <AgentArtifactCard event={artifact} />
      </>,
    );

    expect(screen.getByTestId('agent-delegation-task-2')).toHaveTextContent('operator');
    expect(screen.getByTestId('agent-delegation-task-2')).toHaveTextContent('analyst');
    fireEvent.click(screen.getByRole('button', { name: '상품 등록 초안 열기' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/agent-os'));
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/agent-os/interaction/actions/authorize',
      { actionId: artifact.navigationActionId },
    );
  });

  it('falls back to bounded text for an invalid registered durable payload', () => {
    const renderer = activityRenderer('kiditem.ui.agent_progress.v1');
    renderActivity(renderer, { textFallback: '안전한 대체 설명입니다.', arbitraryComponent: 'Dangerous' });

    expect(screen.getByText('안전한 대체 설명입니다.')).toBeVisible();
    expect(screen.queryByText('Dangerous')).not.toBeInTheDocument();
  });

  it('keeps the immutable primary agent selection locked for an existing session', () => {
    render(
      <InteractionHeader
        agents={[{
          agentDefinitionKey: 'operator',
          agentVersion: OPERATOR_VERSION,
          displayName: '운영 에이전트',
          description: '운영',
          isDefault: true,
        }]}
        agentId="operator"
        agentLocked
        sessions={[]}
        selectedSession={null}
        connectionLabel="연결됨"
        onAgentChange={vi.fn()}
        onNewConversation={vi.fn()}
        onSessionSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: '에이전트' })).toBeDisabled();
  });
});

function activityRenderer(activityType: string) {
  const renderer = officialInteractionActivityRenderers.find(
    (candidate) => candidate.activityType === activityType,
  );
  if (!renderer) throw new Error(`Missing activity renderer: ${activityType}`);
  return renderer;
}

function renderActivity(
  renderer: ReturnType<typeof activityRenderer>,
  content: unknown,
) {
  const Render = renderer.render;
  return renderWithQuery(
    <Render
      activityType={renderer.activityType}
      content={content as never}
      message={{ id: 'activity-1', role: 'activity', activityType: renderer.activityType, content: {} }}
      agent={undefined}
    />,
  );
}

function renderWithQuery(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
