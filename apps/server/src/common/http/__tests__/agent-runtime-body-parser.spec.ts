import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  configureAgentRuntimeBodyParsers,
  isGatewayControlJsonRequest,
  isMcpJsonRequest,
  isOrdinaryApiJsonRequest,
} from '../agent-runtime-body-parser';
import { configureApiGlobalPrefix } from '../agent-runtime-route';

describe('generic API and Agent runtime JSON parser composition', () => {
  it('keeps ordinary API JSON at 25MiB, MCP at 512KiB, and each exact Gateway control route at 64KiB', () => {
    const app = express();
    configureAgentRuntimeBodyParsers(app as never);
    app.post('/internal/agent-runtime/mcp', (req, res) => res.status(200).json(req.body));
    app.post('/internal/agent-runtime/gateway/commands:poll', (req, res) => res.status(200).json(req.body));
    app.post('/internal/agent-runtime/gateway/events', (req, res) => res.status(200).json(req.body));
    app.post('/api/body', (req, res) => res.status(200).json(req.body));

    return request(app)
      .post('/internal/agent-runtime/mcp')
      .set('content-type', 'application/json')
      .send({ payload: 'x'.repeat(513 * 1024) })
      .expect(413)
      .then(() => request(app)
        .post('/internal/agent-runtime/gateway/commands:poll')
        .set('content-type', 'application/json')
        .send({ payload: 'x'.repeat(65 * 1024) })
        .expect(413))
      .then(() => request(app)
        .post('/internal/agent-runtime/gateway/events')
        .set('content-type', 'application/json')
        .send({ payload: 'x'.repeat(65 * 1024) })
        .expect(413))
      .then(() => request(app)
        .post('/api/body')
        .set('content-type', 'application/json')
        .send({ payload: 'x'.repeat(1024 * 1024) })
        .expect(200)
        .expect(({ body }) => expect(body.payload).toHaveLength(1024 * 1024)));
  });

  it('keeps the parser predicates disjoint so only exact internal MCP/Gateway routes bypass ordinary API JSON', () => {
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
    const gateway = {
      originalUrl: '/internal/agent-runtime/gateway/commands:poll?request=1',
      url: '/internal/agent-runtime/gateway/commands:poll?request=1',
      path: '/internal/agent-runtime/gateway/commands:poll',
      headers: { 'content-type': 'application/json' },
    } as never;
    const unrelatedInternal = {
      originalUrl: '/internal/not-gateway', url: '/internal/not-gateway', path: '/internal/not-gateway',
      headers: { 'content-type': 'application/json' },
    } as never;

    expect(isMcpJsonRequest(mcp)).toBe(true);
    expect(isOrdinaryApiJsonRequest(mcp)).toBe(false);
    expect(isMcpJsonRequest(api)).toBe(false);
    expect(isOrdinaryApiJsonRequest(api)).toBe(true);
    expect(isGatewayControlJsonRequest(gateway)).toBe(true);
    expect(isOrdinaryApiJsonRequest(gateway)).toBe(false);
    expect(isGatewayControlJsonRequest(unrelatedInternal)).toBe(false);
    expect(isOrdinaryApiJsonRequest(unrelatedInternal)).toBe(false);
  });

  it('excludes only MCP and the two exact Gateway control routes from the browser API prefix', () => {
    const setGlobalPrefix = vi.fn();

    configureApiGlobalPrefix({ setGlobalPrefix } as never);

    expect(setGlobalPrefix).toHaveBeenCalledWith('api', {
      exclude: [
        { path: 'internal/agent-runtime/mcp', method: expect.any(Number) },
        { path: 'internal/agent-runtime/gateway/commands:poll', method: expect.any(Number) },
        { path: 'internal/agent-runtime/gateway/events', method: expect.any(Number) },
      ],
    });
    expect(setGlobalPrefix.mock.calls[0][1].exclude).toHaveLength(3);
  });
});
