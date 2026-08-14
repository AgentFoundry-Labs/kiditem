import { IsolatedCliRuntimeAdapter, type IsolatedCliRuntimeOptions } from './isolated-cli-runtime.adapter';

type ClaudeOptions = Omit<
  IsolatedCliRuntimeOptions,
  'runtimeType' | 'binary' | 'allowedBinary' | 'versionPattern' | 'startArgs' | 'resumeArgs'
>;

export class ClaudeCliRuntimeAdapter extends IsolatedCliRuntimeAdapter {
  constructor(options: ClaudeOptions) {
    super({
      ...options,
      runtimeType: 'claude_cli',
      binary: 'claude',
      allowedBinary: 'claude',
      versionPattern: /^claude 2\.\d+\.\d+$/,
      startArgs: ['--print', '--output-format', 'stream-json'],
      resumeArgs: ['--resume', '--print', '--output-format', 'stream-json'],
    });
  }
}
