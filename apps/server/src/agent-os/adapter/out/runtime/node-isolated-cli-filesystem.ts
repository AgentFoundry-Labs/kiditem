import { chmod, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import type { IsolatedCliFilesystem } from './isolated-cli-runtime.adapter';

export class NodeIsolatedCliFilesystem implements IsolatedCliFilesystem {
  private readonly root: string;

  constructor(runRoot: string) {
    this.root = resolve(runRoot);
  }

  mkdir(path: string, options: { recursive: true; mode: number }) {
    return mkdir(this.owned(path), options);
  }

  writeFile(
    path: string,
    value: string,
    options: { encoding: 'utf8'; mode: number },
  ) {
    return writeFile(this.owned(path), value, options);
  }

  chmod(path: string, mode: number) {
    return chmod(this.owned(path), mode);
  }

  async removeTree(input: { executionId: string; attemptId: string }): Promise<void> {
    await rm(this.scoped(input), { recursive: true, force: true });
  }

  async exists(input: { executionId: string; attemptId: string }): Promise<boolean> {
    try {
      await stat(this.scoped(input));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  private scoped(input: { executionId: string; attemptId: string }): string {
    return this.owned(join(this.root, input.executionId, input.attemptId));
  }

  private owned(path: string): string {
    const target = resolve(path);
    const rel = relative(this.root, target);
    if (!rel || rel.startsWith('..') || rel.includes('\u0000')) {
      if (target === this.root) return target;
      throw new Error('CLI_RUNTIME_FILESYSTEM_SCOPE_INVALID');
    }
    return target;
  }
}
