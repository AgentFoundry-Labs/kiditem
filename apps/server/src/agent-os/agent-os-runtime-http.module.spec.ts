import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { AttemptMcpHttpController } from './adapter/in/http/runtime/attempt-mcp-http.controller';
import { RunnerControlController } from './adapter/in/http/runtime/runner-control.controller';
import { HostRunnerAttemptExecutorService } from './adapter/out/runtime/runner/host-runner-attempt-executor.service';
import { AgentOsRuntimeHttpModule } from './agent-os-runtime-http.module';

describe('AgentOsRuntimeHttpModule', () => {
  it('wires internal HTTP controllers to the Host Runner boundary without a legacy broker or executor', async () => {
    const previous = captureRuntimeEnvironment();
    setRuntimeEnvironment();
    const module = await Test.createTestingModule({ imports: [AgentOsRuntimeHttpModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    try {
      expect(module.get(RunnerControlController)).toBeInstanceOf(RunnerControlController);
      expect(module.get(AttemptMcpHttpController)).toBeInstanceOf(AttemptMcpHttpController);
      expect(module.get(HostRunnerAttemptExecutorService)).toBeInstanceOf(HostRunnerAttemptExecutorService);
    } finally {
      await module.close();
      restoreRuntimeEnvironment(previous);
    }
  });
});

function captureRuntimeEnvironment() {
  return Object.fromEntries([
    'KIDITEM_APPLICATION_VERSION',
    'KIDITEM_GIT_SHA',
    'PORT',
  ].map((name) => [name, process.env[name]]));
}

function setRuntimeEnvironment(): void {
  process.env.KIDITEM_APPLICATION_VERSION = 'test';
  process.env.KIDITEM_GIT_SHA = 'a'.repeat(40);
  process.env.PORT = '4000';
}

function restoreRuntimeEnvironment(previous: Record<string, string | undefined>): void {
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
