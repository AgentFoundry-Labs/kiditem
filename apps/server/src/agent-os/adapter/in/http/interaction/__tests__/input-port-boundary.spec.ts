import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AgentInteractionBootstrapController } from '../agent-interaction-bootstrap.controller';
import { AgentInteractionControlController } from '../agent-interaction-control.controller';
import { AgentInteractionSessionLifecycleController } from '../agent-interaction-session-lifecycle.controller';

describe('interaction HTTP input-port boundary', () => {
  it('constructs interaction controllers from one capability port', () => {
    expect(AgentInteractionBootstrapController).toBeTypeOf('function');
    expect(AgentInteractionControlController).toBeTypeOf('function');
    expect(AgentInteractionSessionLifecycleController).toBeTypeOf('function');
  });

  it('keeps the lifecycle HTTP adapter independent from concrete service and transaction implementations', () => {
    const source = readFileSync(
      new URL('../agent-interaction-session-lifecycle.controller.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain('AGENT_INTERACTION_SESSION_LIFECYCLE_PORT');
    expect(source).not.toContain('AgentInteractionSessionLifecycleService');
    expect(source).not.toContain('PrismaAgentSessionLifecycleTransaction');
  });
});
