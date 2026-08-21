import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const interactionRoot = resolve(__dirname, '..', '..', '..', '..', 'adapter', 'in', 'http', 'interaction');
const authorization = resolve(__dirname, '..', 'agent-interaction-authorization.service.ts');
const bootstrap = resolve(__dirname, '..', 'agent-interaction-bootstrap.service.ts');
const replayProjector = resolve(__dirname, '..', 'interaction-replay-projector.ts');

describe('interaction input seam', () => {
  it('keeps AG-UI HTTP as a driver adapter', () => {
    const controller = readFileSync(resolve(interactionRoot, 'agent-agui.controller.ts'), 'utf8');
    expect(controller).not.toMatch(/application\/port\/out/);
    expect(controller).not.toMatch(/application\/service\//);
    expect(readFileSync(authorization, 'utf8')).not.toContain('bootstrap(input');
    expect(readFileSync(authorization, 'utf8')).not.toContain('prepareRunIntent(input');
  });

  it('makes bootstrap a direct capability and keeps replay mapping capability-local', () => {
    const source = readFileSync(bootstrap, 'utf8');
    const authorizationSource = readFileSync(authorization, 'utf8');

    expect(source).not.toContain('AgentInteractionAuthorizationService');
    expect(authorizationSource).not.toContain('AgentInteractionBootstrapService');
    expect(source).toContain('resolvePrincipal(');
    expect(source).toContain('prepareRunIntent(');
    expect(() => readFileSync(replayProjector, 'utf8')).not.toThrow();
  });
});
