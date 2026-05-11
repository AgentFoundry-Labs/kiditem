import { describe, expect, it } from 'vitest';
import {
  bool,
  parseRawArgs,
  pushValue,
  requiredValue,
  value,
  values,
} from '../_shared/cli-args';

const COMMANDS = ['status', 'run', 'replay'] as const;

describe('scripts/_shared/cli-args.parseRawArgs', () => {
  it('uses defaultCommand when argv is empty', () => {
    const args = parseRawArgs([], { commands: COMMANDS, defaultCommand: 'status' });
    expect(args.command).toBe('status');
    expect(args.values.size).toBe(0);
    expect(args.flags.size).toBe(0);
  });

  it('parses --key value pairs into values map', () => {
    const args = parseRawArgs(['run', '--profile', 'workspace'], {
      commands: COMMANDS,
      defaultCommand: 'status',
    });
    expect(args.command).toBe('run');
    expect(value(args, 'profile')).toBe('workspace');
  });

  it('parses --key=value form into values map', () => {
    const args = parseRawArgs(['run', '--profile=workspace'], {
      commands: COMMANDS,
      defaultCommand: 'status',
    });
    expect(value(args, 'profile')).toBe('workspace');
  });

  it('treats trailing --flag (no value) as flag', () => {
    const args = parseRawArgs(['run', '--dry'], { commands: COMMANDS, defaultCommand: 'status' });
    expect(args.flags.has('dry')).toBe(true);
  });

  it('treats --flag followed by another --key as flag, not value', () => {
    const args = parseRawArgs(['run', '--dry', '--profile', 'workspace'], {
      commands: COMMANDS,
      defaultCommand: 'status',
    });
    expect(args.flags.has('dry')).toBe(true);
    expect(value(args, 'profile')).toBe('workspace');
  });

  it('keeps the first equals split — --x=a=b parses key x value a=b', () => {
    const args = parseRawArgs(['run', '--x=a=b'], { commands: COMMANDS, defaultCommand: 'status' });
    expect(value(args, 'x')).toBe('a=b');
  });

  it('accumulates repeated --key occurrences into values()', () => {
    const args = parseRawArgs(['run', '--tag', 'one', '--tag', 'two'], {
      commands: COMMANDS,
      defaultCommand: 'status',
    });
    expect(values(args, 'tag')).toEqual(['one', 'two']);
    // value() returns the last occurrence (preserves dev-data semantics).
    expect(value(args, 'tag')).toBe('two');
  });

  it('throws on unknown command', () => {
    expect(() =>
      parseRawArgs(['nope'], { commands: COMMANDS, defaultCommand: 'status' }),
    ).toThrow(/Unknown command/);
  });

  it('throws on positional argv after the command verb', () => {
    expect(() =>
      parseRawArgs(['run', 'bare-positional'], { commands: COMMANDS, defaultCommand: 'status' }),
    ).toThrow(/Unexpected argument/);
  });
});

describe('scripts/_shared/cli-args accessors', () => {
  function makeArgs(): ReturnType<typeof parseRawArgs<'run'>> {
    return parseRawArgs(['run', '--name=alice', '--retry=true', '--dry'], {
      commands: ['run'] as const,
      defaultCommand: 'run',
    });
  }

  it('bool() returns true for --flag presence', () => {
    expect(bool(makeArgs(), 'dry')).toBe(true);
  });

  it('bool() returns true when value is literal "true"', () => {
    expect(bool(makeArgs(), 'retry')).toBe(true);
  });

  it('bool() returns false when key is absent', () => {
    expect(bool(makeArgs(), 'missing')).toBe(false);
  });

  it('pushValue() appends to the existing values list', () => {
    const map = new Map<string, string[]>();
    pushValue(map, 'tag', 'one');
    pushValue(map, 'tag', 'two');
    expect(map.get('tag')).toEqual(['one', 'two']);
  });

  it('requiredValue() resolves from argv', () => {
    expect(requiredValue(makeArgs(), 'name')).toBe('alice');
  });

  it('requiredValue() falls back to envName', () => {
    const args = parseRawArgs(['run'], { commands: ['run'] as const, defaultCommand: 'run' });
    process.env.TEST_REQ_FALLBACK = 'from-env';
    try {
      expect(requiredValue(args, 'name', 'TEST_REQ_FALLBACK')).toBe('from-env');
    } finally {
      delete process.env.TEST_REQ_FALLBACK;
    }
  });

  it('requiredValue() throws when neither argv nor envName supplies a value', () => {
    const args = parseRawArgs(['run'], { commands: ['run'] as const, defaultCommand: 'run' });
    expect(() => requiredValue(args, 'name')).toThrow(/Missing --name/);
    expect(() => requiredValue(args, 'name', 'NOT_SET_ENV_VAR_XYZ')).toThrow(
      /Missing --name or NOT_SET_ENV_VAR_XYZ/,
    );
  });
});
