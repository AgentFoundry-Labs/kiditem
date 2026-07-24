import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readAgentConfig(relativePath: string): string {
  return readFileSync(join(process.cwd(), 'agent-config', relativePath), 'utf8');
}

describe('advertising agent stored ABC contract', () => {
  it('consumes the stored automatic grade without deriving it from ad performance', () => {
    const outputRules = readAgentConfig('rules/ad-strategy-output.md');
    const agentPrompt = readAgentConfig('prompts/agents/ad-strategy.md');

    expect(outputRules).toContain('저장한 `abc_grade`');
    expect(outputRules).toContain('미분류(null)');
    expect(outputRules).not.toContain('ROAS 480%+ 또는 자연매출 상위');
    expect(agentPrompt).toContain('ABC 등급을 재판정하지 않는다');
  });

  it('does not recommend manual promotion from order count', () => {
    const healthRules = readAgentConfig('rules/health-rules.md');

    expect(healthRules).not.toContain('A등급 승격');
    expect(healthRules).not.toContain('upgrade_grade');
  });
});
