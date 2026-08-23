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
      versionPattern: /^(?:claude\s+)?\d+\.\d+\.\d+(?:\s+\(Claude Code\))?$/,
      startArgs: [
        '--print',
        '--verbose',
        '--output-format',
        'stream-json',
        '--setting-sources',
        '',
        '--tools',
        '',
        '--strict-mcp-config',
        '--no-chrome',
        '--permission-mode',
        'dontAsk',
        '--disable-slash-commands',
      ],
      resumeArgs: [
        '--resume',
        '--print',
        '--verbose',
        '--output-format',
        'stream-json',
        '--setting-sources',
        '',
        '--tools',
        '',
        '--strict-mcp-config',
        '--no-chrome',
        '--permission-mode',
        'dontAsk',
        '--disable-slash-commands',
      ],
    });
  }
}
