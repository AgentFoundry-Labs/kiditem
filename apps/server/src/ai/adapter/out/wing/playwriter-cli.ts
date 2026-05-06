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

export function parsePlaywriterSessionIds(stdout: string): string[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !/^no active sessions/i.test(line) &&
        !/^ID\b/i.test(line) &&
        !/^-+$/.test(line),
    )
    .map((line) => line.split(/\s+/)[0])
    .filter((id) => /^[A-Za-z0-9_-]+$/.test(id));
}

export function parseCreatedPlaywriterSessionId(stdout: string): string | null {
  return stdout.match(/\bSession\s+([A-Za-z0-9_-]+)\s+created\b/)?.[1] ?? null;
}

export function isPlaywriterConnectionError(message: string): boolean {
  return /connectOverCDP|ECONNREFUSED|websocket error|browser closed|connection issue/i.test(message);
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
