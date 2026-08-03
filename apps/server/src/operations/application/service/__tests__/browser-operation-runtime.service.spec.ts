import { describe, expect, it, vi } from 'vitest';
import type { OperationHandlerRegistryPort } from '../../port/in/operation-handler-registry.port';
import type { OperationRunRepositoryPort } from '../../port/out/repository/operation.repository.port';
import { BrowserOperationRuntimeService } from '../browser-operation-runtime.service';

const ORG_ID = 'df3b198e-5b31-4f86-b054-bbf4852536a5';
const RUN_ID = 'c2e779aa-f5bf-42c2-91f2-dc10be211c71';
const OLD_TOKEN = 'ced54820-ab09-4f4b-864c-2a3f873bb24d';

const registry: OperationHandlerRegistryPort = {
  register: vi.fn(),
  getDefinition: vi.fn(),
  getHandler: vi.fn(),
  parseInput: vi.fn(),
  listDefinitions: vi.fn(),
};

describe('BrowserOperationRuntimeService', () => {
  it('rejects a report from a stale browser lease token', async () => {
    const repository = {
      transition: vi.fn().mockResolvedValue(null),
    } as unknown as OperationRunRepositoryPort;
    const service = new BrowserOperationRuntimeService(registry, repository);

    await expect(
      service.report({
        organizationId: ORG_ID,
        runId: RUN_ID,
        attemptToken: OLD_TOKEN,
        status: 'succeeded',
        result: { imported: 10 },
      }),
    ).rejects.toThrow('browser_runtime_fence_lost');
  });
});
