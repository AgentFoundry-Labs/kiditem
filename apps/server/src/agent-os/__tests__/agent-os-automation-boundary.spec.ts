import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const AGENT_OS_ROOT = path.resolve(__dirname, '..');

function rg(args: string): string[] {
  try {
    const out = execSync(`rg ${args}`, { cwd: REPO_ROOT, encoding: 'utf8' });
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 1) return [];
    throw err;
  }
}

function agentOsRel(): string {
  return path.relative(REPO_ROOT, AGENT_OS_ROOT);
}

describe('agent-os -> automation boundary', () => {
  it('reaches automation only through the module import or owner-side incoming ports', () => {
    const agentOs = agentOsRel();
    const hits = rg(
      `--type ts -n 'automation/' ${agentOs} --glob '!**/__tests__/**'`,
    );
    const violators = hits.filter((line) => {
      if (line.includes('agent-os/agent-os.module.ts:')) {
        return !line.includes('../automation/automation.module') &&
          !line.includes('./adapter/out/automation/');
      }
      if (line.includes('agent-os/adapter/out/automation/')) {
        return !line.includes('automation/application/port/in/');
      }
      return true;
    });

    expect(
      violators,
      `Agent OS may call automation only through AutomationModule or incoming ports:\n${violators.join('\n')}`,
    ).toEqual([]);
  });
});
