import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Native Agent Gateway entrypoint composition', () => {
  it('composes control around the deep native provider runtime Interface', async () => {
    const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');

    expect(main).toContain("from './provider/native-provider-runtime'");
    expect(main).toContain('startNativeProviderRuntime({');
    expect(main).toContain('providers: runtime.providers');
    expect(main).toContain('onPollLoss: runtime.close');
    expect(main).not.toMatch(/\b(?:verifyGatewayRuntimePackages|verifyProviderLogin|codexProviderReadiness|claudeProviderReadiness)\b/);
  });
});
