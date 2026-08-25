import { describe, expect, it } from 'vitest';
import { redactForGatewayEvent, safeGatewayDiagnostic } from './redaction';

describe('Gateway redaction', () => {
  it('does not expose raw bindings or provider stderr in Gateway events or diagnostics', () => {
    const token = 'A'.repeat(43);
    const redacted = redactForGatewayEvent(`prompt\nBearer ${token}\nstderr: provider secret`, [token]);
    expect(redacted).not.toContain(token);
    expect(redacted).toContain('[provider diagnostics redacted]');
    expect(safeGatewayDiagnostic(new Error(`provider stderr ${token}`))).toEqual('gateway_provider_error');
  });
});
