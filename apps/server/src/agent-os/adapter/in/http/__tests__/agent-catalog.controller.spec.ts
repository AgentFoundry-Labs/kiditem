import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AgentRosterResponseSchema } from '@kiditem/shared/agent-os';
import { describe, expect, it, vi } from 'vitest';
import { AgentCatalogService } from '../../../../application/service/agent-catalog.service';
import { AgentCatalogController } from '../agent-catalog.controller';

const ORG = '11111111-1111-1111-1111-111111111111';
const CANONICAL_TYPES = [
  'manager',
  'rules_evaluation',
  'rules_suggest',
  'ad_strategy',
  'chat',
  'sourcing',
  'listing',
  'thumbnail_analyst',
  'order',
  'channel_registration',
];

describe('AgentCatalogController', () => {
  it('exposes GET /agent-os/roster and forwards the active organization', async () => {
    expect(Reflect.getMetadata(PATH_METADATA, AgentCatalogController)).toBe('agent-os');
    const handler = Reflect.get(
      AgentCatalogController.prototype,
      'listRoster',
    ) as object;
    expect({
      method: Reflect.getMetadata(METHOD_METADATA, handler),
      path: Reflect.getMetadata(PATH_METADATA, handler),
    }).toEqual({ method: RequestMethod.GET, path: 'roster' });

    const repository = { listInstances: vi.fn().mockResolvedValue([]) };
    const service = new AgentCatalogService(repository as never, {} as never);
    const controller = new AgentCatalogController(service);
    const response = await controller.listRoster(ORG);

    expect(repository.listInstances).toHaveBeenCalledWith({ organizationId: ORG });
    expect(response.items.map((item) => item.definition.type)).toEqual(CANONICAL_TYPES);
    expect(AgentRosterResponseSchema.parse(response)).toEqual(response);
  });
});
