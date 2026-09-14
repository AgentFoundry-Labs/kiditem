import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readAgentConfig(relativePath: string): string {
  return readFileSync(join(process.cwd(), 'agent-config', relativePath), 'utf8');
}

describe('advertising agent published ABC contract', () => {
  it('consumes the published automatic grade without deriving it from ad performance', () => {
    const outputRules = readAgentConfig('rules/ad-strategy-output.md');
    const agentPrompt = readAgentConfig('prompts/agents/ad-strategy.md');
    const operationRules = readAgentConfig('rules/operations.md');

    expect(outputRules).toContain('Products가 발행한 공식 ABC 평가 등급만 사용');
    expect(outputRules).toContain('미분류(null)');
    expect(outputRules).not.toContain('ROAS 480%+ 또는 자연매출 상위');
    expect(agentPrompt).toContain('ABC 등급을 재판정하지 않는다');
    // The grade is Products' published evaluation, never a product column.
    for (const prompt of [outputRules, agentPrompt, operationRules]) {
      expect(prompt).not.toContain('abc_grade');
    }
  });
});
