import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  configureAgentRuntimeBodyParsers,
  isMcpJsonRequest,
  isOrdinaryApiJsonRequest,
} from '../agent-runtime-body-parser';
import { configureApiGlobalPrefix } from '../agent-runtime-route';

describe('generic API and Agent runtime JSON parser composition', () => {
  it('keeps ordinary API JSON at 25MiB and bounds only the fresh MCP ingress at 512KiB', () => {
    const app = express();
    configureAgentRuntimeBodyParsers(app as never);
    app.post('/internal/agent-runtime/mcp', (req, res) => res.status(200).json(req.body));
    app.post('/api/body', (req, res) => res.status(200).json(req.body));

    return request(app)
      .post('/internal/agent-runtime/mcp')
      .set('content-type', 'application/json')
      .send({ payload: 'x'.repeat(513 * 1024) })
      .expect(413)
      .then(() => request(app)
        .post('/api/body')
        .set('content-type', 'application/json')
        .send({ payload: 'x'.repeat(1024 * 1024) })
        .expect(200)
        .expect(({ body }) => expect(body.payload).toHaveLength(1024 * 1024)));
  });

  it('keeps the parser predicates disjoint so internal MCP is never reparsed as ordinary API JSON', () => {
    const mcp = {
      originalUrl: '/internal/agent-runtime/mcp?request=1',
      url: '/internal/agent-runtime/mcp?request=1',
      path: '/internal/agent-runtime/mcp',
      headers: { 'content-type': 'application/json' },
    } as never;
    const api = {
      originalUrl: '/api/products',
      url: '/api/products',
      path: '/api/products',
      headers: { 'content-type': 'application/json' },
    } as never;

    expect(isMcpJsonRequest(mcp)).toBe(true);
    expect(isOrdinaryApiJsonRequest(mcp)).toBe(false);
    expect(isMcpJsonRequest(api)).toBe(false);
    expect(isOrdinaryApiJsonRequest(api)).toBe(true);
  });

  it('excludes exactly the fresh MCP route from the browser API prefix', () => {
    const setGlobalPrefix = vi.fn();

    configureApiGlobalPrefix({ setGlobalPrefix } as never);

    expect(setGlobalPrefix).toHaveBeenCalledWith('api', {
      exclude: [{ path: 'internal/agent-runtime/mcp', method: expect.any(Number) }],
    });
    expect(setGlobalPrefix.mock.calls[0][1].exclude).toHaveLength(1);
  });
});
