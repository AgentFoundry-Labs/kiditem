import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { SKIP_AUTH_KEY } from '../../../../../auth/decorators/skip-auth.decorator';
import { SERVICE_AUTH_KEY } from '../../../../../auth/decorators/service-auth.decorator';
import { AgentOsBoundaryError } from '../../../../domain/agent-os.errors';
import { AgentInteractionControlController } from '../agent-interaction-control.controller';
import {
  AuthorizeInteractionConnectionDto,
  AuthorizeInteractionRunDto,
} from '../dto/agent-interaction.dto';
import {
  InteractionGatewayGuard,
  readRequiredInteractionSecret,
} from '../interaction-gateway.guard';
import type { AuthUser } from '../../../../../auth/auth.types';
import type { ExecutionContext } from '@nestjs/common';

const ORGANIZATION_ID = 'organization-1';
const USER_ID = 'user-1';
const THREAD_ID = 'thread-1';
const RUN_ID = 'run-1';
const GATEWAY_SECRET = Buffer.from('gateway-secret-at-least-thirty-two-bytes');
const dashboardContext = {
  routeKey: 'analytics.dashboard',
  resourceRefs: [],
  filters: {},
  visibleRowIds: [],
  aggregateSummary: {},
  locale: 'ko-KR',
  timezone: 'Asia/Seoul',
};
const userEvent = {
  externalEventId: 'message-1',
  schemaVersion: 1 as const,
  payload: { messageId: 'message-1', content: '재고를 확인해줘' },
};
const user: AuthUser = {
  id: USER_ID,
  organizationId: ORGANIZATION_ID,
  membershipId: 'membership-1',
  role: 'owner',
  type: 'human',
  email: 'operator@test.local',
};
const session = {
  sessionId: 'session-1',
  copilotThreadId: THREAD_ID,
  primaryAgentDefinitionKey: 'operator',
  primaryAgentVersionId: 'version-1',
  lifecycle: 'active' as const,
  updatedAt: '2026-08-14T00:00:00.000Z',
};

const timingSafeEqual = vi.hoisted(() =>
  vi.fn((left: Buffer, right: Buffer) => left.equals(right)),
);
vi.mock('node:crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:crypto')>()),
  timingSafeEqual,
}));

function harness() {
  const identity = {
    authorizeRun: vi.fn().mockResolvedValue({
      session,
      sessionTaskId: 'task-1',
      executionId: 'execution-1',
      modelIdentity: 'openai:gpt-5',
      runtimeType: 'operator',
      policySnapshotId: 'policy-1',
      contextEpoch: 1,
      dashboardContext,
    }),
    authorizeConnection: vi.fn().mockResolvedValue({
      session,
      contextEpoch: 1,
      replay: {
        sessionId: 'session-1',
        events: [],
        nextCursor: null,
        lastSequence: '0',
      },
      liveJoinToken: 'j'.repeat(64),
      liveJoinExpiresAt: '2026-08-14T00:00:15.000Z',
    }),
    health: vi.fn().mockResolvedValue({ status: 'ok' }),
  };
  return {
    identity,
    controller: new AgentInteractionControlController(identity as never),
  };
}

function context(
  handler: (...args: never[]) => unknown,
  headers: Record<string, unknown>,
): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => AgentInteractionControlController,
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('InteractionGatewayGuard', () => {
  it('uses timingSafeEqual after a length check and fails closed for missing or wrong secrets', () => {
    timingSafeEqual.mockClear();
    const guard = new InteractionGatewayGuard(GATEWAY_SECRET);
    const handler = AgentInteractionControlController.prototype.authorizeRun;

    expect(() => guard.canActivate(context(handler, {}))).toThrow(
      UnauthorizedException,
    );
    expect(() =>
      guard.canActivate(
        context(handler, { 'x-kiditem-interaction-gateway': 'wrong' }),
      ),
    ).toThrow(UnauthorizedException);
    expect(timingSafeEqual).not.toHaveBeenCalled();

    expect(
      guard.canActivate(
        context(handler, {
          'x-kiditem-interaction-gateway': GATEWAY_SECRET.toString('utf8'),
        }),
      ),
    ).toBe(true);
    expect(timingSafeEqual).toHaveBeenCalledTimes(1);
  });

  it('marks run authorization as service-authenticated while connection still requires the browser session', () => {
    expect(
      Reflect.getMetadata(
        SERVICE_AUTH_KEY,
        AgentInteractionControlController.prototype.authorizeRun,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        SERVICE_AUTH_KEY,
        AgentInteractionControlController.prototype.authorizeConnection,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        SKIP_AUTH_KEY,
        AgentInteractionControlController.prototype.health,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        SKIP_AUTH_KEY,
        AgentInteractionControlController.prototype.authorizeRun,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AgentInteractionControlController),
    ).toContain(InteractionGatewayGuard);
  });

  it('rejects absent and short required server-only environment secrets', () => {
    expect(() => readRequiredInteractionSecret('TEST_SECRET', undefined)).toThrow();
    expect(() => readRequiredInteractionSecret('TEST_SECRET', 'too-short')).toThrow();
    expect(
      readRequiredInteractionSecret(
        'TEST_SECRET',
        'a-secret-that-is-definitely-at-least-32-bytes',
      ),
    ).toBeInstanceOf(Buffer);
  });
});

describe('interaction control DTO and controller boundary', () => {
  it('strips every client-supplied authority field from run and connection DTOs', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const forbidden = {
      organizationId: 'forged-organization',
      userId: 'forged-user',
      modelIdentity: 'forged-model',
      policySnapshotId: 'forged-policy',
      sessionId: 'forged-session',
      capabilityKeys: ['forged-capability'],
    };
    const run = await pipe.transform(
      {
        runIntent: 'r'.repeat(64),
        copilotThreadId: THREAD_ID,
        aguiRunId: RUN_ID,
        dashboardContext,
        userEvent,
        ...forbidden,
      },
      { type: 'body', metatype: AuthorizeInteractionRunDto },
    );
    const connection = await pipe.transform(
      { copilotThreadId: THREAD_ID, cursor: 'c'.repeat(32), ...forbidden },
      { type: 'body', metatype: AuthorizeInteractionConnectionDto },
    );

    for (const dto of [run, connection]) {
      for (const key of Object.keys(forbidden)) {
        expect(dto).not.toHaveProperty(key);
      }
    }
  });

  it('authorizes a run solely from the signed intent and immutable request echo', async () => {
    const { controller, identity } = harness();
    const dto = Object.assign(new AuthorizeInteractionRunDto(), {
      runIntent: 'r'.repeat(64),
      copilotThreadId: THREAD_ID,
      aguiRunId: RUN_ID,
      dashboardContext,
      userEvent,
    });

    await controller.authorizeRun(dto);

    expect(identity.authorizeRun).toHaveBeenCalledWith({
      runIntent: dto.runIntent,
      copilotThreadId: THREAD_ID,
      aguiRunId: RUN_ID,
      dashboardContext,
      userEvent,
    });
  });

  it('authorizes reconnect from the browser session, thread, and opaque cursor only', async () => {
    const { controller, identity } = harness();
    const dto = Object.assign(new AuthorizeInteractionConnectionDto(), {
      copilotThreadId: THREAD_ID,
      cursor: 'c'.repeat(32),
    });

    await controller.authorizeConnection(user, ORGANIZATION_ID, dto);

    expect(identity.authorizeConnection).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      copilotThreadId: THREAD_ID,
      cursor: 'c'.repeat(32),
    });
  });

  it.each([
    ['INTERACTION_REQUEST_INVALID', BadRequestException],
    ['INTERACTION_RUN_INTENT_INVALID', UnauthorizedException],
    ['INTERACTION_REPLAY_CURSOR_INVALID', UnauthorizedException],
    ['INTERACTION_REPLAY_CURSOR_EXPIRED', UnauthorizedException],
    ['INTERACTION_CONNECTION_NOT_AUTHORIZED', ForbiddenException],
    ['INTERACTION_REPLAY_CURSOR_MISMATCH', ForbiddenException],
    ['INTERACTION_RUN_CONFLICT', ConflictException],
    ['INTERACTION_AGENT_REGISTRY_UNAVAILABLE', ServiceUnavailableException],
  ])('maps %s to a stable non-200 exception', async (code, ExceptionType) => {
    const { controller, identity } = harness();
    identity.authorizeRun.mockRejectedValueOnce(new AgentOsBoundaryError(code));

    await expect(
      controller.authorizeRun(
        Object.assign(new AuthorizeInteractionRunDto(), {
          runIntent: 'r'.repeat(64),
          copilotThreadId: THREAD_ID,
          aguiRunId: RUN_ID,
          dashboardContext,
          userEvent,
        }),
      ),
    ).rejects.toBeInstanceOf(ExceptionType);
  });

  it('health returns only ok after the registry and database probe', async () => {
    const { controller, identity } = harness();

    await expect(controller.health()).resolves.toEqual({ status: 'ok' });
    expect(identity.health).toHaveBeenCalledTimes(1);
  });
});
