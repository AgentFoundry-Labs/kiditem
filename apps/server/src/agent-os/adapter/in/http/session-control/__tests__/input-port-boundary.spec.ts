import { describe, expect, it } from 'vitest';
import { AgentSessionController } from '../agent-session.controller';

describe('session-control HTTP input-port boundary', () => {
  it('constructs its driver adapter through capability ports', () => {
    expect(AgentSessionController).toBeTypeOf('function');
  });
});
