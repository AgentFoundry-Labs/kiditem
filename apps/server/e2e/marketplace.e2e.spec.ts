import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeApp, createApp } from './setup';

let api: ReturnType<Awaited<ReturnType<typeof createApp>>['request']>;

const MARKETPLACE_AGENT_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const MARKETPLACE_WORKFLOW_ID = 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f';

const RETIRED_AUTOMATION_MARKETPLACE_ROUTES = [
  { method: 'get', path: '/api/marketplace/agents' },
  { method: 'get', path: `/api/marketplace/agents/${MARKETPLACE_AGENT_ID}` },
  {
    method: 'post',
    path: `/api/marketplace/agents/${MARKETPLACE_AGENT_ID}/install`,
  },
  {
    method: 'post',
    path: `/api/marketplace/agents/${MARKETPLACE_AGENT_ID}/uninstall`,
  },
  { method: 'get', path: '/api/marketplace/workflows' },
  {
    method: 'get',
    path: `/api/marketplace/workflows/${MARKETPLACE_WORKFLOW_ID}`,
  },
  {
    method: 'post',
    path: `/api/marketplace/workflows/${MARKETPLACE_WORKFLOW_ID}/install`,
  },
  {
    method: 'post',
    path: `/api/marketplace/workflows/${MARKETPLACE_WORKFLOW_ID}/uninstall`,
  },
] as const;

beforeAll(async () => {
  const app = await createApp();
  api = app.request;
});

afterAll(async () => {
  await closeApp();
});

/**
 * KID-33 removed the unused Automation catalog/install feature without a
 * compatibility API. Commerce marketplace registration remains owned by
 * Channels and is unrelated to these retired routes.
 */
describe('Retired Automation Marketplace HTTP boundary', () => {
  it.each(RETIRED_AUTOMATION_MARKETPLACE_ROUTES)(
    '$method $path remains absent',
    async ({ method, path }) => {
      const response =
        method === 'get'
          ? await api().get(path)
          : await api().post(path).send({});

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        message: `Cannot ${method.toUpperCase()} ${path}`,
        error: 'Not Found',
        path,
        statusCode: 404,
      });
    },
  );
});
