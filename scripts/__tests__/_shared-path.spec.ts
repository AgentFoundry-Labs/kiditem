import { describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { assertSafeRelativePath, expandHome, repoPath } from '../_shared/path';

describe('scripts/_shared/path', () => {
  describe('expandHome', () => {
    it('returns os.homedir() for exactly "~"', () => {
      expect(expandHome('~')).toBe(os.homedir());
    });

    it('expands "~/foo" to <home>/foo', () => {
      expect(expandHome('~/foo')).toBe(path.join(os.homedir(), 'foo'));
    });

    it('leaves non-tilde paths untouched', () => {
      expect(expandHome('/abs/path')).toBe('/abs/path');
      expect(expandHome('relative/sub')).toBe('relative/sub');
    });
  });

  describe('repoPath', () => {
    it('resolves a path under process.cwd()', () => {
      expect(repoPath('packages', 'shared')).toBe(path.resolve(process.cwd(), 'packages', 'shared'));
    });

    it('returns process.cwd() when no parts are given', () => {
      expect(repoPath()).toBe(path.resolve(process.cwd()));
    });
  });

  describe('assertSafeRelativePath', () => {
    it('passes for plain relative paths', () => {
      expect(() => assertSafeRelativePath('payloads/foo.json')).not.toThrow();
    });

    it('rejects absolute paths', () => {
      expect(() => assertSafeRelativePath('/etc/passwd')).toThrow(/Unsafe bundle path/);
    });

    it('rejects paths containing "..", even partial matches (conservative)', () => {
      expect(() => assertSafeRelativePath('../escape')).toThrow(/Unsafe bundle path/);
      expect(() => assertSafeRelativePath('payloads/../escape')).toThrow(/Unsafe bundle path/);
      // The inline helper this replaces also treats `..bar` as unsafe — substring
      // match on '..' is intentional. Manifest entries with `..` in real names
      // are not expected.
      expect(() => assertSafeRelativePath('payloads/..bar.json')).toThrow(/Unsafe bundle path/);
    });
  });
});
