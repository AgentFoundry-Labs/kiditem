import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Source scanner for architecture specs (KID-258).
 *
 * `rg` reads stdin when it is given no path and stdin is a pipe, so a rule that
 * only passes `--glob` scans an empty stream and passes vacuously. This helper
 * always names its roots, closes stdin, counts the files it scanned, and fails
 * when that count is zero, so a rule can never pass because it looked at nothing.
 *
 * Test sources (`__tests__/`, `*.spec.ts`, `*.test.ts`) are always excluded:
 * architecture rules describe production code.
 */
export interface ScanSourceOptions {
  /** Absolute directories to scan. Must not be empty. */
  readonly roots: readonly string[];
  /** Regex handed to `rg -e`. Omit to list the scanned files instead. */
  readonly pattern?: string;
  /** Extra `--glob` filters (rg glob syntax), for example to negate a legacy folder or narrow to a layer. */
  readonly globs?: readonly string[];
  /** `'files'` (default) returns matching paths; `'lines'` returns `file:line:text`. */
  readonly mode?: 'files' | 'lines';
  /** Directory whose prefix is stripped from every result. Defaults to no stripping. */
  readonly relativeTo?: string;
}

export interface ScanSourceResult {
  /** Number of TypeScript files the rule actually looked at. */
  readonly scanned: number;
  /** Sorted matches (paths, or `file:line:text` in `'lines'` mode). */
  readonly hits: readonly string[];
}

const TEST_SOURCE_GLOBS = ['!**/__tests__/**', '!**/*.spec.ts', '!**/*.test.ts'] as const;

function runRg(args: readonly string[]): string[] {
  try {
    return execFileSync('rg', [...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split('\n')
      .filter(Boolean);
  } catch (error: unknown) {
    // rg exits 1 when nothing matched; anything else is a real failure.
    if ((error as { status?: number }).status === 1) return [];
    throw error;
  }
}

function stripPrefix(lines: readonly string[], relativeTo: string | undefined): string[] {
  if (!relativeTo) return [...lines];
  const prefix = `${relativeTo}${path.sep}`;
  return lines.map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line));
}

export function scanSource(options: ScanSourceOptions): ScanSourceResult {
  if (options.roots.length === 0) {
    throw new Error('scanSource: roots must not be empty');
  }
  const globArgs = [...TEST_SOURCE_GLOBS, ...(options.globs ?? [])].flatMap((glob) => [
    '--glob',
    glob,
  ]);
  const files = runRg(['--files', '--type', 'ts', ...globArgs, ...options.roots]);
  if (files.length === 0) {
    throw new Error(
      `scanSource: no TypeScript source under ${options.roots.join(', ')} with globs ${JSON.stringify(
        options.globs ?? [],
      )} — the rule would pass without looking at anything`,
    );
  }
  if (options.pattern === undefined) {
    return { scanned: files.length, hits: stripPrefix(files, options.relativeTo).sort() };
  }
  const modeArgs =
    options.mode === 'lines'
      ? ['--line-number', '--no-heading', '--with-filename']
      : ['--files-with-matches'];
  const hits = runRg([
    '--type',
    'ts',
    ...modeArgs,
    ...globArgs,
    '-e',
    options.pattern,
    ...options.roots,
  ]);
  return { scanned: files.length, hits: stripPrefix(hits, options.relativeTo).sort() };
}

/**
 * `rg` regex for a module reference whose specifier starts with `specifier`
 * (itself a regex fragment, for example `[^'"]*adapter/out/`). It matches
 * `import … from`, `export … from`, a bare `import '…'`, the closing
 * `} from '…'` line of a multi-line import, and an inline `import('…')` or
 * `require('…')` (including `import('…').Type` in a type position). A line
 * that starts as a comment, or a `//` comment before the call, is not a hit.
 */
export function importFromPattern(specifier: string): string {
  return (
    String.raw`^\s*(?:(?:import|export)\b.*\bfrom\s+|import\s+|\}\s*from\s+|(?:[^/*\s][^/]*)?\b(?:import|require)\s*\(\s*)['"]` +
    `(?:${specifier})`
  );
}

/** Owner-rooted shorthands shared by the architecture specs; results are relative to `ownerRoot`. */
export function ownerSource(ownerRoot: string) {
  return {
    /** Absolute path of a directory inside the owner. */
    at: (...segments: string[]): string => path.join(ownerRoot, ...segments),
    /** Files under `roots` that import or reference a module matching `specifier`. */
    importers: (roots: string[], specifier: string): string[] => [
      ...scanSource({ roots, pattern: importFromPattern(specifier), relativeTo: ownerRoot }).hits,
    ],
    /** Every production file of the owner. */
    ownerFiles: (): string[] => [...scanSource({ roots: [ownerRoot], relativeTo: ownerRoot }).hits],
  };
}
