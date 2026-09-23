import { afterEach, describe, expect, it } from 'vitest';
import {
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
