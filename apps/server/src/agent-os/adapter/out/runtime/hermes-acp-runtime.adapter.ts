import type { AgentDurableRuntimeAdapter } from '../../../application/port/out/runtime/agent-durable-runtime.port';
import { HermesHttpRuntimeAdapter, type HermesRuntimeAdapterOptions } from './hermes-http-runtime.adapter';

export interface HermesAcpCompatibility {
  detached: boolean;
  reconnect: boolean;
  interrupt: boolean;
  cancel: boolean;
  inspect: boolean;
}

export class HermesAcpRuntimeAdapter extends HermesHttpRuntimeAdapter implements AgentDurableRuntimeAdapter {
  override readonly runtimeType: string = 'hermes_acp';

  constructor(options: HermesRuntimeAdapterOptions & { compatibility: HermesAcpCompatibility }) {
    super(options);
    if (!Object.values(options.compatibility).every((value) => value === true)) {
      throw new Error('HERMES_ACP_INCOMPATIBLE');
    }
  }
}
