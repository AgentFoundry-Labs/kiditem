import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { RunnerReadinessService } from '../../agent-os/adapter/out/runtime/runner/runner-readiness.service';
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
      expect(module.get(RunnerReadinessService)).toBeInstanceOf(RunnerReadinessService);
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
