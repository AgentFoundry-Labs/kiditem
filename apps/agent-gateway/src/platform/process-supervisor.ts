import type { ProviderCommand } from '../provider/provider-command';

export type ProcessExit = Readonly<{ code: number | null; signal: NodeJS.Signals | null }>;
export type ProcessCallbacks = Readonly<{
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  /** A supervisor calls this when it cannot prove descendant-tree death. */
  onFatal?: (error: Error) => void;
  /** Emitted only after the full provider tree has exited, never on parent exit alone. */
  onExit?: (exit: ProcessExit) => void;
}>;

export interface SupervisedProcess {
  input(value: string): Promise<void>;
  terminate(): Promise<void>;
  onExit(listener: (exit: ProcessExit) => void): void;
}

export interface ProcessSupervisor {
  launch(command: ProviderCommand, callbacks?: ProcessCallbacks): Promise<SupervisedProcess>;
  shutdown(): Promise<void>;
}
