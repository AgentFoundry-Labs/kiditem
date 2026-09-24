import {
  Controller,
  Get,
  Module,
  ServiceUnavailableException,
  type INestApplication,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { AuthService, AUTH_SESSION_COOKIE } from '../application/auth.service';
import { ERROR_DEFINITIONS } from '@kiditem/shared/errors';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { SessionAuthMiddleware } from '../middleware/session-auth.middleware';

const AUTHENTICATED = {
  sessionId: '44444444-4444-4444-8444-444444444444',
  authUser: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'operator@example.com',
    type: 'human',
    role: 'owner',
    organizationId: '22222222-2222-4222-8222-222222222222',
    membershipId: '33333333-3333-4333-8333-333333333333',
  },
};

@Controller('session-auth-http-probe')
class SessionAuthHttpProbeController {
  readonly handler = vi.fn(() => ({ ok: true }));

  @Get()
  get(): { ok: boolean } {
    return this.handler();
  }
}

function createSessionAuthHttpProbeModule(authService: AuthService) {
  @Module({
    controllers: [SessionAuthHttpProbeController],
    providers: [
      SessionAuthMiddleware,
      { provide: AuthService, useValue: authService },
    ],
  })
  class SessionAuthHttpProbeModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
      consumer.apply(SessionAuthMiddleware).forRoutes(SessionAuthHttpProbeController);
    }
  }

  return SessionAuthHttpProbeModule;
}

function makeService(authenticateToken: ReturnType<typeof vi.fn>): AuthService {
  return { authenticateToken } as unknown as AuthService;
}

describe('SessionAuthMiddleware', () => {
  it('passes through when no bearer or KidItem session cookie exists', async () => {
    const authenticateToken = vi.fn();
    const middleware = new SessionAuthMiddleware(makeService(authenticateToken));
    const req = { headers: {}, cookies: {} } as any;
    const next = vi.fn();

    await middleware.use(req, {} as any, next);

    expect(authenticateToken).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('never sends private MCP or exact Gateway installation bearers to the browser-session database lookup', async () => {
    const authenticateToken = vi.fn();
    const middleware = new SessionAuthMiddleware(makeService(authenticateToken));
    const next = vi.fn();
    const req = {
      originalUrl: '/internal/agent-runtime/mcp?trace=1',
      headers: { authorization: `Bearer ${'execution-token'.repeat(8)}` },
      cookies: {},
    } as any;

    await middleware.use(req, {} as any, next);

    expect(authenticateToken).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();

    const gatewayRequest = {
      originalUrl: '/internal/agent-runtime/gateway/commands:poll',
      headers: { authorization: `Bearer ${'gateway-token'.repeat(8)}` },
      cookies: {},
    } as any;
    await middleware.use(gatewayRequest, {} as any, vi.fn());
    expect(authenticateToken).not.toHaveBeenCalled();
  });

  it('authenticates a bearer token and attaches the existing AuthUser contract', async () => {
    const authenticateToken = vi.fn().mockResolvedValue(AUTHENTICATED);
    const middleware = new SessionAuthMiddleware(makeService(authenticateToken));
    const req = { headers: { authorization: `Bearer ${'a'.repeat(43)}` } } as any;
    const next = vi.fn();

    await middleware.use(req, {} as any, next);

    expect(authenticateToken).toHaveBeenCalledWith('a'.repeat(43));
    expect(req.authUser).toEqual(AUTHENTICATED.authUser);
    expect(req.authSessionId).toBe(AUTHENTICATED.sessionId);
    expect(next).toHaveBeenCalledOnce();
  });

  it('uses the HttpOnly KidItem cookie when no bearer token exists', async () => {
    const authenticateToken = vi.fn().mockResolvedValue(AUTHENTICATED);
    const middleware = new SessionAuthMiddleware(makeService(authenticateToken));
    const req = { headers: {}, cookies: { [AUTH_SESSION_COOKIE]: 'b'.repeat(43) } } as any;

    await middleware.use(req, {} as any, vi.fn());

    expect(authenticateToken).toHaveBeenCalledWith('b'.repeat(43));
    expect(req.authUser).toEqual(AUTHENTICATED.authUser);
  });

  it('prefers bearer over cookie and does not fall back after an invalid bearer token', async () => {
    const authenticateToken = vi.fn().mockResolvedValue(null);
    const middleware = new SessionAuthMiddleware(makeService(authenticateToken));
    const clearCookie = vi.fn();
    const req = {
      headers: { authorization: `Bearer ${'a'.repeat(43)}` },
      cookies: { [AUTH_SESSION_COOKIE]: 'b'.repeat(43) },
    } as any;

    await middleware.use(req, { clearCookie } as any, vi.fn());

    expect(authenticateToken).toHaveBeenCalledTimes(1);
    expect(authenticateToken).toHaveBeenCalledWith('a'.repeat(43));
    expect(clearCookie).not.toHaveBeenCalled();
    expect(req.authUser).toBeUndefined();
  });

  it('clears an invalid session cookie and leaves enforcement to the global guard', async () => {
    const authenticateToken = vi.fn().mockResolvedValue(null);
    const middleware = new SessionAuthMiddleware(makeService(authenticateToken));
    const clearCookie = vi.fn();
    const req = { headers: {}, cookies: { [AUTH_SESSION_COOKIE]: 'x'.repeat(43) } } as any;
    const next = vi.fn();

    await middleware.use(req, { clearCookie } as any, next);

    expect(clearCookie).toHaveBeenCalledWith(
      AUTH_SESSION_COOKIE,
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
    );
    expect(req.authUser).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('fails closed with 503 and retains the session cookie when lookup is unavailable', async () => {
    const token = 'x'.repeat(43);
    const lookupError = new Error(`database outage for token ${token}`);
    const authenticateToken = vi.fn().mockRejectedValue(lookupError);
    const middleware = new SessionAuthMiddleware(makeService(authenticateToken));
    const clearCookie = vi.fn();
    const req = { headers: {}, cookies: { [AUTH_SESSION_COOKIE]: token } } as any;
    const next = vi.fn();

    const rejection = await middleware
      .use(req, { clearCookie } as any, next)
      .catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(ServiceUnavailableException);
    const serviceUnavailable = rejection as ServiceUnavailableException;
    expect(serviceUnavailable.getStatus()).toBe(503);
    expect(serviceUnavailable.getResponse()).toEqual({
      statusCode: 503,
      message: 'Authentication service unavailable',
      error: 'Service Unavailable',
    });
    expect(JSON.stringify(serviceUnavailable.getResponse())).not.toContain(token);
    expect(JSON.stringify(serviceUnavailable.getResponse())).not.toContain('database outage');
    expect(authenticateToken).toHaveBeenCalledWith(token);
    expect(req.authUser).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
    expect(clearCookie).not.toHaveBeenCalled();
  });

  it('serializes lookup failures as a safe HTTP 503 without deleting the cookie or invoking the handler', async () => {
    const token = 'x'.repeat(43);
    const lookupError = new Error(`database outage for token ${token}`);
    const authenticateToken = vi.fn().mockRejectedValue(lookupError);
    const moduleRef = await Test.createTestingModule({
      imports: [createSessionAuthHttpProbeModule(makeService(authenticateToken))],
    }).compile();
    const app: INestApplication = moduleRef.createNestApplication({ logger: false });
    app.use(cookieParser());
    app.useGlobalFilters(new GlobalExceptionFilter());

    try {
      await app.init();
      const controller = app.get(SessionAuthHttpProbeController);
      const response = await request(app.getHttpServer())
        .get('/session-auth-http-probe')
        .set('Cookie', `${AUTH_SESSION_COOKIE}=${token}`)
        .expect(503);

      expect(response.body).toEqual({
        statusCode: 503,
        code: 'SERVICE_UNAVAILABLE',
        kind: 'external',
        message: ERROR_DEFINITIONS.SERVICE_UNAVAILABLE.text,
        errors: [],
      });
      expect(JSON.stringify(response.body)).not.toContain(token);
      expect(JSON.stringify(response.body)).not.toContain('database outage');
      expect(response.headers['set-cookie'] ?? []).not.toContainEqual(
        expect.stringContaining(`${AUTH_SESSION_COOKIE}=`),
      );
      expect(authenticateToken).toHaveBeenCalledWith(token);
      expect(controller.handler).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
