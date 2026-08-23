import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AgentCapabilityRegistry } from '../../agent-os/application/service/agent-capability-registry.service';
import { AgentOsApiExecutionModule } from '../../agent-os/agent-os-api-execution.module';
import { OperationsModule } from '../../operations/operations.module';
import { PrismaService } from '../../prisma/prisma.service';
import { SourcingAgentReadCapabilityModule } from '../sourcing-agent-read-capability.module';

describe('SourcingAgentReadCapabilityModule', () => {
  it('registers the exact foundation Sourcing reads without API or Operations reachability', async () => {
    const imports: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, SourcingAgentReadCapabilityModule) ?? [];
    expect(imports).not.toContain(OperationsModule);
    expect(imports).not.toContain(AgentOsApiExecutionModule);

    const moduleRef = await Test.createTestingModule({
      imports: [SourcingAgentReadCapabilityModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    await moduleRef.init();

    expect(
      moduleRef
        .get(AgentCapabilityRegistry)
        .list()
        .map((handler) => handler.key)
        .sort(),
    ).toEqual([
      'analytics.readOverview',
      'sourcing.inspectRecommendationRun',
      'sourcing.retrieveWorkspaceEvidence',
    ]);
    await moduleRef.close();
  });
});
