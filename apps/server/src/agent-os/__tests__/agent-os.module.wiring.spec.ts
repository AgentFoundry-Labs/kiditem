import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { StorageModule } from '../../common/storage/storage.module';
import { StorageAgentSessionArtifactAdapter } from '../adapter/out/storage/storage-agent-session-artifact.adapter';
import { AGENT_SESSION_ARTIFACT_WRITER_PORT } from '../application/port/in/session-execution/agent-session-artifact-writer.port';
import { AGENT_SESSION_ARTIFACT_MATERIALIZATION_TRANSACTION } from '../application/port/out/transaction/session-control/agent-session-artifact-materialization.transaction.port';
import { AgentSessionArtifactWriterService } from '../application/service/session-execution/agent-session-artifact-writer.service';
import { AgentOsApiExecutionModule } from '../agent-os-api-execution.module';
import { AgentOsHttpModule } from '../agent-os-http.module';
import { AgentOsSessionModule } from '../agent-os-session.module';

const imports = (module: unknown) => Reflect.getMetadata(MODULE_METADATA.IMPORTS, module) ?? [];
const providers = (module: unknown) => Reflect.getMetadata(MODULE_METADATA.PROVIDERS, module) ?? [];
const exportsOf = (module: unknown) => Reflect.getMetadata(MODULE_METADATA.EXPORTS, module) ?? [];
const controllers = (module: unknown) => Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module) ?? [];

describe('Agent OS artifact materialization composition', () => {
  it('keeps the materialization transaction controller-free in the session module', () => {
    expect(exportsOf(AgentOsSessionModule)).toContain(AGENT_SESSION_ARTIFACT_MATERIALIZATION_TRANSACTION);
    expect(controllers(AgentOsSessionModule)).toEqual([]);
  });

  it('composes storage and the writer only in the API execution wrapper', () => {
    expect(imports(AgentOsApiExecutionModule)).toContain(StorageModule);
    expect(providers(AgentOsApiExecutionModule)).toContain(StorageAgentSessionArtifactAdapter);
    expect(providers(AgentOsApiExecutionModule)).toContain(AgentSessionArtifactWriterService);
    expect(exportsOf(AgentOsApiExecutionModule)).toContain(AGENT_SESSION_ARTIFACT_WRITER_PORT);
    expect(imports(AgentOsHttpModule)).toContain(AgentOsApiExecutionModule);
  });

  it('composes neither lifecycle nor deletion HTTP controllers before the live cutover', () => {
    const names = controllers(AgentOsHttpModule).map((item: { name?: string }) => item.name);
    expect(names).not.toContain('AgentInteractionSessionLifecycleController');
    expect(names).not.toContain('AgentSessionDeletionController');
  });
});
