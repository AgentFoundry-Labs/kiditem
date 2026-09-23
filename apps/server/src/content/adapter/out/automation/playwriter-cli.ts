import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';

const requireFromHere = createRequire(__filename);

export interface PlaywriterCommand {
  command: string;
  args: string[];
}

export function resolvePlaywriterCommand(args: string[]): PlaywriterCommand {
  const override = process.env.PLAYWRITER_BIN?.trim();
  if (override) return { command: override, args };

  const localBin = resolveLocalPlaywriterBin();
  if (localBin) {
    return { command: process.execPath, args: [localBin, ...args] };
  }

  return { command: 'playwriter', args };
}

export function spawnPlaywriter(args: string[], options: SpawnOptions = {}): ChildProcess {
  const resolved = resolvePlaywriterCommand(args);
  return spawn(resolved.command, resolved.args, options);
}

function resolveLocalPlaywriterBin(): string | null {
  try {
    const packageJson = requireFromHere.resolve('playwriter/package.json');
    const binPath = path.join(path.dirname(packageJson), 'bin.js');
    return existsSync(binPath) ? binPath : null;
  } catch {
    return null;
  }
}
