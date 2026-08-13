import { describe, expect, it, vi } from 'vitest';
import type { AgentVersionRepositoryPort } from '../../port/out/repository/agent-version.repository.port';
import { AgentRuntimeCatalogStartupValidator } from '../agent-runtime-catalog-startup-validator.service';

describe('AgentRuntimeCatalogStartupValidator', () => {
  it('compiles every definition and checks the active database hash without publishing', async () => {
    const repository = {
      publishAndActivate: vi.fn(),
      findActiveByDefinitionKey: vi.fn().mockResolvedValue({ manifestHash: 'hash-1' }),
    } satisfies AgentVersionRepositoryPort;
    const validator = new AgentRuntimeCatalogStartupValidator(repository, {
      compileAll: vi.fn().mockResolvedValue([
        { agentDefinitionKey: 'manager', manifestHash: 'hash-1' },
      ]),
    });

    await validator.onApplicationBootstrap();

    expect(repository.findActiveByDefinitionKey).toHaveBeenCalledWith('manager');
    expect(repository.publishAndActivate).not.toHaveBeenCalled();
  });

  it('fails readiness when code and active database manifests drift', async () => {
    const repository = {
      publishAndActivate: vi.fn(),
      findActiveByDefinitionKey: vi
        .fn()
        .mockResolvedValue({ manifestHash: 'database-hash' }),
    } satisfies AgentVersionRepositoryPort;
    const validator = new AgentRuntimeCatalogStartupValidator(repository, {
      compileAll: vi.fn().mockResolvedValue([
        { agentDefinitionKey: 'manager', manifestHash: 'code-hash' },
      ]),
    });

    await expect(validator.onApplicationBootstrap()).rejects.toThrow(
      'AGENT_RUNTIME_MANIFEST_DRIFT:manager',
    );
    expect(repository.publishAndActivate).not.toHaveBeenCalled();
  });
});
