import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..');
const seedPath = join(repoRoot, 'scripts/seed-agent-os.ts');
const promptBase = join(repoRoot, 'apps/server/agent-config/prompts/agents');

function blueprintPromptPairs() {
  const source = readFileSync(seedPath, 'utf8');
  return [...source.matchAll(/type: '([^']+)'[\s\S]*?promptPath: `\$\{PROMPT_BASE\}\/([^`]+)`/g)]
    .map((match) => ({ type: match[1], promptFile: match[2] }));
}

describe('Agent OS seed catalog', () => {
  it('seeds every shipped producer agent type that backend routes can enqueue', () => {
    const types = blueprintPromptPairs().map((pair) => pair.type);

    expect(types).toContain('ad_strategy');
    expect(types).toContain('image_edit');
    expect(types).toContain('sourcing');
  });

  it('points every seeded blueprint at an existing prompt file', () => {
    for (const pair of blueprintPromptPairs()) {
      expect(
        existsSync(join(promptBase, pair.promptFile)),
        `${pair.type} prompt does not exist: ${pair.promptFile}`,
      ).toBe(true);
    }
  });
});
