import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AgentOsWorkerModule } from './agent-os/agent-os-worker.module';
import { AgentWorkerApplicationModule } from './agent-worker-application.module';

describe('AgentWorkerApplicationModule', () => {
  it('does not start an Operation or Automation background runtime', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, AgentWorkerApplicationModule))
      .toEqual([AgentOsWorkerModule]);
    for (const key of [MODULE_METADATA.PROVIDERS, MODULE_METADATA.CONTROLLERS]) {
      expect(Reflect.getMetadata(key, AgentWorkerApplicationModule) ?? []).toEqual([]);
    }
    for (const key of Object.values(MODULE_METADATA)) {
      expect(Reflect.getMetadata(key, AgentOsWorkerModule) ?? []).toEqual([]);
    }
  });

  it('removes the disconnected Operation owner-worker composition', () => {
    expect(existsSync(resolve(__dirname, 'operations/operation-owner-worker.module.ts')))
      .toBe(false);
  });
});
