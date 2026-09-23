import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';

const requireFromHere = createRequire(__filename);

/**
 * Playwriter CLI 를 띄운다: `PLAYWRITER_BIN` → 설치된 `playwriter` 패키지의 bin → PATH 의 `playwriter`.
 * Content 의 `playwriter-cli` 와 같은 규칙이지만, 다른 owner 의 adapter 를 가져오지 않으려고
 * Channels runner 가 제 것을 둔다.
 */
export function spawnPlaywriter(args: string[], options: SpawnOptions = {}): ChildProcess {
  const override = process.env.PLAYWRITER_BIN?.trim();
  if (override) return spawn(override, args, options);
  const localBin = resolveLocalPlaywriterBin();
  if (localBin) return spawn(process.execPath, [localBin, ...args], options);
  return spawn('playwriter', args, options);
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
