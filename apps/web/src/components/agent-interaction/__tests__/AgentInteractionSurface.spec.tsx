import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AgentInteractionSurface } from '../AgentInteractionSurface';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));

describe('AgentInteractionSurface durable projection', () => {
  it('starts a durable session and renders no transcript', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ session: { id: 'session-1' } } as never);
    vi.mocked(apiClient.get).mockResolvedValue({ session: { id: 'session-1' }, tasks: [{ id: 'task-1', objective: 'collect signals', status: 'open', presentation: 'running', latestAttempt: { id: 'attempt-1', ordinal: 1, status: 'running' } }] } as never);
    const user = userEvent.setup();
    render(<AgentInteractionSurface />);
    await user.type(screen.getByPlaceholderText('Ask Operator to begin work'), 'collect signals');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(apiClient.post).toHaveBeenCalledWith('/api/agent-work/start', { objective: 'collect signals' });
    expect(screen.getByText('collect signals')).toBeVisible();
    expect(screen.getByText(/past chat is never replayed/i)).toBeVisible();
  });

  it('routes continue, interrupt, cancel, and terminal deletion to durable actions', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ session: { id: 'session-1' } } as never);
    vi.mocked(apiClient.get).mockResolvedValue({ session: { id: 'session-1' }, tasks: [{ id: 'task-1', objective: 'work', status: 'open', presentation: 'running', latestAttempt: { id: 'attempt-1', ordinal: 1, status: 'running' } }] } as never);
    const user = userEvent.setup(); render(<AgentInteractionSurface />);
    await user.type(screen.getByPlaceholderText('Ask Operator to begin work'), 'work'); await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Interrupt' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(apiClient.post).toHaveBeenCalledWith('/api/agent-work/sessions/session-1/tasks/task-1/continue', { predecessorAttemptId: 'attempt-1' });
    expect(apiClient.post).toHaveBeenCalledWith('/api/agent-work/sessions/session-1/tasks/task-1/attempts/attempt-1/interrupt', undefined);
    expect(apiClient.post).toHaveBeenCalledWith('/api/agent-work/sessions/session-1/tasks/task-1/cancel', undefined);
  });
});
