import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Shared file-system helpers for repo scripts. Three callers (`dev-data.ts`,
 * `dev-data-coupang.ts`, `staging-db-baseline.ts`) used to inline identical
 * `readJson` / `writeJson` / `sha256` / `fileSize` bodies. The
 * staging-db-baseline copy renamed `sha256` → `sha256File` but the body is
 * the same. This module is the single source of truth.
 */

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

export async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function sha256(file: string): Promise<string> {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

export async function fileSize(file: string): Promise<number> {
  return (await stat(file)).size;
}

/**
 * Read a file as utf-8 text, returning `null` if it does not exist. Output
 * is trimmed because every caller (latest.txt, dataset id sidecars) reads a
 * single-line marker file and would otherwise have to `.trim()` itself.
 */
export async function readTextIfExists(file: string): Promise<string | null> {
  try {
    return (await readFile(file, 'utf8')).trim();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}
