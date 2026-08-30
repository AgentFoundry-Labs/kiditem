import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type OperationServerLifecycleState =
  | 'BOOTSTRAPPING'
  | 'ACCEPTING'
  | 'STOPPING'
  | 'STOPPED';

@Injectable()
export class OperationLifecycleGateService {
  private current: OperationServerLifecycleState = 'BOOTSTRAPPING';
  private readonly stopping = new AbortController();

  state(): OperationServerLifecycleState {
    return this.current;
  }

  signal(): AbortSignal {
    return this.stopping.signal;
  }

  assertAccepting(): void {
    if (this.current !== 'ACCEPTING') {
      throw new ServiceUnavailableException(
        'operation_server_lifecycle_unavailable',
      );
    }
  }

  open(): void {
    if (this.current !== 'BOOTSTRAPPING') {
      throw new Error('operation_lifecycle_open_invalid');
    }
    this.current = 'ACCEPTING';
  }

  beginStopping(): void {
    if (this.current === 'STOPPED') return;
    this.current = 'STOPPING';
    if (!this.stopping.signal.aborted) {
      this.stopping.abort(new Error('operation_server_shutdown'));
    }
  }

  finishStopping(): void {
    if (this.current !== 'STOPPING') {
      throw new Error('operation_lifecycle_stop_invalid');
    }
    this.current = 'STOPPED';
  }
}
