import { describe, expect, it } from 'vitest';
import { OperationLifecycleGateService } from '../operation-lifecycle-gate.service';

function expectUnavailable(gate: OperationLifecycleGateService): void {
  try {
    gate.assertAccepting();
    throw new Error('expected lifecycle gate rejection');
  } catch (error) {
    expect(error).toMatchObject({
      status: 503,
      response: expect.objectContaining({
        message: 'operation_server_lifecycle_unavailable',
      }),
    });
  }
}

describe('OperationLifecycleGateService', () => {
  it('moves BOOTSTRAPPING -> ACCEPTING -> STOPPING -> STOPPED and aborts once', () => {
    const gate = new OperationLifecycleGateService();
    expect(gate.state()).toBe('BOOTSTRAPPING');
    expectUnavailable(gate);
    const signal = gate.signal();
    let abortCount = 0;
    signal.addEventListener('abort', () => abortCount += 1);

    gate.open();
    expect(gate.state()).toBe('ACCEPTING');
    expect(() => gate.assertAccepting()).not.toThrow();

    gate.beginStopping();
    gate.beginStopping();
    expect(gate.state()).toBe('STOPPING');
    expect(signal.aborted).toBe(true);
    expect((signal.reason as Error).message).toBe('operation_server_shutdown');
    expect(abortCount).toBe(1);
    expectUnavailable(gate);

    gate.finishStopping();
    expect(gate.state()).toBe('STOPPED');
    expectUnavailable(gate);
    gate.beginStopping();
    expect(gate.state()).toBe('STOPPED');
    expect(abortCount).toBe(1);
  });

  it('never reopens and rejects invalid stop completion', () => {
    const bootstrapping = new OperationLifecycleGateService();
    expect(() => bootstrapping.finishStopping()).toThrow(
      'operation_lifecycle_stop_invalid',
    );

    const gate = new OperationLifecycleGateService();
    gate.open();
    expect(() => gate.open()).toThrow('operation_lifecycle_open_invalid');
    gate.beginStopping();
    expect(() => gate.open()).toThrow('operation_lifecycle_open_invalid');
    gate.finishStopping();
    expect(() => gate.open()).toThrow('operation_lifecycle_open_invalid');
  });
});
