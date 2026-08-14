import { IsolatedCliRuntimeAdapter, type IsolatedCliRuntimeOptions } from './isolated-cli-runtime.adapter';

type CodexOptions = Omit<
  IsolatedCliRuntimeOptions,
  'runtimeType' | 'binary' | 'allowedBinary' | 'versionPattern' | 'startArgs' | 'resumeArgs'
>;

export class CodexCliRuntimeAdapter extends IsolatedCliRuntimeAdapter {
  constructor(options: CodexOptions) {
    super({
      ...options,
      runtimeType: 'codex_cli',
      binary: 'codex',
      allowedBinary: 'codex',
      versionPattern: /^codex-cli 1\.\d+\.\d+$/,
      startArgs: ['exec', '--json'],
      resumeArgs: ['exec', 'resume', '--json'],
    });
  }
}
