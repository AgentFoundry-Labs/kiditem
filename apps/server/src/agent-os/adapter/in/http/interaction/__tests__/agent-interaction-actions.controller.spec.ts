import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../../../../auth/auth.types';
import { AgentInteractionActionsController } from '../agent-interaction-actions.controller';
import { AuthorizeInteractionNavigationDto } from '../dto/agent-interaction.dto';

const user: AuthUser = {
  id: 'user-1',
  organizationId: 'organization-1',
  membershipId: 'membership-1',
  role: 'owner',
  type: 'human',
  email: 'operator@test.local',
};

describe('AgentInteractionActionsController', () => {
  it('accepts actionId only and derives actor scope from the authenticated request', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const dto = await pipe.transform({
      actionId: '11111111-1111-4111-8111-111111111111',
      organizationId: 'attacker-org',
      href: 'https://attacker.example',
    }, { type: 'body', metatype: AuthorizeInteractionNavigationDto });
    const presentation = { authorize: vi.fn().mockReturnValue({ href: '/agent-os' }) };
    const controller = new AgentInteractionActionsController(presentation as never);

    await expect(controller.authorize(user, 'organization-1', dto)).resolves.toEqual({
      href: '/agent-os',
    });
    expect(dto).toEqual({ actionId: '11111111-1111-4111-8111-111111111111' });
    expect(presentation.authorize).toHaveBeenCalledWith({
      organizationId: 'organization-1',
      userId: 'user-1',
      sessionId: null,
    }, dto.actionId);
  });
});
