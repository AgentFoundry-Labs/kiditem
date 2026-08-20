import { afterEach, describe, expect, it, vi } from 'vitest';
import { composeRequestSignal } from '../request-deadline';

describe('composeRequestSignal', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('owns one deadline timer and releases it after timing out', async () => {
    vi.useFakeTimers();

    const request = composeRequestSignal(undefined, 25);

    expect(vi.getTimerCount()).toBe(1);
    expect(request.didTimeout).toBe(false);

    await vi.advanceTimersByTimeAsync(25);

    expect(request.signal.aborted).toBe(true);
    expect(request.signal.reason).toMatchObject({ name: 'AbortError' });
    expect(request.didTimeout).toBe(true);

    request.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves caller abort identity and removes the forwarded listener', () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const add = vi.spyOn(caller.signal, 'addEventListener');
    const remove = vi.spyOn(caller.signal, 'removeEventListener');
    const request = composeRequestSignal(caller.signal, 1_000);
    const reason = new DOMException('operator cancelled', 'AbortError');

    caller.abort(reason);

    expect(request.signal.aborted).toBe(true);
    expect(request.signal.reason).toBe(reason);
    expect(request.didTimeout).toBe(false);
    expect(add).toHaveBeenCalledTimes(1);

    request.cleanup();
    request.cleanup();

    expect(remove).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('forwards an already-aborted caller without installing a timer or listener', () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const reason = new DOMException('already cancelled', 'AbortError');
    caller.abort(reason);
    const add = vi.spyOn(caller.signal, 'addEventListener');

    const request = composeRequestSignal(caller.signal, 1_000);

    expect(request.signal.aborted).toBe(true);
    expect(request.signal.reason).toBe(reason);
    expect(request.didTimeout).toBe(false);
    expect(add).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    request.cleanup();
  });

  it('allows an explicitly unbounded request without allocating a timer', () => {
    vi.useFakeTimers();

    const request = composeRequestSignal(undefined, null);

    expect(request.signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    request.cleanup();
  });
});
