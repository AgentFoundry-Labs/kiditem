import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentInteractionSurface } from '../AgentInteractionSurface';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
const addMessage = vi.fn();
const runAgent = vi.fn(async () => undefined);
vi.mock('@copilotkit/react-core/v2', () => ({
  useAgent: () => ({ agent: { messages: [], addMessage }, isReady: true }),
  useCopilotKit: () => ({ copilotkit: { runAgent } }),
}));

describe('AgentInteractionSurface durable projection', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/agent-os');
    vi.clearAllMocks();
  });

  it('runs the first durable prompt through CopilotKit and renders only future in-memory messages', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ session: { id: expect.any(String) }, tasks: [{ id: 'task-1', parentTaskId: null, objective: 'collect signals', status: 'open', presentation: 'running', summary: 'Durable result', error: { message: 'bounded error' }, resourceRefs: [{ kind: 'candidate', id: 'candidate-1' }], operationRefs: [{ kind: 'operation', id: 'run-1', status: 'running' }], latestAttempt: { id: 'attempt-1', ordinal: 1, status: 'running' } }] } as never);
    const user = userEvent.setup();
    render(<AgentInteractionSurface />);
    await user.type(screen.getByPlaceholderText('Ask Operator to begin work'), 'collect signals');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await vi.waitFor(() => expect(addMessage).toHaveBeenCalledWith(expect.objectContaining({ role: 'user', content: 'collect signals' })));
    expect(runAgent).toHaveBeenCalledWith(expect.objectContaining({ agent: expect.any(Object) }));
    expect(apiClient.post).not.toHaveBeenCalledWith('/api/agent-work/start', expect.anything());
    expect(screen.getByText('collect signals')).toBeVisible();
    expect(screen.getByText('Durable result')).toBeVisible();
    expect(screen.getByText('bounded error')).toBeVisible();
    expect(screen.getByText(/candidate:candidate-1/)).toBeVisible();
    expect(screen.getByText(/operation:run-1/)).toBeVisible();
    expect(screen.getByText(/past chat is never replayed/i)).toBeVisible();
  });

  it('routes continue, interrupt, cancel, and terminal deletion to durable actions', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ session: { id: expect.any(String) }, tasks: [{ id: 'task-1', objective: 'work', status: 'open', presentation: 'needs_continue', latestAttempt: { id: 'attempt-1', ordinal: 1, status: 'running' } }] } as never);
    const user = userEvent.setup(); render(<AgentInteractionSurface />);
    await user.type(screen.getByPlaceholderText('Ask Operator to begin work'), 'work'); await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Interrupt' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const sessionPath = expect.stringMatching(/^\/api\/agent-work\/sessions\/[0-9a-f-]{36}\//);
    expect(apiClient.post).toHaveBeenCalledWith(sessionPath, { predecessorAttemptId: 'attempt-1', prompt: 'Continue the durable work with the current state.' });
    expect(apiClient.post).toHaveBeenCalledWith(sessionPath, undefined);
  });

  it('recovers a selected durable session projection after remounting from the URL', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000010';
    window.history.replaceState(null, '', `/agent-os?agentSessionId=${sessionId}`);
    vi.mocked(apiClient.get).mockResolvedValue({
      session: { id: sessionId },
      tasks: [{ id: 'task-1', parentTaskId: null, objective: 'durable work', status: 'completed', presentation: 'completed', latestAttempt: { id: 'attempt-1', ordinal: 1, status: 'succeeded' } }],
    } as never);

    const first = render(<AgentInteractionSurface />);
    await vi.waitFor(() => expect(apiClient.get).toHaveBeenCalledWith(`/api/agent-work/sessions/${sessionId}`));
    expect(await screen.findByText('durable work')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeVisible();
    first.unmount();

    render(<AgentInteractionSurface />);
    await vi.waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('durable work')).toBeVisible();
  });

  it('clears the selected session URL coordinate for new and deleted terminal work', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000011';
    window.history.replaceState(null, '', `/agent-os?agentSessionId=${sessionId}`);
    vi.mocked(apiClient.get).mockResolvedValue({
      session: { id: sessionId },
      tasks: [{ id: 'task-1', parentTaskId: null, objective: 'terminal work', status: 'completed', presentation: 'completed', latestAttempt: { id: 'attempt-1', ordinal: 1, status: 'succeeded' } }],
    } as never);
    const user = userEvent.setup();

    render(<AgentInteractionSurface />);
    await user.click(await screen.findByRole('button', { name: 'New task' }));
    expect(new URLSearchParams(window.location.search).get('agentSessionId')).toBeNull();

    window.history.replaceState(null, '', `/agent-os?agentSessionId=${sessionId}`);
    render(<AgentInteractionSurface />);
    await user.click(await screen.findByRole('button', { name: 'Delete terminal session' }));
    await vi.waitFor(() => expect(new URLSearchParams(window.location.search).get('agentSessionId')).toBeNull());
  });
});
