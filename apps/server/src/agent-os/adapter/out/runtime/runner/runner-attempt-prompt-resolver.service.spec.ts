import { describe, expect, it } from 'vitest';
import { RunnerAttemptPromptResolverService } from './runner-attempt-prompt-resolver.service';

describe('RunnerAttemptPromptResolverService', () => {
  it('combines only an immutable published profile with bounded durable work', async () => {
    const resolver = new RunnerAttemptPromptResolverService();

    await expect(resolver.resolve({
      reference: 'agent-config/prompts/agents/operator.md',
      prompt: 'Handle the durable work.',
    })).resolves.toContain('# Current durable work\nHandle the durable work.');
    await expect(resolver.resolve({ reference: '../secret.md', prompt: 'work' }))
      .rejects.toThrow('attempt_instruction_profile_invalid');
  });
});
