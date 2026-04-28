import { describe, it, expect, vi } from 'vitest';
import { AgentTasksController } from './agent-tasks.controller';

const COMPANY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
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
  it('create forwards @CurrentCompany companyId to the service', () => {
    const { controller, service } = makeController();
    const body = { agentType: 'content', input: { productId: 'product-1' } };

    controller.create(body, COMPANY_ID);

    expect(service.create).toHaveBeenCalledWith('content', body.input, COMPANY_ID);
  });

  it('findAll forwards query and @CurrentCompany companyId to the service', () => {
    const { controller, service } = makeController();
    const query = { status: 'running', limit: 10 };

    controller.findAll(query, COMPANY_ID);

    expect(service.findAll).toHaveBeenCalledWith(query, COMPANY_ID);
  });

  it('findOne forwards id and @CurrentCompany companyId to the service', () => {
    const { controller, service } = makeController();

    controller.findOne(TASK_ID, COMPANY_ID);

    expect(service.findOne).toHaveBeenCalledWith(TASK_ID, COMPANY_ID);
  });

  it('cancel forwards id and @CurrentCompany companyId to the service', () => {
    const { controller, service } = makeController();

    controller.cancel(TASK_ID, COMPANY_ID);

    expect(service.cancel).toHaveBeenCalledWith(TASK_ID, COMPANY_ID);
  });
});
