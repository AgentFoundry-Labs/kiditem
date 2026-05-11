import os from 'node:os';
import path from 'node:path';

/**
 * Shared path helpers for repo scripts. `expandHome` resolves `~/...` style
 * paths against the current user's HOME (drive integrations stash bundles
 * in user-scoped folders). `repoPath` builds an absolute path from the repo
 * root regardless of where the script was invoked from. `assertSafeRelativePath`
 * blocks `..` traversal and absolute paths inside archived manifest entries.
 */

export function expandHome(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

export function repoPath(...parts: string[]): string {
  return path.resolve(process.cwd(), ...parts);
}

/**
 * Reject absolute paths and any `..` token before joining onto a trusted
 * root directory. Preserves the broader-but-safer behavior of the inline
 * dev-data helpers — `foo/..bar` is rejected because `.includes('..')` is
 * conservative on purpose (manifest entries with `..` substrings are
 * never expected).
 */
export function assertSafeRelativePath(relativePath: string): void {
  if (path.isAbsolute(relativePath) || relativePath.includes('..')) {
    throw new Error(`Unsafe bundle path: ${relativePath}`);
  }
}
