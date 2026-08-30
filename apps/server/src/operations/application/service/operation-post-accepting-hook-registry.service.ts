import { Injectable } from '@nestjs/common';
import type {
  OperationPostAcceptingHook,
  OperationPostAcceptingHookRegistryPort,
} from '../port/in/operation-post-accepting-hook-registry.port';

@Injectable()
export class OperationPostAcceptingHookRegistryService
  implements OperationPostAcceptingHookRegistryPort
{
  private readonly hooks = new Map<string, OperationPostAcceptingHook>();

  register(hook: OperationPostAcceptingHook): void {
    if (this.hooks.has(hook.key)) {
      throw new Error(`duplicate operation post-accepting hook: ${hook.key}`);
    }
    this.hooks.set(hook.key, hook);
  }

  async runAll(signal: AbortSignal): Promise<void> {
    const hooks = [...this.hooks.values()]
      .sort((left, right) => left.priority - right.priority || left.key.localeCompare(right.key));
    for (const hook of hooks) {
      signal.throwIfAborted();
      await hook.run(signal);
      signal.throwIfAborted();
    }
  }
}
