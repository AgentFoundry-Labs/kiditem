import { describe, expect, it, vi } from 'vitest';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import { AgentRuntimeAssetsStartupValidator } from '../agent-runtime-assets-startup-validator.service';
import type { AgentRuntimeAssetsPort } from '../../port/out/runtime/agent-runtime-assets.port';

describe('AgentRuntimeAssetsStartupValidator', () => {
  it('fails server startup when a configured runtime asset cannot be resolved', async () => {
    const assets = {
      resolve: vi
        .fn<AgentRuntimeAssetsPort['resolve']>()
        .mockRejectedValueOnce(
          new AgentOsRuntimeError(
            'runtime_asset_missing',
            'Missing sourcing prompt.',
          ),
        ),
    };
    const validator = new AgentRuntimeAssetsStartupValidator(assets);

    await expect(validator.onApplicationBootstrap()).rejects.toMatchObject({
      code: 'runtime_asset_missing',
    });
  });
});
