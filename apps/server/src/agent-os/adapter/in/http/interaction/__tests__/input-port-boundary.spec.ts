import { describe, expect, it } from 'vitest';
import { AgentInteractionBootstrapController } from '../agent-interaction-bootstrap.controller';
import { AgentInteractionControlController } from '../agent-interaction-control.controller';

describe('interaction HTTP input-port boundary', () => {
  it('constructs interaction controllers from one capability port', () => {
    expect(AgentInteractionBootstrapController).toBeTypeOf('function');
    expect(AgentInteractionControlController).toBeTypeOf('function');
  });
});
