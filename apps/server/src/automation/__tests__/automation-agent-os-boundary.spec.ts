import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const AUTOMATION_ROOT = path.resolve(__dirname, '..');

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

function automationRel(): string {
  return path.relative(REPO_ROOT, AUTOMATION_ROOT);
}

describe('automation -> agent-os boundary', () => {
  it('does not import Agent OS runtime contracts or modules', () => {
    const auto = automationRel();
    const hits = rg(
      `--type ts --files-with-matches 'from .*agent-os|AgentOsModule|AGENT_RUNNER_PORT|AgentRunnerPort' ${auto} --glob '!**/__tests__/**'`,
    );

    expect(
      hits,
      `automation is deterministic; Agent OS must call automation, not the reverse:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('does not register or allow agent_task.create workflow nodes', () => {
    const auto = automationRel();
    const hits = rg(
      `--type ts --files-with-matches 'agent_task\\.create' ${auto} --glob '!**/__tests__/**'`,
    );

    expect(
      hits,
      `workflow nodes must not create Agent OS runs; route LLM work through an Agent OS entrypoint:\n${hits.join('\n')}`,
    ).toEqual([]);
  });
});
