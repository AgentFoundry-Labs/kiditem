import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { AgentInteractionSurface } from '../AgentInteractionSurface';
import {
  closeInteraction,
  openInteraction,
  useInteractionSurfaceState,
} from '../interaction-surface-state';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
type TestAgentMessage = { id: string; role: string; content: string };
const agentMessages: TestAgentMessage[] = [];
const addMessage = vi.fn((message: TestAgentMessage) => {
  agentMessages.push(message);
});
const setMessages = vi.fn((messages: TestAgentMessage[]) => {
  agentMessages.splice(0, agentMessages.length, ...messages);
});
const runAgent = vi.fn(async () => undefined);
const useAgentMock = vi.fn();
type CustomEventSubscriber = (input: {
  event: { type: string; name: string; value: unknown };
}) => void | Promise<unknown>;
let customEventSubscriber: CustomEventSubscriber | null = null;
const subscribe = vi.fn((subscriber: { onCustomEvent?: CustomEventSubscriber }) => {
  const callback = subscriber.onCustomEvent ?? null;
  customEventSubscriber = callback;
  return {
    unsubscribe: () => {
      if (customEventSubscriber === callback) customEventSubscriber = null;
    },
  };
});
const agent = { messages: agentMessages, addMessage, setMessages, subscribe };
vi.mock('@copilotkit/react-core/v2', () => ({
  useAgent: (input: unknown) => {
    useAgentMock(input);
    return { agent, isReady: true };
  },
  useCopilotKit: () => ({ copilotkit: { runAgent } }),
}));

describe('AgentInteractionSurface durable projection', () => {
  beforeEach(() => {
    agentMessages.splice(0);
    addMessage.mockClear();
    setMessages.mockClear();
    runAgent.mockReset().mockResolvedValue(undefined);
    useAgentMock.mockReset();
    subscribe.mockClear();
    customEventSubscriber = null;
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.post).mockReset();
    window.history.replaceState(null, '', '/agent-os');
    resetInteractionSurface();
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/agent-os');
    resetInteractionSurface();
    vi.clearAllMocks();
  });

  it('renders Continue from Task and Attempt facts and never starts terminal work after refresh', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000030';
    window.history.replaceState(null, '', `/agent-os?agentSessionId=${sessionId}`);
    vi.mocked(apiClient.get).mockResolvedValue({
      session: { id: sessionId },
      tasks: [{
        id: 'task-terminal',
        parentTaskId: null,
        agentDefinitionKey: 'operator',
        objective: 'durable terminal work',
        status: 'completed',
        latestAttempt: { id: 'attempt-terminal', ordinal: 1, status: 'succeeded' },
      }],
    } as never);

    const user = userEvent.setup();
    render(<AgentInteractionSurface />);

    expect(await screen.findByText('durable terminal work')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reopen' })).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Ask Operator to begin work'), 'do not start automatically');
    expect(screen.getByRole('button', { name: 'Send follow-up' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Send follow-up' }));
    expect(runAgent).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('does not retain presentation or needs_continue branching in interaction UI source', () => {
    for (const filename of ['AgentInteractionTaskList.tsx', 'useAgentInteraction.ts']) {
      const source = readFileSync(
        resolve(process.cwd(), 'src/components/agent-interaction', filename),
        'utf8',
      );
      expect(source).not.toContain('presentation');
      expect(source).not.toContain('needs_continue');
    }
  });

  it('requires explicit Reopen for a cancelled Task and derives it from Task and Attempt facts', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000031';
    window.history.replaceState(null, '', `/agent-os?agentSessionId=${sessionId}`);
    vi.mocked(apiClient.get).mockResolvedValue({
      session: { id: sessionId },
      tasks: [{
        id: 'task-cancelled',
        parentTaskId: null,
        agentDefinitionKey: 'operator',
        objective: 'cancelled work',
        status: 'cancelled',
        latestAttempt: { id: 'attempt-cancelled', ordinal: 1, status: 'cancelled' },
      }],
    } as never);

    render(<AgentInteractionSurface />);

    expect(await screen.findByText('cancelled work')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeVisible();
  });

  it('renders durable Task, Attempt, result, approval, invocation, and child facts after the first prompt', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ session: { id: expect.any(String) }, tasks: [{ id: 'task-1', parentTaskId: null, agentDefinitionKey: 'operator', objective: 'collect signals', status: 'open', result: { summary: 'Durable result', error: { message: 'bounded error' }, needsInput: { code: 'choose', prompt: 'Choose one.' } }, resourceRefs: [{ kind: 'candidate', id: 'candidate-1' }], operationRefs: [{ kind: 'operation', id: 'run-1', status: 'running' }], latestAttempt: { id: 'attempt-1', ordinal: 1, status: 'running' }, approval: { id: 'approval-1', invocationId: 'invocation-1', inputHash: 'hash', status: 'pending' }, approvals: [{ id: 'approval-1', invocationId: 'invocation-1', inputHash: 'hash', status: 'pending' }], invocations: [{ id: 'invocation-1', capabilityKey: 'sourcing.inspectCandidate', status: 'succeeded' }], childTasks: [{ id: 'child-1', parentTaskId: 'task-1', objective: 'inspect evidence', status: 'completed', latestAttempt: { id: 'child-attempt-1', ordinal: 1, status: 'succeeded' } }] }] } as never);
    const user = userEvent.setup();
    render(<AgentInteractionSurface />);
    await user.type(screen.getByPlaceholderText('Ask Operator to begin work'), 'collect signals');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await vi.waitFor(() => expect(addMessage).toHaveBeenCalledWith(expect.objectContaining({ role: 'user', content: 'collect signals' })));
    expect(runAgent).toHaveBeenCalledWith(expect.objectContaining({ agent: expect.any(Object) }));
    expect(apiClient.post).not.toHaveBeenCalledWith('/api/agent-work/start', expect.anything());
    expect(screen.getAllByText('collect signals')).toHaveLength(2);
    expect(screen.getByText('Durable result')).toBeVisible();
    expect(screen.getByText('bounded error')).toBeVisible();
    expect(screen.getByText(/Needs input:.*choose/)).toBeVisible();
    expect(screen.getByText(/Approvals: approval-1 \(pending\)/)).toBeVisible();
    expect(screen.getByText(/Invocations: sourcing.inspectCandidate \(succeeded\)/)).toBeVisible();
    expect(screen.getByText(/Child tasks: inspect evidence \(completed; Attempt 1: succeeded\)/)).toBeVisible();
    expect(screen.getByText(/candidate:candidate-1/)).toBeVisible();
    expect(screen.getByText(/operation:run-1/)).toBeVisible();
    expect(screen.getByText(/past chat is never replayed/i)).toBeVisible();
    expect(runAgent).toHaveBeenCalledTimes(1);
  });

  it('does not fetch a newly generated session until its first live run finishes', async () => {
    const completion = deferred<undefined>();
    runAgent.mockImplementationOnce(() => completion.promise);
    vi.mocked(apiClient.get).mockResolvedValue({
      session: { id: expect.any(String) },
      tasks: [],
    } as never);
    const user = userEvent.setup();
    render(<AgentInteractionSurface />);

    await user.type(screen.getByPlaceholderText('Ask Operator to begin work'), 'collect signals');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await vi.waitFor(() => expect(runAgent).toHaveBeenCalledTimes(1));
    const sessionId = new URLSearchParams(window.location.search).get('agentSessionId');
    expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(apiClient.get).not.toHaveBeenCalled();

    completion.resolve(undefined);
    await vi.waitFor(() => expect(apiClient.get).toHaveBeenCalledWith(
      `/api/agent-work/sessions/${sessionId}`,
    ));
  });

  it('restores an unadmitted prompt and clears its generated session after live submission rejects', async () => {
    runAgent.mockRejectedValueOnce(new Error('connection dropped'));
    vi.mocked(apiClient.get)
      .mockRejectedValueOnce(new ApiError(404, 'agent_session_not_found', 'not found'))
      .mockImplementation(async (path: string) => durableWorkView(sessionIdFromPath(path)));
    const user = userEvent.setup();
    render(<AgentInteractionSurface />);

    const prompt = 'collect supplier evidence';
    await user.type(screen.getByPlaceholderText('Ask Operator to begin work'), prompt);
    await user.click(screen.getByRole('button', { name: 'Start' }));

    await vi.waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));
    expect(screen.getByPlaceholderText('Ask Operator to begin work')).toHaveValue(prompt);
    expect(new URLSearchParams(window.location.search).get('agentSessionId')).toBeNull();
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
    expect(runAgent).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Start' }));
    await vi.waitFor(() => expect(runAgent).toHaveBeenCalledTimes(2));
    expect(addMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      role: 'user',
      content: prompt,
    }));
  });

  it('keeps an immutable in-flight prompt when the interaction panel closes before admission', async () => {
    const completion = deferred<undefined>();
    runAgent.mockImplementationOnce(() => completion.promise);
    const user = userEvent.setup();
    render(<AgentInteractionSurface />);

    await user.type(screen.getByPlaceholderText('Ask Operator to begin work'), 'keep this prompt');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await vi.waitFor(() => expect(runAgent).toHaveBeenCalledTimes(1));

    closeInteraction();

    expect(useInteractionSurfaceState.getState().queuedPrompt).toMatchObject({
      text: 'keep this prompt',
      agentDefinitionKey: 'operator',
    });
  });

  it('does not discard a submitting prompt when the user starts a new task', async () => {
    const completion = deferred<undefined>();
    runAgent.mockImplementationOnce(() => completion.promise);
    const user = userEvent.setup();
    render(<AgentInteractionSurface />);

    await user.type(screen.getByPlaceholderText('Ask Operator to begin work'), 'do not discard this prompt');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await vi.waitFor(() => expect(runAgent).toHaveBeenCalledTimes(1));
    const sessionId = new URLSearchParams(window.location.search).get('agentSessionId');

    await user.click(screen.getByRole('button', { name: 'New task' }));

    expect(new URLSearchParams(window.location.search).get('agentSessionId')).toBe(sessionId);
    expect(useInteractionSurfaceState.getState().queuedPrompt).toMatchObject({
      text: 'do not discard this prompt',
    });
  });

  it('does not overwrite a submitting prompt when another interaction is opened', async () => {
    const completion = deferred<undefined>();
    runAgent.mockImplementationOnce(() => completion.promise);
    const user = userEvent.setup();
    render(<AgentInteractionSurface />);

    await user.type(screen.getByPlaceholderText('Ask Operator to begin work'), 'keep original admission evidence');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await vi.waitFor(() => expect(runAgent).toHaveBeenCalledTimes(1));
    const sessionId = new URLSearchParams(window.location.search).get('agentSessionId');

    openInteraction({
      agentDefinitionKey: 'sourcing',
      sessionId: null,
      draft: 'replace the pending prompt',
    });

    expect(new URLSearchParams(window.location.search).get('agentSessionId')).toBe(sessionId);
    expect(useInteractionSurfaceState.getState().queuedPrompt).toMatchObject({
      text: 'keep original admission evidence',
      agentDefinitionKey: 'operator',
    });
  });

  it('adopts a durable session after an ambiguous live transport failure without resubmitting', async () => {
    runAgent.mockRejectedValueOnce(new Error('response lost after write'));
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => ({
      ...durableWorkView(sessionIdFromPath(path)),
      tasks: [{
        id: 'task-ambiguous',
        parentTaskId: null,
        agentDefinitionKey: 'operator',
        objective: 'already admitted durable work',
        status: 'open',
        latestAttempt: { id: 'attempt-ambiguous', ordinal: 1, status: 'running' },
      }],
    }) as never);
    const user = userEvent.setup();
    render(<AgentInteractionSurface />);

    await user.type(screen.getByPlaceholderText('Ask Operator to begin work'), 'do not duplicate');
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(await screen.findByText('already admitted durable work')).toBeVisible();
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it('adopts a matching root admission event before a long first live run completes', async () => {
    const completion = deferred<undefined>();
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => durableWorkView(
      sessionIdFromPath(path),
    ) as never);
    runAgent.mockImplementationOnce(() => {
      const sessionId = new URLSearchParams(window.location.search).get('agentSessionId');
      emitAgentWorkAdmission({
        kind: 'root',
        sessionId: sessionId!,
        taskId: 'task-durable',
        attemptId: 'attempt-durable',
      });
      return completion.promise;
    });
    const user = userEvent.setup();
    render(<AgentInteractionSurface />);

    await user.type(screen.getByPlaceholderText('Ask Operator to begin work'), 'start a long durable task');
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(await screen.findByText('durable work')).toBeVisible();
    expect(screen.getByPlaceholderText('Ask Operator to begin work')).toHaveValue('');
    expect(runAgent).toHaveBeenCalledTimes(1);
  });

  it('restores a rejected existing-session follow-up when its latest durable Attempt is unchanged', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000014';
    const unchanged = workViewWithRootAttempt(sessionId, {
      id: 'attempt-running',
      ordinal: 1,
      status: 'running',
    });
    window.history.replaceState(null, '', `/agent-os?agentSessionId=${sessionId}`);
    runAgent.mockRejectedValueOnce(new Error('existing work is still running'));
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(unchanged as never)
      .mockResolvedValueOnce(unchanged as never);
    const user = userEvent.setup();
    render(<AgentInteractionSurface />);

    await screen.findByText('durable work');
    const prompt = 'follow up after the running attempt';
    await user.type(screen.getByPlaceholderText('Ask Operator to begin work'), prompt);
    await user.click(screen.getByRole('button', { name: 'Send follow-up' }));

    await vi.waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
    expect(screen.getByPlaceholderText('Ask Operator to begin work')).toHaveValue(prompt);
    expect(new URLSearchParams(window.location.search).get('agentSessionId')).toBe(sessionId);
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Send follow-up' })).toBeEnabled();
  });

  it('adopts a matching live-input admission event for an existing running Attempt', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000016';
    const unchanged = workViewWithRootAttempt(sessionId, {
      id: 'attempt-running',
      ordinal: 1,
      status: 'running',
    });
    window.history.replaceState(null, '', `/agent-os?agentSessionId=${sessionId}`);
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(unchanged as never)
      .mockResolvedValueOnce(unchanged as never);
    runAgent.mockImplementationOnce(async () => {
      emitAgentWorkAdmission({
        kind: 'live_input',
        sessionId,
        taskId: 'task-root',
        attemptId: 'attempt-running',
      });
    });
    const user = userEvent.setup();
    render(<AgentInteractionSurface />);

    await screen.findByText('durable work');
    await user.type(screen.getByPlaceholderText('Ask Operator to begin work'), 'send to the running attempt');
    await user.click(screen.getByRole('button', { name: 'Send follow-up' }));

    await vi.waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
    expect(screen.getByPlaceholderText('Ask Operator to begin work')).toHaveValue('');
    expect(screen.queryByText('No new durable Attempt was admitted.')).not.toBeInTheDocument();
    expect(runAgent).toHaveBeenCalledTimes(1);
  });

  it('reuses one live-message command after enqueue succeeds but its admission event is lost', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000020';
    const unchanged = workViewWithRootAttempt(sessionId, {
      id: 'attempt-running',
      ordinal: 1,
      status: 'running',
    });
    const boundaryCommands: Array<{ id: string; content: string }> = [];
    window.history.replaceState(null, '', `/agent-os?agentSessionId=${sessionId}`);
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(unchanged as never)
      .mockResolvedValueOnce(unchanged as never)
      .mockResolvedValueOnce(unchanged as never);
    runAgent
      .mockImplementationOnce(async () => {
        boundaryCommands.push(finalUserMessage());
        agentMessages.push({
          id: 'partial-output-after-enqueue',
          role: 'assistant',
          content: 'partial output before the admission event was lost',
        });
        throw new Error('admission event lost after enqueue');
      })
      .mockImplementationOnce(async () => {
        boundaryCommands.push(finalUserMessage());
        emitAgentWorkAdmission({
          kind: 'live_input',
          sessionId,
          taskId: 'task-root',
          attemptId: 'attempt-running',
        });
      });
    const user = userEvent.setup();
    render(<AgentInteractionSurface />);

    await screen.findByText('durable work');
    const prompt = 'use the exact logical live message once';
    await user.type(screen.getByPlaceholderText('Ask Operator to begin work'), prompt);
    await user.click(screen.getByRole('button', { name: 'Send follow-up' }));

    await vi.waitFor(() => expect(runAgent).toHaveBeenCalledTimes(1));
    expect(screen.getByPlaceholderText('Ask Operator to begin work')).toHaveValue(prompt);
    await user.click(screen.getByRole('button', { name: 'Send follow-up' }));

    await vi.waitFor(() => expect(runAgent).toHaveBeenCalledTimes(2));
    expect(boundaryCommands).toHaveLength(2);
    expect(boundaryCommands[1]).toEqual(boundaryCommands[0]);
    expect(addMessage).toHaveBeenCalledTimes(1);
    expect(setMessages).toHaveBeenCalledTimes(1);
    expect(useInteractionSurfaceState.getState().queuedPrompt).toBeNull();
  });

  it('does not consume a follow-up for a live-input admission event bound to another Attempt', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000017';
    const unchanged = workViewWithRootAttempt(sessionId, {
      id: 'attempt-running',
      ordinal: 1,
      status: 'running',
    });
    window.history.replaceState(null, '', `/agent-os?agentSessionId=${sessionId}`);
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(unchanged as never)
      .mockResolvedValueOnce(unchanged as never);
    runAgent.mockImplementationOnce(async () => {
      emitAgentWorkAdmission({
        kind: 'live_input',
        sessionId,
        taskId: 'task-root',
        attemptId: 'attempt-other',
      });
    });
    const user = userEvent.setup();
    render(<AgentInteractionSurface />);

    await screen.findByText('durable work');
    const prompt = 'do not accept another attempt admission';
    await user.type(screen.getByPlaceholderText('Ask Operator to begin work'), prompt);
    await user.click(screen.getByRole('button', { name: 'Send follow-up' }));

    await vi.waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
    expect(screen.getByPlaceholderText('Ask Operator to begin work')).toHaveValue(prompt);
    expect(screen.getByText('Durable admission was not confirmed. Retry will reuse the exact command.')).toBeVisible();
    expect(runAgent).toHaveBeenCalledTimes(1);
  });

  it('shows a deterministic reconciliation retry when projection loading fails without rerunning the agent', async () => {
    runAgent.mockRejectedValueOnce(new Error('stream ended'));
    vi.mocked(apiClient.get)
      .mockRejectedValueOnce(new ApiError(503, 'unavailable', 'projection unavailable'))
      .mockImplementation(async (path: string) => ({
        ...durableWorkView(sessionIdFromPath(path)),
        tasks: [{
          id: 'task-reconciled',
          parentTaskId: null,
          agentDefinitionKey: 'operator',
          objective: 'reconciled durable work',
          status: 'open',
          latestAttempt: { id: 'attempt-reconciled', ordinal: 1, status: 'running' },
        }],
      }) as never);
    const user = userEvent.setup();
    render(<AgentInteractionSurface />);

    await user.type(screen.getByPlaceholderText('Ask Operator to begin work'), 'reconcile after error');
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to confirm durable work');
    expect(runAgent).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Retry durable admission check' }));

    expect(await screen.findByText('reconciled durable work')).toBeVisible();
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(runAgent).toHaveBeenCalledTimes(1);
  });

  it('surfaces a retryable projection error for an existing durable session without an unhandled rejection', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000013';
    window.history.replaceState(null, '', `/agent-os?agentSessionId=${sessionId}`);
    vi.mocked(apiClient.get)
      .mockRejectedValueOnce(new ApiError(503, 'unavailable', 'projection unavailable'))
      .mockResolvedValueOnce(durableWorkView(sessionId) as never);
    const user = userEvent.setup();

    render(<AgentInteractionSurface />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load durable work');
    await user.click(screen.getByRole('button', { name: 'Refresh durable work' }));
    expect(await screen.findByText('durable work')).toBeVisible();
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it('submits a sourcing prompt through the immutable sourcing agent pin', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => durableWorkView(
      sessionIdFromPath(path),
      'sourcing',
    ) as never);
    openInteraction({ agentDefinitionKey: 'sourcing', sessionId: null, draft: '' });
    const user = userEvent.setup();
    render(<AgentInteractionSurface />);

    await user.type(screen.getByPlaceholderText('Ask Sourcing to begin work'), 'inspect supplier URL');
    await user.click(screen.getByRole('button', { name: 'Start' }));

    await vi.waitFor(() => expect(useAgentMock).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'sourcing',
      runtimeAgentId: 'sourcing',
    })));
    expect(addMessage).toHaveBeenCalledWith(expect.objectContaining({
      role: 'user',
      content: 'inspect supplier URL',
    }));
  });

  it('routes Continue from a non-live Attempt to the explicit durable action', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ session: { id: expect.any(String) }, tasks: [{ id: 'task-1', parentTaskId: null, agentDefinitionKey: 'operator', objective: 'work', status: 'open', latestAttempt: { id: 'attempt-1', ordinal: 1, status: 'process_interrupted' } }] } as never);
    const user = userEvent.setup(); render(<AgentInteractionSurface />);
    await user.type(screen.getByPlaceholderText('Ask Operator to begin work'), 'work'); await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(apiClient.post).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/agent-work\/sessions\/[0-9a-f-]{36}\/tasks\/task-1\/continue$/),
      { predecessorAttemptId: 'attempt-1', prompt: 'Continue the durable work with the current state.' },
    );
  });

  it('keeps interrupt and cancel available for a genuinely live Attempt', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ session: { id: expect.any(String) }, tasks: [{ id: 'task-live', parentTaskId: null, agentDefinitionKey: 'operator', objective: 'live work', status: 'open', latestAttempt: { id: 'attempt-live', ordinal: 1, status: 'running' } }] } as never);
    const user = userEvent.setup(); render(<AgentInteractionSurface />);
    await user.type(screen.getByPlaceholderText('Ask Operator to begin work'), 'work'); await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(screen.getByRole('button', { name: 'Interrupt' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(apiClient.post).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/agent-work\/sessions\/[0-9a-f-]{36}\/tasks\/task-live\/attempts\/attempt-live\/interrupt$/),
      undefined,
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/agent-work\/sessions\/[0-9a-f-]{36}\/tasks\/task-live\/cancel$/),
      undefined,
    );
  });

  it('recovers a selected durable session projection after remounting from the URL', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000010';
    window.history.replaceState(null, '', `/agent-os?agentSessionId=${sessionId}`);
    vi.mocked(apiClient.get).mockResolvedValue({
      session: { id: sessionId },
      tasks: [{ id: 'task-1', parentTaskId: null, agentDefinitionKey: 'operator', objective: 'durable work', status: 'completed', latestAttempt: { id: 'attempt-1', ordinal: 1, status: 'succeeded' } }],
    } as never);

    const first = render(<AgentInteractionSurface />);
    await vi.waitFor(() => expect(apiClient.get).toHaveBeenCalledWith(`/api/agent-work/sessions/${sessionId}`));
    expect(await screen.findByText('durable work')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible();
    first.unmount();

    render(<AgentInteractionSurface />);
    await vi.waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('durable work')).toBeVisible();
  });

  it('pins a resumed durable session to its root task agent instead of stale selected UI state', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000012';
    openInteraction({ agentDefinitionKey: 'sourcing', sessionId: null, draft: '' });
    window.history.replaceState(null, '', `/agent-os?agentSessionId=${sessionId}`);
    vi.mocked(apiClient.get).mockResolvedValue({
      session: { id: sessionId },
      tasks: [{
        id: 'task-1',
        parentTaskId: null,
        agentDefinitionKey: 'supply',
        objective: 'resume durable work',
        status: 'open',
        latestAttempt: { id: 'attempt-1', ordinal: 1, status: 'exited' },
      }],
    } as never);

    render(<AgentInteractionSurface />);

    await vi.waitFor(() => expect(useAgentMock).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'supply',
      runtimeAgentId: 'supply',
      threadId: sessionId,
    })));
    expect(screen.getByRole('heading', { name: 'Supply work' })).toBeVisible();
  });

  it('clears the selected session URL coordinate for new and deleted terminal work', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000011';
    window.history.replaceState(null, '', `/agent-os?agentSessionId=${sessionId}`);
    vi.mocked(apiClient.get).mockResolvedValue({
      session: { id: sessionId },
      tasks: [{ id: 'task-1', parentTaskId: null, agentDefinitionKey: 'operator', objective: 'terminal work', status: 'completed', latestAttempt: { id: 'attempt-1', ordinal: 1, status: 'succeeded' } }],
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function durableWorkView(
  sessionId: string,
  agentDefinitionKey: 'operator' | 'sourcing' = 'operator',
) {
  return {
    session: { id: sessionId },
    tasks: [{
      id: 'task-durable',
      parentTaskId: null,
      agentDefinitionKey,
      objective: 'durable work',
      status: 'open',
      latestAttempt: { id: 'attempt-durable', ordinal: 1, status: 'running' },
    }],
  };
}

function sessionIdFromPath(path: string): string {
  return path.split('/').at(-1) ?? '00000000-0000-4000-8000-000000000099';
}

function workViewWithRootAttempt(
  sessionId: string,
  latestAttempt: {
    id: string;
    ordinal: number;
    status: string;
  },
) {
  return {
    session: { id: sessionId },
    tasks: [{
      id: 'task-root',
      parentTaskId: null,
      agentDefinitionKey: 'operator',
      objective: 'durable work',
      status: 'open',
      latestAttempt: {
        id: latestAttempt.id,
        ordinal: latestAttempt.ordinal,
        status: latestAttempt.status,
      },
    }],
  };
}

function emitAgentWorkAdmission(value: {
  kind: 'live_input' | 'root';
  sessionId: string;
  taskId: string;
  attemptId: string;
}): void {
  customEventSubscriber?.({
    event: {
      type: 'CUSTOM',
      name: 'kiditem.agent_work_admission',
      value,
    },
  });
}

function finalUserMessage(): { id: string; content: string } {
  const message = agentMessages.at(-1);
  if (!message || message.role !== 'user') throw new Error('final user message is required');
  return { id: message.id, content: message.content };
}

function resetInteractionSurface(): void {
  useInteractionSurfaceState.setState({
    isOpen: false,
    selectedAgentDefinitionKey: null,
    draft: '',
    sessionId: null,
    queuedPrompt: null,
    submissionStatus: 'idle',
    submissionError: null,
  });
}
