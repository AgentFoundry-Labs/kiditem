import { afterEach, describe, expect, it } from 'vitest';
import {
  parseCreatedPlaywriterSessionId,
  isPlaywriterConnectionError,
  parsePlaywriterSessionIds,
  resolvePlaywriterCommand,
} from './playwriter-cli';

const ORIGINAL_PLAYWRITER_BIN = process.env.PLAYWRITER_BIN;

describe('resolvePlaywriterCommand', () => {
  afterEach(() => {
    if (ORIGINAL_PLAYWRITER_BIN === undefined) {
      delete process.env.PLAYWRITER_BIN;
    } else {
      process.env.PLAYWRITER_BIN = ORIGINAL_PLAYWRITER_BIN;
    }
  });

  it('uses the locally installed playwriter bin through node so PATH is not required', () => {
    delete process.env.PLAYWRITER_BIN;

    const command = resolvePlaywriterCommand(['session', 'list']);

    expect(command.command).toBe(process.execPath);
    expect(command.args[0]).toMatch(/node_modules\/playwriter\/bin\.js$/);
    expect(command.args.slice(1)).toEqual(['session', 'list']);
  });

  it('allows an explicit PLAYWRITER_BIN override', () => {
    process.env.PLAYWRITER_BIN = '/opt/bin/playwriter';

    expect(resolvePlaywriterCommand(['session', 'list'])).toEqual({
      command: '/opt/bin/playwriter',
      args: ['session', 'list'],
    });
  });
});

describe('parsePlaywriterSessionIds', () => {
  it('extracts active session ids from the CLI table and ignores empty state', () => {
    expect(
      parsePlaywriterSessionIds(`
ID  BROWSER  PROFILE  EXT  CWD  STATE KEYS
-------------------------------------------
1   Chrome   -        -    .    -
abc_2 Chrome -        -    .    page
`),
    ).toEqual(['1', 'abc_2']);

    expect(parsePlaywriterSessionIds('No active sessions\n')).toEqual([]);
  });
});

describe('parseCreatedPlaywriterSessionId', () => {
  it('extracts session ids from extension and direct creation output', () => {
    expect(parseCreatedPlaywriterSessionId('Session 7 created. Use with: playwriter -s 7 -e "..."')).toBe('7');
    expect(
      parseCreatedPlaywriterSessionId(
        'Discovering Chrome instances with debugging enabled...\nSession direct_8 created (direct CDP). Use with: playwriter -s direct_8 -e "..."',
      ),
    ).toBe('direct_8');
  });
});

describe('isPlaywriterConnectionError', () => {
  it('detects stale direct CDP session failures', () => {
    expect(isPlaywriterConnectionError('browserType.connectOverCDP: WebSocket error: connect ECONNREFUSED 127.0.0.1:9222')).toBe(true);
    expect(isPlaywriterConnectionError('Wing 스크레이프 실패')).toBe(false);
  });
});
