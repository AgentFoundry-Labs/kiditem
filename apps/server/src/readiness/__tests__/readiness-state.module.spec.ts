import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import {
  HOST_RUNNER_CONTROL_READINESS_PORT,
  type HostRunnerControlReadinessPort,
} from '../../agent-os/adapter/out/runtime/runner/host-runner-control-session.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ReadinessStateModule } from '../readiness-state.module';
import { ReadinessService } from '../readiness.service';

describe('ReadinessStateModule', () => {
  it('uses the exported process-memory Host Runner readiness projection', async () => {
    const previous = {
      version: process.env.KIDITEM_APPLICATION_VERSION,
      sha: process.env.KIDITEM_GIT_SHA,
    };
    process.env.KIDITEM_APPLICATION_VERSION = 'test';
    process.env.KIDITEM_GIT_SHA = 'a'.repeat(40);
    const module = await Test.createTestingModule({ imports: [ReadinessStateModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    try {
      expect(module.get(ReadinessService)).toBeInstanceOf(ReadinessService);
      const readiness = module.get<HostRunnerControlReadinessPort>(HOST_RUNNER_CONTROL_READINESS_PORT);
      expect(readiness).toMatchObject({
        beginCanary: expect.any(Function),
        assertRuntime: expect.any(Function),
        snapshot: expect.any(Function),
      });
    } finally {
      await module.close();
      restore('KIDITEM_APPLICATION_VERSION', previous.version);
      restore('KIDITEM_GIT_SHA', previous.sha);
    }
  });
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
