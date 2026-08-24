import { describe, expect, it } from 'vitest';
import { redactForRunnerEvent, safeDiagnostic, stripAttemptTokenFromModelEnvironment } from './redaction';

describe('Runner redaction', () => {
  it('does not expose raw tokens, prompts, or stderr in diagnostics or model-visible environment', () => {
    const token = 'A'.repeat(43);
    expect(redactForRunnerEvent(`prompt\nBearer ${token}\nstderr: provider secret`, [token])).not.toContain(token);
    expect(safeDiagnostic(new Error(`provider stderr ${token}`))).toEqual('provider_runtime_error');
    expect(stripAttemptTokenFromModelEnvironment({ KIDITEM_ATTEMPT_MCP_TOKEN: token, SAFE: 'yes' })).toEqual({ SAFE: 'yes' });
  });
});
