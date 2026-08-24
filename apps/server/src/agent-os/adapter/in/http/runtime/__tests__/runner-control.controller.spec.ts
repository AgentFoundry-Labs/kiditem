import { describe, expect, it, vi } from 'vitest';
import { RunnerControlController } from '../runner-control.controller';

const instanceId = '018f4eb1-9078-7a1e-9514-b19b5732f5de';
const leaseId = '118f4eb1-9078-7a1e-9514-b19b5732f5de';

describe('RunnerControlController', () => {
  it('uses only the dedicated installation bearer to admit a strict hello and serializes its lease response', async () => {
    const tokens = { authenticate: vi.fn(() => true) };
    const leases = { hello: vi.fn(() => ({ runnerInstanceId: instanceId, leaseId, status: 'probing', leaseTtlMs: 30_000, controlRevision: 'kiditem-runner-control-v1' })) };
    const events = { handle: vi.fn() };
    const controller = new RunnerControlController(tokens as never, leases as never, events as never);
    const response = responseRecorder();

    await controller.poll(hello(), request('installation-token') as never, response as never);

    expect(tokens.authenticate).toHaveBeenCalledWith('installation-token');
    expect(leases.hello).toHaveBeenCalledWith(hello());
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ leaseId, status: 'probing' }));
  });

  it('returns a 204-equivalent empty response for a completed long poll and returns conflicts without bearer disclosure', async () => {
    const tokens = { authenticate: vi.fn(() => true) };
    const leases = { poll: vi.fn(async () => ({ commands: [] })) };
    const controller = new RunnerControlController(tokens as never, leases as never, { handle: vi.fn() } as never);
    const response = responseRecorder();

    await controller.poll({ kind: 'poll', runnerInstanceId: instanceId, leaseId }, request('secret-runner-token') as never, response as never);

    expect(response.status).toHaveBeenCalledWith(204);
    expect(response.end).toHaveBeenCalledOnce();
  });

  it('rejects a missing or invalid installation bearer before it enters the lease registry', async () => {
    const tokens = { authenticate: vi.fn(() => false) };
    const leases = { hello: vi.fn() };
    const controller = new RunnerControlController(tokens as never, leases as never, { handle: vi.fn() } as never);

    await expect(controller.poll(hello(), request('raw-secret-must-not-render') as never, responseRecorder() as never))
      .rejects.toThrow('runner_auth_invalid');
    expect(leases.hello).not.toHaveBeenCalled();
  });

  it('passes a bounded event batch only to the replay-safe Runner event handler', async () => {
    const events = { handle: vi.fn(async () => ({ eventSeq: 1, accepted: true })) };
    const controller = new RunnerControlController({ authenticate: () => true } as never, {} as never, events as never);
    const response = responseRecorder();
    const batch = { runnerInstanceId: instanceId, leaseId, eventSeq: 1, events: [{ kind: 'attempt.started', attemptId: '218f4eb1-9078-7a1e-9514-b19b5732f5de' }] };

    await controller.events(batch, request('installation-token') as never, response as never);

    expect(events.handle).toHaveBeenCalledWith(batch);
    expect(response.json).toHaveBeenCalledWith({ eventSeq: 1, accepted: true });
  });

  it('maps a lease-owned Attempt fence rejection to a generic control conflict', async () => {
    const events = { handle: vi.fn(async () => { throw new Error('runner_event_attempt_unassigned'); }) };
    const controller = new RunnerControlController({ authenticate: () => true } as never, {} as never, events as never);
    const batch = { runnerInstanceId: instanceId, leaseId, eventSeq: 1, events: [{ kind: 'attempt.started', attemptId: '218f4eb1-9078-7a1e-9514-b19b5732f5de' }] };

    await expect(controller.events(batch, request('installation-token') as never, responseRecorder() as never))
      .rejects.toThrow('runner_control_conflict');
  });
});

function hello() {
  return {
    kind: 'hello' as const, runnerInstanceId: instanceId, platform: 'macos' as const, nodeMajor: 22,
    controlRevision: 'kiditem-runner-control-v1' as const, mcpProtocolRevision: '2026-07-28' as const, cliContractIdentity: 'office-cli-contract-v2' as const,
    runtimes: {
      codex_cli: { version: '0.149.1' as const, loginVerified: true as const, nonPersistentSettingsVerified: true as const },
      claude_cli: { version: '2.1.241' as const, loginVerified: true as const, nonPersistentSettingsVerified: true as const },
    },
  };
}

function request(token: string) {
  return { headers: { authorization: `Bearer ${token}` } };
}

function responseRecorder() {
  const response = {
    status: vi.fn(), json: vi.fn(), end: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}
