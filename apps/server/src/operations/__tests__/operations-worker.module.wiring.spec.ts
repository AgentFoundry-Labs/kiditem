import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationsModule, OperationsWorkerModule } from '../operations.module';
import { OperationRunWorkerService } from '../application/service/operation-run-worker.service';
import { OperationSchedulerService } from '../application/service/operation-scheduler.service';
import { OperationWorkerLifecycleService } from '../application/service/operation-worker-lifecycle.service';

const active = [OperationRunWorkerService, OperationSchedulerService, OperationWorkerLifecycleService];

describe('OperationsWorkerModule wiring', () => {
  it('resolves active execution only from the worker composition', async () => {
    const worker = await Test.createTestingModule({ imports: [OperationsWorkerModule] })
      .overrideProvider(PrismaService).useValue({})
      .compile();
    try {
      for (const provider of active) expect(worker.get(provider, { strict: false })).toBeInstanceOf(provider);
      const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, OperationsWorkerModule) ?? [];
      for (const provider of active) expect(providers.filter((item: unknown) => item === provider)).toHaveLength(1);
    } finally { await worker.close(); }

    const core = await Test.createTestingModule({ imports: [OperationsModule] })
      .overrideProvider(PrismaService).useValue({})
      .compile();
    try {
      for (const provider of active) expect(() => core.get(provider, { strict: false })).toThrow();
    } finally { await core.close(); }
  });
});
