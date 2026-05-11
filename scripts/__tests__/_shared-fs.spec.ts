import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileSize, readJson, readTextIfExists, sha256, writeJson } from '../_shared/fs';

async function withTempDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'kiditem-fs-spec-'));
  return {
    dir,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

describe('scripts/_shared/fs', () => {
  describe('readJson / writeJson', () => {
    it('round-trips a JSON value through write + read', async () => {
      const { dir, cleanup } = await withTempDir();
      try {
        const file = path.join(dir, 'manifest.json');
        await writeJson(file, { profileId: 'workspace', count: 3 });
        const parsed = await readJson<{ profileId: string; count: number }>(file);
        expect(parsed).toEqual({ profileId: 'workspace', count: 3 });
      } finally {
        await cleanup();
      }
    });

    it('writeJson creates parent directories as needed', async () => {
      const { dir, cleanup } = await withTempDir();
      try {
        const file = path.join(dir, 'nested', 'deep', 'manifest.json');
        await writeJson(file, { ok: true });
        const text = await readFile(file, 'utf8');
        expect(text).toContain('"ok": true');
        expect(text.endsWith('\n')).toBe(true);
      } finally {
        await cleanup();
      }
    });
  });

  describe('sha256 / fileSize', () => {
    it('sha256 hashes file contents deterministically', async () => {
      const { dir, cleanup } = await withTempDir();
      try {
        const file = path.join(dir, 'payload.bin');
        await writeFile(file, 'hello\n');
        const digest = await sha256(file);
        // sha256("hello\n") known constant.
        expect(digest).toBe('5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03');
      } finally {
        await cleanup();
      }
    });

    it('fileSize returns the byte length', async () => {
      const { dir, cleanup } = await withTempDir();
      try {
        const file = path.join(dir, 'payload.bin');
        await writeFile(file, 'abc'); // 3 bytes
        expect(await fileSize(file)).toBe(3);
      } finally {
        await cleanup();
      }
    });
  });

  describe('readTextIfExists', () => {
    it('returns null when the file is missing', async () => {
      const { dir, cleanup } = await withTempDir();
      try {
        expect(await readTextIfExists(path.join(dir, 'missing.txt'))).toBeNull();
      } finally {
        await cleanup();
      }
    });

    it('returns trimmed text when the file exists', async () => {
      const { dir, cleanup } = await withTempDir();
      try {
        const file = path.join(dir, 'latest.txt');
        await writeFile(file, '  dataset-2026-05-12  \n', 'utf8');
        expect(await readTextIfExists(file)).toBe('dataset-2026-05-12');
      } finally {
        await cleanup();
      }
    });
  });
});
