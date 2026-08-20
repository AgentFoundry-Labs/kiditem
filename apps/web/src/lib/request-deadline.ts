export interface ComposedRequestSignal {
  readonly signal: AbortSignal;
  readonly didTimeout: boolean;
  cleanup(): void;
}

function timeoutAbortReason(): DOMException {
  return new DOMException('Request deadline exceeded', 'AbortError');
}

export function composeRequestSignal(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number | null,
): ComposedRequestSignal {
  const controller = new AbortController();
  let timedOut = false;
  let cleaned = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const forwardCallerAbort = () => {
    controller.abort(callerSignal?.reason);
  };

  if (callerSignal?.aborted) {
    forwardCallerAbort();
  } else {
    callerSignal?.addEventListener('abort', forwardCallerAbort, { once: true });
    if (timeoutMs !== null && Number.isFinite(timeoutMs)) {
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort(timeoutAbortReason());
      }, Math.max(0, timeoutMs));
    }
  }

  return {
    signal: controller.signal,
    get didTimeout() {
      return timedOut;
    },
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      if (timeout !== null) {
        clearTimeout(timeout);
        timeout = null;
      }
      callerSignal?.removeEventListener('abort', forwardCallerAbort);
    },
  };
}
