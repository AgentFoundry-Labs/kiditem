export const OPERATION_POST_ACCEPTING_HOOK_REGISTRY_PORT = Symbol(
  'OPERATION_POST_ACCEPTING_HOOK_REGISTRY_PORT',
);

export interface OperationPostAcceptingHook {
  key: string;
  priority: number;
  run(signal: AbortSignal): Promise<void>;
}

export interface OperationPostAcceptingHookRegistryPort {
  register(hook: OperationPostAcceptingHook): void;
}
