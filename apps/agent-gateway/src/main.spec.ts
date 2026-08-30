import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { gatewayStartupFailureMessage } from './main';

describe('Native Agent Gateway entrypoint composition', () => {
  it('reports bounded startup codes without leaking arbitrary error details', () => {
    expect(gatewayStartupFailureMessage(new Error('gateway_config_invalid')))
      .toBe('gateway_config_invalid');
    expect(gatewayStartupFailureMessage(new Error('ENOENT /Users/dev/.secret/token')))
      .toBe('gateway_start_failed');
    expect(gatewayStartupFailureMessage('raw provider payload'))
      .toBe('gateway_start_failed');
  });

  it('composes control around the deep native provider runtime Interface', async () => {
    const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');

    expect(main).toContain("from './provider/native-provider-runtime'");
    expect(main).toContain('startNativeProviderRuntime({');
    expect(main).toContain('providers: runtime.providers');
    expect(main).toContain('onPollLoss: runtime.close');
    expect(main).not.toMatch(/\b(?:verifyGatewayRuntimePackages|verifyProviderLogin|codexProviderReadiness|claudeProviderReadiness)\b/);
  });
});
