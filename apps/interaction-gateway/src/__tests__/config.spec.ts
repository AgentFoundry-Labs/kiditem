import { describe, expect, it } from 'vitest';

import { parseGatewayConfig } from '../config.js';

const validEnvironment = () => ({
  INTERACTION_GATEWAY_PORT: '4100',
  KIDITEM_API_INTERNAL_URL: 'http://api:4000',
  AGENT_OS_AGUI_INTERNAL_URL: 'http://api:4000/api/agent-os/ag-ui',
  INTERACTION_GATEWAY_SHARED_SECRET: 's'.repeat(32),
  COPILOTKIT_TELEMETRY_DISABLED: '1',
});

describe('parseGatewayConfig', () => {
  it('requires every gateway value and telemetry opt-out', () => {
    expect(() => parseGatewayConfig({})).toThrow('INTERACTION_GATEWAY_PORT');
    expect(() =>
      parseGatewayConfig({
        ...validEnvironment(),
        COPILOTKIT_TELEMETRY_DISABLED: '0',
      }),
    ).toThrow('COPILOTKIT_TELEMETRY_DISABLED');
  });

  it.each([
    'COPILOTKIT_ENTERPRISE_API_URL',
    'COPILOTKIT_INTELLIGENCE_API_KEY',
    'COPILOTKIT_PREMIUM_TOKEN',
    'COPILOTKIT_LICENSE_TOKEN',
  ])('rejects excluded product configuration %s', (key) => {
    expect(() =>
      parseGatewayConfig({ ...validEnvironment(), [key]: 'configured' }),
    ).toThrow('Enterprise/Premium configuration is not supported');
  });

  it('maps only declared values and ignores unrelated environment', () => {
    expect(
      parseGatewayConfig({
        ...validEnvironment(),
        DATABASE_URL: 'postgresql://must-not-leak',
        AWS_SECRET_ACCESS_KEY: 'must-not-leak',
      }),
    ).toEqual({
      port: 4100,
      kidItemApiInternalUrl: 'http://api:4000',
      agentOsAguiInternalUrl: 'http://api:4000/api/agent-os/ag-ui',
      interactionGatewaySharedSecret: 's'.repeat(32),
      telemetryDisabled: true,
    });
  });

  it('rejects invalid ports, URLs, and short service secrets', () => {
    expect(() =>
      parseGatewayConfig({
        ...validEnvironment(),
        INTERACTION_GATEWAY_PORT: '0',
      }),
    ).toThrow();
    expect(() =>
      parseGatewayConfig({
        ...validEnvironment(),
        KIDITEM_API_INTERNAL_URL: 'not-a-url',
      }),
    ).toThrow();
    expect(() =>
      parseGatewayConfig({
        ...validEnvironment(),
        INTERACTION_GATEWAY_SHARED_SECRET: 'short',
      }),
    ).toThrow();
  });
});
