import { afterEach, describe, expect, it } from 'vitest';
import { buildClaudeCliEnv } from './claude-cli-env';

describe('buildClaudeCliEnv', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('does not pass blank Claude auth secrets to the child process', () => {
    process.env.ANTHROPIC_API_KEY = '';
    process.env.CLAUDE_CODE_OAUTH_TOKEN = '   ';

    const env = buildClaudeCliEnv();

    expect(env).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(env).not.toHaveProperty('CLAUDE_CODE_OAUTH_TOKEN');
  });

  it('passes configured Claude auth secrets', () => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-test-key';
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'oauth-test-token';

    const env = buildClaudeCliEnv();

    expect(env.ANTHROPIC_API_KEY).toBe('anthropic-test-key');
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe('oauth-test-token');
  });
});
