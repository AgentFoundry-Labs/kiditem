import { describe, it, expect, vi } from 'vitest';
import { AgentTasksController } from './agent-tasks.controller';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TASK_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeService() {
  return {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    cancel: vi.fn(),
  };
}

function makeController(service = makeService()) {
  const controller = new AgentTasksController(service as any);
  return { controller, service };
}

describe('AgentTasksController', () => {
  it('create forwards @CurrentOrganization organizationId to the service', () => {
    const { controller, service } = makeController();
    const body = { agentType: 'content', input: { productId: 'product-1' } };

    controller.create(body, ORGANIZATION_ID);

    expect(service.create).toHaveBeenCalledWith('content', body.input, ORGANIZATION_ID);
  });

  it('findAll forwards query and @CurrentOrganization organizationId to the service', () => {
    const { controller, service } = makeController();
    const query = { status: 'running', limit: 10 };

    controller.findAll(query, ORGANIZATION_ID);

    expect(service.findAll).toHaveBeenCalledWith(query, ORGANIZATION_ID);
  });

  it('findOne forwards id and @CurrentOrganization organizationId to the service', () => {
    const { controller, service } = makeController();

    controller.findOne(TASK_ID, ORGANIZATION_ID);

    expect(service.findOne).toHaveBeenCalledWith(TASK_ID, ORGANIZATION_ID);
  });

  it('cancel forwards id and @CurrentOrganization organizationId to the service', () => {
    const { controller, service } = makeController();

    controller.cancel(TASK_ID, ORGANIZATION_ID);

    expect(service.cancel).toHaveBeenCalledWith(TASK_ID, ORGANIZATION_ID);
  });
});
