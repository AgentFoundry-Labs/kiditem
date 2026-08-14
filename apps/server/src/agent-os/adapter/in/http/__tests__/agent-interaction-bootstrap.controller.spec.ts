import {
  BadRequestException,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AgentOsBoundaryError } from '../../../../domain/agent-os.errors';
import { AgentInteractionBootstrapController } from '../agent-interaction-bootstrap.controller';
import { PrepareInteractionRunIntentDto } from '../dto/agent-interaction.dto';
import type { AuthUser } from '../../../../../auth/auth.types';

const ORGANIZATION_ID = 'organization-1';
const USER_ID = 'user-1';
const THREAD_ID = 'thread-1';
const RUN_ID = 'run-1';
const SESSION_NAME =
  'organizations/organization-1/agentSessions/session-1';
const AGENT_VERSION_NAME = 'agentDefinitions/operator/versions/1';
const user: AuthUser = {
  id: USER_ID,
  organizationId: ORGANIZATION_ID,
  membershipId: 'membership-1',
  role: 'owner',
  type: 'human',
  email: 'operator@test.local',
};
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
  payload: {
    phase: 'complete' as const,
    messageId: 'message-1',
    content: '재고를 확인해줘',
  },
};
const bootstrap = {
  defaultAgentDefinitionKey: 'operator',
  agents: [
    {
      agentDefinitionKey: 'operator',
      agentVersion: AGENT_VERSION_NAME,
      displayName: 'Operator',
      description: 'KidItem Operator',
      isDefault: true,
    },
  ],
  sessions: [
    {
      name: SESSION_NAME,
      copilotThreadId: THREAD_ID,
      primaryAgentDefinitionKey: 'operator',
      primaryAgentVersion: AGENT_VERSION_NAME,
      lifecycle: 'active' as const,
      updatedAt: '2026-08-14T00:00:00.000Z',
    },
  ],
};

function harness() {
  const identity = {
    bootstrap: vi.fn().mockResolvedValue(bootstrap),
    prepareRunIntent: vi.fn().mockResolvedValue({
      runIntent: 'r'.repeat(64),
      expiresAt: '2026-08-14T00:00:30.000Z',
      copilotThreadId: THREAD_ID,
      aguiRunId: RUN_ID,
    }),
  };
  return {
    identity,
    controller: new AgentInteractionBootstrapController(identity as never),
  };
}

describe('AgentInteractionBootstrapController', () => {
  it('derives browser scope from decorators and returns only canonical agents and sessions', async () => {
    const { controller, identity } = harness();

    await expect(controller.bootstrap(user, ORGANIZATION_ID)).resolves.toEqual(
      bootstrap,
    );
    expect(identity.bootstrap).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
    });
  });

  it('rejects an unsafe bootstrap projection instead of leaking authority fields', async () => {
    const { controller, identity } = harness();
    identity.bootstrap.mockResolvedValueOnce({
      ...bootstrap,
      modelIdentity: 'must-not-leak',
    } as never);

    await expect(controller.bootstrap(user, ORGANIZATION_ID)).rejects.toThrow();
  });

  it('prepares a run intent from server-derived identity and stripped dashboard context', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const dto = await pipe.transform(
      {
        agentDefinitionKey: 'operator',
        copilotThreadId: THREAD_ID,
        aguiRunId: RUN_ID,
        dashboardContext: {
          ...dashboardContext,
          organizationId: 'forged-organization',
          modelIdentity: 'forged-model',
        },
        userEvent,
        organizationId: 'forged-organization',
        userId: 'forged-user',
        modelIdentity: 'forged-model',
        policySnapshotId: 'forged-policy',
        sessionId: 'forged-session',
        capabilityKeys: ['forged-capability'],
      },
      { type: 'body', metatype: PrepareInteractionRunIntentDto },
    );
    const { controller, identity } = harness();

    await controller.prepareRunIntent(user, ORGANIZATION_ID, dto);

    expect(dto).not.toHaveProperty('organizationId');
    expect(dto).not.toHaveProperty('userId');
    expect(identity.prepareRunIntent).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      agentDefinitionKey: 'operator',
      copilotThreadId: THREAD_ID,
      aguiRunId: RUN_ID,
      dashboardContext,
      userEvent,
    });
  });

  it.each([
    ['INTERACTION_USER_EVENT_INVALID', BadRequestException],
    ['INTERACTION_AGENT_REGISTRY_UNAVAILABLE', ServiceUnavailableException],
  ])('maps %s to a stable browser-facing exception', async (code, ExceptionType) => {
    const { controller, identity } = harness();
    identity.prepareRunIntent.mockRejectedValueOnce(
      new AgentOsBoundaryError(code),
    );

    await expect(
      controller.prepareRunIntent(
        user,
        ORGANIZATION_ID,
        Object.assign(new PrepareInteractionRunIntentDto(), {
          agentDefinitionKey: 'operator',
          copilotThreadId: THREAD_ID,
          aguiRunId: RUN_ID,
          dashboardContext,
          userEvent,
        }),
      ),
    ).rejects.toBeInstanceOf(ExceptionType);
  });
});
