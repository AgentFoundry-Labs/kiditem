import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaAgentVersionRepository } from './adapter/out/repository/prisma-agent-version.repository';
import { FilesystemAgentDurableRuntimeAssetsAdapter } from './adapter/out/runtime/filesystem-agent-durable-runtime-assets.adapter';
import { FilesystemAgentRuntimeAssetsAdapter } from './adapter/out/runtime/filesystem-agent-runtime-assets.adapter';
import { FilesystemAgentRuntimeManifestCatalog } from './adapter/out/runtime/filesystem-agent-runtime-manifest-catalog';
import { AGENT_VERSION_REPOSITORY } from './application/port/out/repository/agent-version.repository.port';
import { AGENT_DURABLE_RUNTIME_ASSETS_PORT } from './application/port/out/runtime/agent-durable-runtime.port';
import { AGENT_RUNTIME_ASSETS_PORT } from './application/port/out/runtime/agent-runtime-assets.port';
import { AgentCatalogService } from './application/service/agent-catalog.service';
import {
  AGENT_RUNTIME_MANIFEST_CATALOG,
  AgentRuntimeCatalogStartupValidator,
} from './application/service/agent-runtime-catalog-startup-validator.service';
import { AgentRuntimeAssetsStartupValidator } from './application/service/agent-runtime-assets-startup-validator.service';
import { AgentVersionPublisher } from './application/service/agent-version-publisher.service';
import { resolveAgentOsRepositoryRoot } from './seed-agent-os';

/**
 * Code-owned definitions, immutable versions, runtime assets, and startup
 * validation. It remains controller-free and has no Operations dependency.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    AgentCatalogService,
    AgentRuntimeAssetsStartupValidator,
    AgentRuntimeCatalogStartupValidator,
    {
      provide: AgentVersionPublisher,
      inject: [AGENT_VERSION_REPOSITORY],
      useFactory: (repository: PrismaAgentVersionRepository) =>
        new AgentVersionPublisher(repository),
    },
    FilesystemAgentRuntimeAssetsAdapter,
    {
      provide: FilesystemAgentDurableRuntimeAssetsAdapter,
      useFactory: () => new FilesystemAgentDurableRuntimeAssetsAdapter(),
    },
    {
      provide: AGENT_RUNTIME_MANIFEST_CATALOG,
      useFactory: () =>
        new FilesystemAgentRuntimeManifestCatalog(resolveAgentOsRepositoryRoot()),
    },
    { provide: AGENT_VERSION_REPOSITORY, useClass: PrismaAgentVersionRepository },
    {
      provide: AGENT_RUNTIME_ASSETS_PORT,
      useExisting: FilesystemAgentRuntimeAssetsAdapter,
    },
    {
      provide: AGENT_DURABLE_RUNTIME_ASSETS_PORT,
      useExisting: FilesystemAgentDurableRuntimeAssetsAdapter,
    },
  ],
  exports: [
    AgentCatalogService,
    AgentRuntimeAssetsStartupValidator,
    AgentRuntimeCatalogStartupValidator,
    AgentVersionPublisher,
    AGENT_VERSION_REPOSITORY,
    AGENT_RUNTIME_ASSETS_PORT,
    AGENT_DURABLE_RUNTIME_ASSETS_PORT,
  ],
})
export class AgentOsCatalogModule {}
